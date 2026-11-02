import crypto from 'node:crypto';

export const newId = (prefix) => `${prefix}_${crypto.randomBytes(12).toString('base64url')}`;
export const randomToken = () => crypto.randomBytes(32).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** AES-256-GCM for integration secrets at rest. */
function key(appSecret) {
  return crypto.createHash('sha256').update('eventos-secrets:' + appSecret).digest();
}
export function encrypt(appSecret, plaintext) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(appSecret), iv);
  const enc = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
export function decrypt(appSecret, payload) {
  const [iv, tag, enc] = payload.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(appSecret), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' https://js.stripe.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-src https://js.stripe.com https://checkout.stripe.com; form-action 'self' https://checkout.stripe.com; base-uri 'self'; frame-ancestors 'self'",
  );
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

/**
 * CSRF defense for cookie-authenticated writes: require a same-origin request
 * (Origin header matches PUBLIC_URL) plus a custom header that HTML forms
 * cannot send. Webhooks are exempt (they authenticate by signature).
 */
export function csrfGuard(publicUrl) {
  const allowed = new URL(publicUrl).origin;
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path.startsWith('/api/webhooks/')) return next();
    const origin = req.headers.origin;
    if (origin && origin !== allowed) return res.status(403).json({ error: 'cross-origin request refused' });
    if (req.headers['x-requested-with'] !== 'eventos') return res.status(403).json({ error: 'missing request header' });
    next();
  };
}

/** Fixed-window in-memory rate limiter (per process). */
export function rateLimit({ windowMs, max, key = (req) => req.ip }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const k = key(req);
    const h = hits.get(k);
    if (!h || now - h.start > windowMs) {
      hits.set(k, { start: now, n: 1 });
      if (hits.size > 10000) for (const [kk, v] of hits) if (now - v.start > windowMs) hits.delete(kk);
      return next();
    }
    h.n += 1;
    if (h.n > max) {
      res.setHeader('Retry-After', Math.ceil((h.start + windowMs - now) / 1000));
      return res.status(429).json({ error: 'Too many requests. Try again shortly.' });
    }
    next();
  };
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
export function str(v, max = 200) {
  if (v == null) return '';
  return String(v).trim().slice(0, max);
}
