import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { SAMPLE_EVENTS, SAMPLE_ORG, SAMPLE_ORGS, SAMPLE_PASSPORT, SAMPLE_SNAPSHOTS } from './data/sampleData.js';
import { simulateEvent } from './domain/simulate.js';
import { migrateState, SCHEMA_VERSION } from './domain/migrate.js';
import { can, eventsForSession, getEventForSession, snapshotsForSession } from './domain/access.js';

const KEY_V2 = 'wrts-eventos:v2';
const KEY_V1 = 'wrts-eventos:v1';

// Browser storage is a per-device convenience for the prototype. It is not the
// system of record; production uses the multi-tenant API described in
// docs/EPIC_EXPANSION.md.
const DEFAULTS = { orgs: SAMPLE_ORGS, events: SAMPLE_EVENTS, passport: SAMPLE_PASSPORT, snapshots: SAMPLE_SNAPSHOTS };

function load() {
  try {
    const v2 = localStorage.getItem(KEY_V2);
    if (v2) return migrateState(JSON.parse(v2), DEFAULTS);
    const v1 = localStorage.getItem(KEY_V1);
    if (v1) return migrateState(JSON.parse(v1), DEFAULTS);
  } catch {
    /* unreadable: start fresh */
  }
  return null;
}
function save(state) {
  try {
    const { orgs, session, events, passport, snapshots } = state;
    localStorage.setItem(KEY_V2, JSON.stringify({ schemaVersion: SCHEMA_VERSION, orgs, session, events, passport, snapshots }));
  } catch {
    /* storage unavailable: keep working in memory */
  }
}

const VIEWS = ['home', 'builder', 'passport', 'copilot', 'gateway', 'plans', 'privacy', 'settings'];

function initialView() {
  try {
    const h = (location.hash || '').replace('#', '');
    if (VIEWS.includes(h)) return { name: h };
  } catch {
    /* ignore */
  }
  return { name: 'home' };
}

function init() {
  const saved = load();
  return {
    schemaVersion: SCHEMA_VERSION,
    orgs: saved?.orgs ?? DEFAULTS.orgs,
    session: saved?.session ?? null,
    events: saved?.events ?? DEFAULTS.events,
    passport: saved?.passport ?? DEFAULTS.passport,
    snapshots: saved?.snapshots ?? DEFAULTS.snapshots,
    view: initialView(),
    toast: null,
  };
}

/** Permission needed to change a checklist control, by EPIC domain. */
export function permForControl(epic) {
  return epic === 'E' ? 'finance.edit' : epic === 'P' ? 'safety.edit' : 'event.edit';
}

function denied(state, msg = 'Your role cannot make this change') {
  return { ...state, toast: msg };
}

function reducer(state, action) {
  const role = state.session?.role;
  switch (action.type) {
    case 'createOrg':
      return { ...state, orgs: [...state.orgs, action.org], session: { orgId: action.org.id, role: 'owner' } };
    case 'setSession':
      return { ...state, session: action.session, view: { name: 'home' } };
    case 'setRole':
      return { ...state, session: { ...state.session, role: action.role } };
    case 'updateOrg': {
      if (!can(role, action.perm ?? 'org.admin')) return denied(state);
      return { ...state, orgs: state.orgs.map((o) => (o.id === state.session.orgId ? { ...o, ...action.patch } : o)) };
    }
    case 'navigate':
      return { ...state, view: action.view };
    case 'addEvent': {
      if (!can(role, 'event.edit')) return denied(state);
      const event = { ...action.event, organizationId: state.session.orgId };
      return { ...state, events: [event, ...state.events], view: { name: 'event', eventId: event.id, tab: action.tab ?? 'charter' } };
    }
    case 'updateEvent': {
      const e = getEventForSession(state, state.session, action.id);
      if (!e) return denied(state, 'Event not found');
      if (!can(role, action.perm ?? 'event.edit')) return denied(state);
      const patch = typeof action.patch === 'function' ? action.patch(e) : action.patch;
      if ('organizationId' in patch && patch.organizationId !== e.organizationId) return denied(state);
      return { ...state, events: state.events.map((x) => (x.id === action.id ? { ...x, ...patch } : x)), toast: action.toast ?? state.toast };
    }
    case 'setChecklist': {
      const e = getEventForSession(state, state.session, action.id);
      if (!e) return denied(state, 'Event not found');
      if (!can(role, permForControl(action.epic))) return denied(state, 'Your role cannot update this control');
      return { ...state, events: state.events.map((x) => (x.id === action.id ? { ...x, checklist: { ...x.checklist, [action.item]: action.status } } : x)) };
    }
    case 'addSnapshot':
      return { ...state, snapshots: [...state.snapshots.filter((s) => s.id !== action.snapshot.id), action.snapshot] };
    case 'setPassportPrivacy':
      return { ...state, passport: { ...state.passport, privacy: { ...state.passport.privacy, ...action.patch } } };
    case 'toast':
      return { ...state, toast: action.message };
    case 'reset':
      return { ...init(), orgs: DEFAULTS.orgs, events: DEFAULTS.events, passport: DEFAULTS.passport, snapshots: DEFAULTS.snapshots, session: null, view: { name: 'home' }, toast: 'Demo data restored' };
    default:
      return state;
  }
}

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);

  useEffect(() => save(state), [state.orgs, state.session, state.events, state.passport, state.snapshots]);

  useEffect(() => {
    if (!state.toast) return undefined;
    const t = setTimeout(() => dispatch({ type: 'toast', message: null }), 2800);
    return () => clearTimeout(t);
  }, [state.toast]);

  const navigate = useCallback((view) => {
    dispatch({ type: 'navigate', view: typeof view === 'string' ? { name: view } : view });
    try {
      window.scrollTo({ top: 0 });
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => {
    const org = state.orgs.find((o) => o.id === state.session?.orgId) ?? null;
    const role = state.session?.role ?? 'owner';
    return {
      state,
      dispatch,
      navigate,
      org,
      role,
      can: (perm) => can(role, perm),
      events: eventsForSession(state, state.session),
      snapshots: snapshotsForSession(state, state.session),
    };
  }, [state, navigate]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore must be inside StoreProvider');
  return ctx;
}

export function useEvent(id) {
  const { state } = useStore();
  return getEventForSession(state, state.session, id);
}

/** Simulated live data for an event; memoized on the event object. */
export function useSim(event) {
  const { org } = useStore();
  const o = org ?? SAMPLE_ORG;
  return useMemo(() => (event ? simulateEvent(event, o) : null), [event, o]);
}
