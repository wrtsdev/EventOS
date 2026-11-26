// Identity governance building blocks (EventOS 1.0 directive, sections 4 and 5):
// account states, the master administrator bootstrap, two-step sign-in (TOTP),
// and the transactional email queue.
//
// Proprietary and confidential. © We Run These Streetz LLC.

import crypto from 'node:crypto';
import { newId, sha256, encrypt, decrypt } from './security.js';
import { audit } from './audit.js';
import { log } from './log.js';

// ---------------------------------------------------------------------------
// Account states
// ---------------------------------------------------------------------------

export const ACCOUNT_STATES = {
  unverified: 'Unverified',
  pending_approval: 'Pending approval',
  info_required: 'Additional information required',
  approved: 'Approved',
  active: 'Active',
  suspended: 'Suspended',
  denied: 'Denied',
  deactivated: 'Deactivated',
  archived: 'Archived',
};

/** States that may sign in. 'approved' becomes 'active' on the first sign-in. */
export const CAN_SIGN_IN = new Set(['approved', 'active']);

/** What a person sees when their (correct) password meets a non-active account. */
export function blockedMessage(status) {
  switch (status) {
    case 'unverified':
      return 'Verify your email address first. We sent you a new verification link.';
    case 'pending_approval':
      return 'Your account request is waiting for approval by We Run These Streetz. We’ll email you when it’s reviewed.';
    case 'info_required':
      return 'We need a little more information about your request. Check your email for the link to reply.';
    default:
      return 'This account can’t sign in. Contact We Run These Streetz at sales@werunthesestreetz.com.';
  }
}

export const PILLARS = ['wealth', 'wellness', 'wisdom', 'work'];
export const REQUESTED_ROLES = {
  org_admin: 'Organization owner or administrator',
  coordinator: 'Event or program coordinator',
  partner: 'Partner or sponsor',
  employer: 'Employer',
  educator: 'Educator or facilitator',
  other: 'Other',
};
// Accepted with each account request. Replace when WRTS publishes approved legal documents.
export const TERMS_VERSION = 'pending-legal-review-2026-11';

