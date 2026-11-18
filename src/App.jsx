import { useEffect } from 'react';
import { useStore } from './store.jsx';
import Icon from './components/Icon.jsx';
import { BrandLockup } from './components/Brand.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Home from './pages/Home.jsx';
import Builder from './pages/Builder.jsx';
import EventWorkspace from './pages/EventWorkspace.jsx';
import Passport from './pages/Passport.jsx';
import Copilot from './pages/Copilot.jsx';
import Gateway from './pages/Gateway.jsx';
import Plans from './pages/Plans.jsx';
import Privacy from './pages/Privacy.jsx';
import Settings from './pages/Settings.jsx';
import More from './pages/More.jsx';
import Auth from './pages/Auth.jsx';
import PublicEvent from './pages/PublicEvent.jsx';
import Admin from './pages/Admin.jsx';
import { phaseTone } from './components/ui.jsx';
import { ROLES } from './domain/access.js';

const NAV = [
  { name: 'home', label: 'My Events', icon: 'home' },
  { name: 'builder', label: 'Event Builder', icon: 'plus' },
];
const NAV_2 = [
  { name: 'passport', label: 'Participant Passport', icon: 'passport' },
  { name: 'copilot', label: 'Planning assistant', icon: 'spark' },
  { name: 'gateway', label: 'Integrations', icon: 'plug' },
  { name: 'privacy', label: 'Privacy and consent', icon: 'lock' },
  { name: 'settings', label: 'Settings and roles', icon: 'tiers' },
  { name: 'plans', label: 'Plans', icon: 'flag' },
];

function Page() {
  const { state, org, isLive, me } = useStore();
  const v = state.view;
  if (v.name === 'admin' && me?.user?.isPlatformAdmin) return <Admin />;
  if (isLive && !org?.id) return <div className="card"><h2 className="display" style={{ fontSize: 26 }}>No organization yet</h2><p className="muted">Your account isn’t part of an organization. Ask an owner to invite you.</p></div>;
  if (!org) return <Onboarding />;
  switch (v.name) {
    case 'builder': return <Builder templateId={v.templateId} />;
    case 'event': return <EventWorkspace eventId={v.eventId} tab={v.tab} />;
    case 'passport': return <Passport />;
    case 'copilot': return <Copilot eventId={v.eventId} />;
    case 'gateway': return <Gateway />;
    case 'plans': return <Plans />;
    case 'privacy': return <Privacy />;
    case 'settings': return <Settings />;
    case 'more': return <More />;
    case 'admin': return <Admin />;
    default: return <Home />;
  }
}

