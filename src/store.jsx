import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { SAMPLE_EVENTS, SAMPLE_ORG, SAMPLE_ORGS, SAMPLE_PASSPORT, SAMPLE_SNAPSHOTS } from './data/sampleData.js';
import { simulateEvent } from './domain/simulate.js';
import { liveMetrics } from './domain/live.js';
import { migrateState, SCHEMA_VERSION } from './domain/migrate.js';
import { can, eventsForSession, getEventForSession, snapshotsForSession } from './domain/access.js';
import { diffEvent } from './domain/eventPolicy.js';
import { api, detectServer } from './api.js';

// Two modes:
//   demo  — sample data kept in this browser only (the original prototype)
//   live  — signed-in organization; the EventOS server is the system of record
const KEY_V2 = 'wrts-eventos:v2';
const KEY_V1 = 'wrts-eventos:v1';
const DEFAULTS = { orgs: SAMPLE_ORGS, events: SAMPLE_EVENTS, passport: SAMPLE_PASSPORT, snapshots: SAMPLE_SNAPSHOTS };

function loadDemo() {
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
function saveDemo(state) {
  if (state.mode !== 'demo') return;
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

function demoState() {
  const saved = loadDemo();
  return {
    mode: 'demo',
    orgs: saved?.orgs ?? DEFAULTS.orgs,
    session: saved?.session ?? null,
    events: saved?.events ?? DEFAULTS.events,
    passport: saved?.passport ?? DEFAULTS.passport,
    snapshots: saved?.snapshots ?? DEFAULTS.snapshots,
  };
}

function init() {
  return { mode: 'starting', hasServer: false, me: null, orgs: [], session: null, events: [], passport: SAMPLE_PASSPORT, snapshots: [], view: initialView(), toast: null };
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
    case 'startDemo': {
      const demo = demoState();
      // From the sign-in screen, go straight into the sample organization.
      const session = demo.session ?? (state.hasServer ? { orgId: SAMPLE_ORG.id, role: 'owner' } : null);
      return { ...state, ...demo, session, view: { name: 'home' } };
    }
    case 'server':
      return { ...state, server: action.server };
    case 'signedOut':
      return { ...init(), mode: 'signedOut', hasServer: true, server: state.server, view: state.view };
    case 'loadLive':
      return { ...state, mode: 'live', hasServer: true, me: action.me, orgs: [action.org], session: action.session, events: action.events, snapshots: action.snapshots, view: action.keepView ? state.view : { name: 'home' } };
    case 'createOrg':
      return { ...state, orgs: [...state.orgs, action.org], session: { orgId: action.org.id, role: 'owner' } };
    case 'setSession':
      return { ...state, session: action.session, view: { name: 'home' } };
    case 'setRole':
      return state.mode === 'demo' ? { ...state, session: { ...state.session, role: action.role } } : state;
    case 'updateOrg': {
      if (!can(role, action.perm ?? 'org.admin')) return denied(state);
      return { ...state, orgs: state.orgs.map((o) => (o.id === state.session.orgId ? { ...o, ...action.patch } : o)) };
    }
    case 'replaceOrg':
      return { ...state, orgs: state.orgs.map((o) => (o.id === action.org.id ? { ...o, ...action.org } : o)) };
    case 'navigate':
      return { ...state, view: action.view };
    case 'addEvent': {
      if (!can(role, 'event.edit')) return denied(state);
      const event = { ...action.event, organizationId: state.session.orgId };
      return { ...state, events: [event, ...state.events.filter((e) => e.id !== event.id)], view: { name: 'event', eventId: event.id, tab: action.tab ?? 'charter' } };
    }
    case 'replaceEvent':
      return { ...state, events: state.events.map((x) => (x.id === action.event.id ? action.event : x)) };
    case 'removeEvent':
      return { ...state, events: state.events.filter((x) => x.id !== action.id), view: { name: 'home' } };
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
      if (state.mode !== 'demo') return state;
      try { localStorage.removeItem(KEY_V2); } catch { /* ignore */ }
      return { ...state, orgs: DEFAULTS.orgs, events: DEFAULTS.events, passport: DEFAULTS.passport, snapshots: DEFAULTS.snapshots, session: null, view: { name: 'home' }, toast: 'Demo data restored' };
    default:
      return state;
  }
}

async function fetchLive() {
  const me = await api('/auth/me');
  if (!me.user) return null;
  if (!me.session) return { me, org: null };
  const [{ org, role }, { events }, { snapshots }] = await Promise.all([api('/org'), api('/events'), api('/snapshots')]);
  return { me, org: { ...org, isSample: false }, session: { orgId: org.id, role }, events, snapshots };
}

const Ctx = createContext(null);
export const StoreContext = Ctx;

export function StoreProvider({ children }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, init);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [rowsByEvent, setRowsByEvent] = useState({});

  const toast = useCallback((message) => rawDispatch({ type: 'toast', message }), []);

  const refresh = useCallback(async (keepView = true) => {
    const live = await fetchLive();
    if (!live) return rawDispatch({ type: 'signedOut' });
    if (!live.org) return rawDispatch({ type: 'loadLive', me: live.me, org: { id: null, name: 'No organization' }, session: null, events: [], snapshots: [], keepView });
    rawDispatch({ type: 'loadLive', ...live, keepView });
  }, []);

  // Boot: a server means real accounts; no server means the browser-only demo.
  useEffect(() => {
    (async () => {
      const server = await detectServer();
      if (!server) return rawDispatch({ type: 'startDemo' });
      rawDispatch({ type: 'server', server });
      try {
        await refresh(true);
      } catch {
        rawDispatch({ type: 'signedOut' });
      }
    })();
  }, [refresh]);

  useEffect(() => saveDemo(state), [state.mode, state.orgs, state.session, state.events, state.passport, state.snapshots]);

  useEffect(() => {
    if (!state.toast) return undefined;
    const t = setTimeout(() => rawDispatch({ type: 'toast', message: null }), 3200);
    return () => clearTimeout(t);
  }, [state.toast]);

  /** In live mode, writes go to the server; the reducer gives an instant preview. */
  const dispatch = useCallback((action) => {
    const before = stateRef.current;
    if (before.mode !== 'live') return rawDispatch(action);
    switch (action.type) {
      case 'updateEvent':
      case 'setChecklist': {
        const after = reducer(before, action);
        const old = before.events.find((e) => e.id === action.id);
        const neu = after.events.find((e) => e.id === action.id);
        const patch = old && neu ? diffEvent(old, neu) : {};
        if (!Object.keys(patch).length) return rawDispatch(action); // denied or no change: let the reducer show why
        rawDispatch(action);
        api(`/events/${old.id}`, { method: 'PATCH', body: { version: old.version, patch } })
          .then(({ event }) => rawDispatch({ type: 'replaceEvent', event }))
          .catch((err) => {
            rawDispatch({ type: 'replaceEvent', event: err.body?.event ?? old });
            toast(err.message);
          });
        return undefined;
      }
      case 'addEvent': {
        const { id, ...body } = action.event;
        api('/events', { method: 'POST', body })
          .then(({ event }) => rawDispatch({ ...action, event }))
          .catch((err) => toast(err.message));
        return undefined;
      }
      case 'addSnapshot':
        rawDispatch(action);
        api('/snapshots', { method: 'POST', body: action.snapshot }).catch((err) => toast(err.message));
        return undefined;
      case 'updateOrg':
        api('/org', { method: 'PATCH', body: action.patch })
          .then(({ org }) => rawDispatch({ type: 'replaceOrg', org }))
          .catch((err) => toast(err.message));
        return undefined;
      case 'setSession':
        api('/auth/switch-org', { method: 'POST', body: { orgId: action.session.orgId } })
          .then(() => refresh(false))
          .catch((err) => toast(err.message));
        return undefined;
      case 'setRole':
      case 'createOrg':
      case 'reset':
        return undefined;
      default:
        return rawDispatch(action);
    }
  }, [refresh, toast]);

  const navigate = useCallback((view) => {
    rawDispatch({ type: 'navigate', view: typeof view === 'string' ? { name: view } : view });
    try {
      window.scrollTo({ top: 0 });
    } catch {
      /* ignore */
    }
  }, []);

  const loadRows = useCallback(async (eventId, force = false) => {
    if (!force && rowsByEvent[eventId]) return;
    try {
      const { rows } = await api(`/events/${eventId}/metrics`);
      setRowsByEvent((m) => ({ ...m, [eventId]: rows }));
    } catch {
      setRowsByEvent((m) => ({ ...m, [eventId]: [] }));
    }
  }, [rowsByEvent]);

  const signOut = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST', body: {} });
    } catch {
      /* ignore */
    }
    setRowsByEvent({});
    rawDispatch({ type: 'signedOut' });
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
      mode: state.mode,
      isLive: state.mode === 'live',
      me: state.me,
      can: (perm) => can(role, perm),
      events: eventsForSession(state, state.session),
      snapshots: snapshotsForSession(state, state.session),
      rowsByEvent,
      loadRows,
      refresh,
      signOut,
      toast,
      startDemo: () => rawDispatch({ type: 'startDemo' }),
    };
  }, [state, dispatch, navigate, rowsByEvent, loadRows, refresh, signOut, toast]);
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

/**
 * Metrics for an event: real registrations for live organizations,
 * simulation for the demo organization.
 */
export function useSim(event) {
  const { org, isLive, rowsByEvent, loadRows } = useStore();
  const o = org ?? SAMPLE_ORG;
  const rows = event ? rowsByEvent[event.id] : undefined;
  useEffect(() => {
    if (isLive && event && rows === undefined) loadRows(event.id);
  }, [isLive, event, rows, loadRows]);
  return useMemo(() => {
    if (!event) return null;
    return isLive ? liveMetrics(event, rows ?? [], o) : simulateEvent(event, o);
  }, [event, o, isLive, rows]);
}