// ---------------------------------------------------------------------------
// TOTP two-step sign-in (RFC 6238: SHA-1, 30-second steps, 6 digits)
// ---------------------------------------------------------------------------

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s) {
  const clean = String(s).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totpCode(secretB32, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', base32Decode(secretB32)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

export const totpCounter = (now = Date.now()) => Math.floor(now / 30_000);

/** Returns the matching time step (one step of clock drift allowed), or null. Rejects reuse of a step already used. */
export function verifyTotp(secretB32, code, lastCounter = null, now = Date.now()) {
  const c = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const t = totpCounter(now);
  for (const step of [t - 1, t, t + 1]) {
    if (lastCounter != null && step <= Number(lastCounter)) continue;
    const expected = totpCode(secretB32, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(c))) return step;
  }
  return null;
}

export const newTotpSecret = () => base32Encode(crypto.randomBytes(20));

export function otpauthUrl(secretB32, email) {
  const label = encodeURIComponent(`EventOS:${email}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent('EventOS (WRTS)')}&algorithm=SHA1&digits=6&period=30`;
}

/** Ten one-time recovery codes, shown once; only their hashes are stored. */
export function newRecoveryCodes() {
  const codes = Array.from({ length: 10 }, () => {
    const raw = base32Encode(crypto.randomBytes(5)).toLowerCase().slice(0, 8);
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
  return { codes, stored: JSON.stringify(codes.map((c) => sha256(c))) };
}

/**
 * Checks a two-step code (authenticator code or recovery code) for a user row and
 * records its use. Returns 'totp', 'recovery' or null.
 */
export async function checkSecondFactor(db, cfg, user, code) {
  if (!user.mfa_secret) return null;
  const secret = decrypt(cfg.appSecret, user.mfa_secret);
  const step = verifyTotp(secret, code, user.mfa_last_counter);
  if (step != null) {
    await db.query('UPDATE users SET mfa_last_counter = :c WHERE id = :id', { c: step, id: user.id });
    return 'totp';
  }
  const cleaned = String(code ?? '').trim().toLowerCase();
  const hashes = JSON.parse(user.mfa_recovery_codes || '[]');
  const i = hashes.indexOf(sha256(cleaned));
  if (i >= 0) {
    hashes.splice(i, 1);
    await db.query('UPDATE users SET mfa_recovery_codes = :r WHERE id = :id', { r: JSON.stringify(hashes), id: user.id });
    await audit(db, { userId: user.id, action: 'auth.mfa_recovery_code_used', detail: { remaining: hashes.length } });
    return 'recovery';
  }
  return null;
}

export const encryptSecret = (cfg, s) => encrypt(cfg.appSecret, s);

// ---------------------------------------------------------------------------
// Master administrator bootstrap
// ---------------------------------------------------------------------------

export async function masterExists(db) {
  return Boolean(await db.one('SELECT id FROM users WHERE is_master = 1 LIMIT 1'));
}

/**
 * Run at startup. If no master administrator exists yet and MASTER_ADMIN_EMAIL
 * names an existing account, that account becomes the master administrator.
 * Once a master exists this does nothing, so changing the setting later can't
 * take over the platform. Returns what happened.
 */
export async function bootstrapMaster(db, cfg) {
  if (!cfg.masterEmail) return 'not configured';
  if (await masterExists(db)) return 'exists';
  const user = await db.one('SELECT id, email FROM users WHERE email = :e', { e: cfg.masterEmail });
  if (!user) return 'awaiting account';
  await promoteToMaster(db, user.id, { via: 'startup' });
  return 'promoted';
}

export async function promoteToMaster(db, userId, detail = {}) {
  await db.query(
    "UPDATE users SET is_master = 1, is_platform_admin = 1, status = 'active', status_reason = NULL, status_changed_at = UTC_TIMESTAMP(), email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP()) WHERE id = :id",
    { id: userId },
  );
  await db.query("UPDATE account_requests SET status = 'approved', reviewed_at = UTC_TIMESTAMP(), decision_note = 'Master administrator bootstrap' WHERE user_id = :id AND status IN ('pending_approval', 'unverified', 'info_required')", { id: userId });
  await audit(db, { userId, action: 'platform.master_bootstrap', entity: 'user', entityId: userId, detail });
  log.info('master administrator designated', { userId });
}

/** Email addresses that receive administrative notifications: the master administrator(s), else the configured address. */
export async function adminRecipients(db, cfg) {
  const rows = await db.query("SELECT email FROM users WHERE is_master = 1 AND status = 'active'");
  const list = rows.map((r) => r.email);
  if (!list.length && cfg.masterEmail) list.push(cfg.masterEmail);
  return list;
}

// ---------------------------------------------------------------------------
// Transactional email queue
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = 8;
const BACKOFF_MIN = [1, 5, 15, 30, 60, 120, 240, 480];

/**
 * Queue-first email: every account email is stored before sending, so delivery
 * can be tracked, retried and inspected in the admin center even when SMTP is down.
 * A dedupe key makes repeated triggers send one email.
 */
export function createOutbox(db, mailer) {
  let running = null;

  async function processOutbox({ limit = 20 } = {}) {
    // Rows left 'sending' by a crash go back to the queue.
    await db.query("UPDATE email_outbox SET status = 'queued' WHERE status = 'sending' AND next_attempt_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE)");
    const due = await db.query("SELECT * FROM email_outbox WHERE status = 'queued' AND next_attempt_at <= UTC_TIMESTAMP() ORDER BY created_at LIMIT " + Number(limit));
    let sent = 0;
    for (const m of due) {
      const claim = await db.query("UPDATE email_outbox SET status = 'sending', next_attempt_at = UTC_TIMESTAMP() WHERE id = :id AND status = 'queued'", { id: m.id });
      if (!claim?.affectedRows) continue;
      if (!mailer.configured) {
        await db.query("UPDATE email_outbox SET status = 'queued', last_error = 'Email is not configured on the server (SMTP settings).', next_attempt_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE) WHERE id = :id", { id: m.id });
        continue;
      }
      try {
        await mailer.send({ to: m.to_email, subject: m.subject, text: m.body });
        await db.query("UPDATE email_outbox SET status = 'sent', attempts = attempts + 1, sent_at = UTC_TIMESTAMP(), last_error = NULL WHERE id = :id", { id: m.id });
        sent += 1;
      } catch (e) {
        const attempts = m.attempts + 1;
        const failed = attempts >= MAX_ATTEMPTS;
        await db.query(
          `UPDATE email_outbox SET status = :s, attempts = :a, last_error = :err, next_attempt_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL :mins MINUTE) WHERE id = :id`,
          { s: failed ? 'failed' : 'queued', a: attempts, err: String(e?.message || e).slice(0, 500), mins: BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)], id: m.id },
        );
        log.error('email delivery failed', { id: m.id, kind: m.kind, attempts, final: failed, error: String(e?.message || e) });
      }
    }
    return sent;
  }

  function kick() {
    if (running) return running;
    running = processOutbox()
      .catch((e) => log.error('email queue run failed', { error: String(e) }))
      .finally(() => {
        running = null;
      });
    return running;
  }

  return {
    async queue({ kind, to, subject, body, dedupeKey = null, relatedEntity = null, relatedId = null }) {
      const id = newId('eml');
      const r = await db.query(
        'INSERT IGNORE INTO email_outbox (id, dedupe_key, kind, to_email, subject, body, related_entity, related_id) VALUES (:id, :d, :k, :t, :s, :b, :re, :ri)',
        { id, d: dedupeKey, k: kind, t: to, s: subject, b: body, re: relatedEntity, ri: relatedId },
      );
      kick();
      return r?.affectedRows ? id : null; // null: a duplicate was already queued
    },
    processOutbox,
    kick,
    start(intervalMs = 30_000) {
      const t = setInterval(kick, intervalMs);
      t.unref?.();
      kick();
      return t;
    },
  };
}