function publicSlug() {
  try {
    const m = location.pathname.match(/^\/e\/([A-Za-z0-9-]{1,120})\/?$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export default function App() {
  const slug = publicSlug();
  if (slug) return <PublicEvent slug={slug} />;
  return <Organizer />;
}

function Organizer() {
  const { state, navigate, dispatch, org, role, events, isLive, me, signOut } = useStore();
  const viewKey = `${state.mode}:${state.view.name}:${state.view.eventId ?? ''}:${state.view.templateId ?? ''}`;
  // Each new screen starts at the top (the browser otherwise keeps the old scroll position).
  useEffect(() => {
    try { window.scrollTo(0, 0); } catch { /* ignore */ }
  }, [viewKey]);
  if (state.mode === 'starting') return <div className="auth-shell"><div className="public-wrap muted">Loading EventOS…</div></div>;
  if (state.mode === 'signedOut') {
    return (
      <div className="auth-shell">
        <Auth />
        {state.toast && <div className="toast" role="status">{state.toast}</div>}
      </div>
    );
  }
  const current = state.view.name;
  const isAdmin = Boolean(isLive && me?.user?.isPlatformAdmin);
  const activeEvents = events.filter((e) => e.status !== 'archived');
  // Signed in on the /signup address (just created an account, or a stale link): show the app at /.
  if (location.pathname !== '/' && !location.pathname.startsWith('/e/')) {
    try { history.replaceState(null, '', '/' + location.hash); } catch { /* ignore */ }
  }
  const dotColor = (e) => ({ good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)', neutral: 'var(--ice)' })[phaseTone(e.phase, e.status)];

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Organizer navigation">
        <button className="brand" onClick={() => navigate('home')} aria-label="EventOS home">
          <BrandLockup variant="primary" />
        </button>
        {org && (
          <nav className="side-nav">
            {NAV.map((n) => (
              <button key={n.name} aria-current={current === n.name ? 'page' : undefined} onClick={() => navigate(n.name)}>
                <Icon name={n.icon} /> {n.label}
              </button>
            ))}
            {activeEvents.length > 0 && <div className="eyebrow">Events</div>}
            {activeEvents.map((e) => (
              <button
                key={e.id}
                aria-current={current === 'event' && state.view.eventId === e.id ? 'page' : undefined}
                onClick={() => navigate({ name: 'event', eventId: e.id, tab: 'overview' })}
              >
                <span className="ev-dot" style={{ background: dotColor(e) }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
              </button>
            ))}
            <div className="eyebrow">Organization</div>
            {NAV_2.map((n) => (
              <button key={n.name} aria-current={current === n.name ? 'page' : undefined} onClick={() => navigate(n.name)}>
                <Icon name={n.icon} /> {n.label}
              </button>
            ))}
            {isAdmin && (
              <>
                <div className="eyebrow">We Run These Streetz</div>
                <button aria-current={current === 'admin' ? 'page' : undefined} onClick={() => navigate('admin')}>
                  <Icon name="shield" /> WRTS admin
                </button>
              </>
            )}
          </nav>
        )}
        <div className="side-foot">
          <strong>{org?.name ?? 'No organization yet'}</strong>
          {org ? `${ROLES[role]?.label ?? role}${org.isSample ? ' · demo' : ''}` : 'Set up on the home screen'}
          {isLive && me?.user && <div className="small" style={{ opacity: 0.8 }}>{me.user.email}</div>}
          <div style={{ marginTop: 8 }}>
            {isLive
              ? <button className="btn btn-ghost btn-sm" style={{ color: 'var(--ice)', paddingLeft: 0 }} onClick={signOut}>Sign out</button>
              : <>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--ice)', paddingLeft: 0 }} onClick={() => dispatch({ type: 'reset' })}>Reset demo</button>
                  {state.hasServer && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--ice)' }} onClick={() => dispatch({ type: 'signedOut' })}>Exit demo · Sign in</button>}
                </>}
          </div>
        </div>
      </aside>

      <header className="topbar">
        <button className="brand" onClick={() => navigate('home')} aria-label="EventOS home">
          <BrandLockup variant="wordmark" />
        </button>
        <span className="org-chip">{org ? `${org.name} · ${ROLES[role]?.label ?? role}` : 'Move Forward Together'}</span>
      </header>

      <main className="main" key={current + (state.view.eventId ?? '') + (state.view.templateId ?? '')}>
        <Page />
        <p className="page-foot">EventOS — Developed and Distributed by We Run These Streetz LLC. Move Forward Together.</p>
      </main>

      {org && (
        <nav className="bottomnav" aria-label="Main">
          {[
            { name: 'home', label: 'Events', icon: 'home' },
            { name: 'builder', label: 'Build', icon: 'plus' },
            { name: 'passport', label: 'Passport', icon: 'passport' },
            { name: 'copilot', label: 'Assistant', icon: 'spark' },
            { name: 'more', label: 'More', icon: 'more' },
          ].map((n) => (
            <button
              key={n.name}
              aria-current={current === n.name || (n.name === 'home' && current === 'event') || (n.name === 'more' && ['gateway', 'plans', 'privacy', 'settings', 'admin'].includes(current)) ? 'page' : undefined}
              onClick={() => navigate(n.name)}
            >
              <Icon name={n.icon} />
              {n.label}
            </button>
          ))}
        </nav>
      )}

      {state.toast && <div className="toast" role="status">{state.toast}</div>}
    </div>
  );
}
