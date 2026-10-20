import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { SAMPLE_EVENTS, SAMPLE_ORG, SAMPLE_PASSPORT } from './data/sampleData.js';
import { simulateEvent } from './domain/simulate.js';

const KEY = 'wrts-eventos:v1';

// Storage is a per-browser convenience for the prototype. In production this is
// the multi-tenant API; nothing here is the system of record.
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function save(state) {
  try {
    const { org, events, passport } = state;
    localStorage.setItem(KEY, JSON.stringify({ org, events, passport }));
  } catch {
    /* storage unavailable: keep working in memory */
  }
}

const VIEWS = ['home', 'builder', 'passport', 'copilot', 'gateway', 'plans', 'privacy'];

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
    org: saved?.org ?? null,
    events: saved?.events ?? SAMPLE_EVENTS,
    passport: saved?.passport ?? SAMPLE_PASSPORT,
    view: initialView(),
    toast: null,
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'setOrg':
      return { ...state, org: action.org };
    case 'navigate':
      return { ...state, view: action.view };
    case 'addEvent':
      return { ...state, events: [action.event, ...state.events], view: { name: 'event', eventId: action.event.id, tab: 'blueprint' } };
    case 'updateEvent':
      return { ...state, events: state.events.map((e) => (e.id === action.id ? { ...e, ...action.patch } : e)) };
    case 'setChecklist':
      return {
        ...state,
        events: state.events.map((e) => (e.id === action.id ? { ...e, checklist: { ...e.checklist, [action.item]: action.status } } : e)),
      };
    case 'setPassportPrivacy':
      return { ...state, passport: { ...state.passport, privacy: { ...state.passport.privacy, ...action.patch } } };
    case 'toast':
      return { ...state, toast: action.message };
    case 'reset':
      return { org: null, events: SAMPLE_EVENTS, passport: SAMPLE_PASSPORT, view: { name: 'home' }, toast: 'Demo data restored' };
    default:
      return state;
  }
}

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);

  useEffect(() => save(state), [state.org, state.events, state.passport]);

  useEffect(() => {
    if (!state.toast) return undefined;
    const t = setTimeout(() => dispatch({ type: 'toast', message: null }), 2600);
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

  const value = useMemo(() => ({ state, dispatch, navigate }), [state, navigate]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore must be inside StoreProvider');
  return ctx;
}

export function useEvent(id) {
  const { state } = useStore();
  return state.events.find((e) => e.id === id) ?? null;
}

/** Simulated live data for an event; memoized on the event object. */
export function useSim(event) {
  const { state } = useStore();
  const org = state.org ?? SAMPLE_ORG;
  return useMemo(() => (event ? simulateEvent(event, org) : null), [event, org]);
}
