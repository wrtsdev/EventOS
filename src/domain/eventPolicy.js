// Which permission each part of an event needs, and what each role may read.
// Shared by the server (enforcement) and the browser (hiding controls).

import { can, redactIncident } from './access.js';
import { CHECKLIST_ITEMS } from './controls.js';

export const IMMUTABLE_KEYS = ['id', 'organizationId', 'slug', 'createdAt', 'createdBy', 'version'];

const KEY_PERMS = {
  budget: 'finance.edit',
  budgetApproval: 'finance.edit',
  revenueGoal: 'finance.edit',
  budgetGoal: 'finance.edit',
  risks: 'safety.edit',
  contacts: 'safety.edit',
  weather: 'safety.edit',
  incidents: 'incidents.edit',
  workforce: 'workforce.edit',
  partners: 'partners.edit',
  outcomes: 'partners.edit',
  distribution: 'partners.edit',
  deliverables: 'partners.edit',
  sponsorCommitments: 'partners.edit',
  sponsors: 'partners.edit',
};

const FINANCE_KEYS = ['budget', 'budgetApproval', 'revenueGoal', 'budgetGoal'];

export function permForControlId(id) {
  const item = CHECKLIST_ITEMS.find((c) => c.id === id);
  const epic = item?.epic ?? 'I';
  return epic === 'E' ? 'finance.edit' : epic === 'P' ? 'safety.edit' : 'event.edit';
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Checks a top-level patch against the role. Returns { ok, error, key }.
 * `current` is the stored event.
 */
export function checkPatch(role, current, patch) {
  for (const key of Object.keys(patch)) {
    if (IMMUTABLE_KEYS.includes(key)) return { ok: false, error: `${key} cannot be changed`, key };
    if (key === 'checklist') {
      const before = current.checklist ?? {};
      const after = patch.checklist ?? {};
      const changed = new Set([...Object.keys(before), ...Object.keys(after)].filter((k) => before[k] !== after[k]));
      for (const id of changed) if (!can(role, permForControlId(id))) return { ok: false, error: 'Your role cannot update this control', key };
      continue;
    }
    if (key === 'messages') {
      const before = Object.fromEntries((current.messages ?? []).map((m) => [m.id, m]));
      for (const m of patch.messages ?? []) {
        const was = before[m.id];
        const approving = m.status !== 'draft' && (!was || was.status === 'draft');
        if (approving && !can(role, 'comms.approve')) return { ok: false, error: 'Only approvers can approve messages', key };
      }
      if (!can(role, 'event.edit') && !can(role, 'comms.approve')) return { ok: false, error: 'Your role cannot change messages', key };
      continue;
    }
    const perm = KEY_PERMS[key] ?? 'event.edit';
    if (!can(role, perm)) return { ok: false, error: 'Your role cannot make this change', key };
  }
  return { ok: true };
}

/** Merge incident edits so a redacted copy can never overwrite the stored record. */
export function mergeIncidents(stored = [], incoming = []) {
  const byId = Object.fromEntries(stored.map((i) => [i.id, i]));
  const out = incoming.map((i) => {
    const s = byId[i.id];
    if (!s) return { ...i, redacted: undefined };
    if (i.redacted) return { ...s, status: i.status ?? s.status };
    return { ...s, ...i, redacted: undefined };
  });
  // Incidents are never deleted through an edit.
  for (const s of stored) if (!out.some((o) => o.id === s.id)) out.push(s);
  return out;
}

/** What a role may read. */
export function redactEventForRole(event, role) {
  const e = { ...event };
  if (Array.isArray(e.incidents)) e.incidents = e.incidents.map((i) => redactIncident(i, role));
  if (!can(role, 'finance.view')) {
    for (const k of FINANCE_KEYS) delete e[k];
    e.redactedKeys = [...(e.redactedKeys ?? []), ...FINANCE_KEYS];
  }
  return e;
}

/** Top-level keys whose values differ (the patch the browser sends). */
export function diffEvent(before, after) {
  const patch = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (k === 'redactedKeys' || IMMUTABLE_KEYS.includes(k)) continue;
    if (!same(before[k], after[k])) patch[k] = after[k] === undefined ? null : after[k];
  }
  return patch;
}
