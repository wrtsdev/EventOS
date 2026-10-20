import { useStore } from './store.jsx';
import Icon from './components/Icon.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Home from './pages/Home.jsx';
import Builder from './pages/Builder.jsx';
import EventWorkspace from './pages/EventWorkspace.jsx';
import Passport from './pages/Passport.jsx';
import Copilot from './pages/Copilot.jsx';
import Gateway from './pages/Gateway.jsx';
import Plans from './pages/Plans.jsx';
import Privacy from './pages/Privacy.jsx';
import More from './pages/More.jsx';
import { phaseTone } from './components/ui.jsx';

const NAV = [
  { name: 'home', label: 'Home', icon: 'home' },
  { name: 'builder', label: 'Build an event', icon: 'plus' },
];
const NAV_2 = [
  { name: 'passport', label: 'Participant Passport', icon: 'passport' },
  { name: 'copilot', label: 'Copilot', icon: 'spark' },
  { name: 'gateway', label: 'Integrations', icon: 'plug' },
  { name: 'privacy', label: 'Privacy and consent', icon: 'lock' },
  { name: 'plans', label: 'Plans', icon: 'tiers' },
];

function Page() {
  const { state } = useStore();
  const v = state.view;
  if (!state.org && v.name === 'home') return <Onboarding />;
  switch (v.name) {
    case 'builder': return <Builder templateId={v.templateId} />;
    case 'event': return <EventWorkspace eventId={v.eventId} tab={v.tab} />;
    case 'passport': return <Passport />;
    case 'copilot': return <Copilot eventId={v.eventId} />;
    case 'gateway': return <Gateway />;
    case 'plans': return <Plans />;
    case 'privacy': return <Privacy />;
    case 'more': return <More />;
    default: return <Home />;
  }
}

export default function App() {
  const { state, navigate, dispatch } = useStore();
  const current = state.view.name;
  const dotColor = (e) => ({ good: 'var(--good)', warn: 'var(--warn)', neutral: 'var(--ice)' })[phaseTone(e.phase)];

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Organizer navigation">
        <button className="brand" onClick={() => navigate('home')}>
          <span className="brand-mark">WRTS</span>
          <span className="brand-sub">EventOS</span>
        </button>
        <nav className="side-nav">
          {NAV.map((n) => (
            <button key={n.name} aria-current={current === n.name ? 'page' : undefined} onClick={() => navigate(n.name)}>
              <Icon name={n.icon} /> {n.label}
            </button>
          ))}
          <div className="eyebrow">Your events</div>
          {state.events.map((e) => (
            <button
              key={e.id}
              aria-current={current === 'event' && state.view.eventId === e.id ? 'page' : undefined}
              onClick={() => navigate({ name: 'event', eventId: e.id, tab: 'overview' })}
            >
              <span className="ev-dot" style={{ background: dotColor(e) }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
            </button>
          ))}
          <div className="eyebrow">Community</div>
          {NAV_2.map((n) => (
            <button key={n.name} aria-current={current === n.name ? 'page' : undefined} onClick={() => navigate(n.name)}>
              <Icon name={n.icon} /> {n.label}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <strong>{state.org?.name ?? 'No organization yet'}</strong>
          {state.org?.isSample ? 'Demo organization' : state.org ? state.org.type : 'Set up on the home screen'}
          <div style={{ marginTop: 8 }}>
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--ice)', paddingLeft: 0 }} onClick={() => dispatch({ type: 'reset' })}>Reset demo</button>
          </div>
        </div>
      </aside>

      <header className="topbar">
        <button className="brand" onClick={() => navigate('home')}>
          <span className="brand-mark">WRTS</span>
          <span className="brand-sub">EventOS</span>
        </button>
        <span className="org-chip">{state.org?.name ?? 'Move Forward Together'}</span>
      </header>

      <main className="main" key={current + (state.view.eventId ?? '') + (state.view.templateId ?? '')}>
        <Page />
      </main>

      <nav className="bottomnav" aria-label="Main">
        {[
          { name: 'home', label: 'Home', icon: 'home' },
          { name: 'builder', label: 'Build', icon: 'plus' },
          { name: 'passport', label: 'Passport', icon: 'passport' },
          { name: 'copilot', label: 'Copilot', icon: 'spark' },
          { name: 'more', label: 'More', icon: 'more' },
        ].map((n) => (
          <button
            key={n.name}
            aria-current={current === n.name || (n.name === 'home' && current === 'event') || (n.name === 'more' && ['gateway', 'plans', 'privacy'].includes(current)) ? 'page' : undefined}
            onClick={() => navigate(n.name)}
          >
            <Icon name={n.icon} />
            {n.label}
          </button>
        ))}
      </nav>

      {state.toast && <div className="toast" role="status">{state.toast}</div>}
    </div>
  );
}
