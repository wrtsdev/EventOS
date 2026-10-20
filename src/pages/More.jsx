import { useStore } from '../store.jsx';
import Icon from '../components/Icon.jsx';
import { phaseLabel } from '../components/ui.jsx';

export default function More() {
  const { state, navigate, dispatch } = useStore();
  const links = [
    ['gateway', 'Integrations', 'plug', 'Registration, timing, HubSpot'],
    ['privacy', 'Privacy and consent', 'lock', 'How participant data is used'],
    ['plans', 'Plans', 'tiers', 'Community, Growth, Partner, Managed'],
  ];
  return (
    <div className="stack-lg fade-in">
      <header className="page-head"><h1>More</h1></header>
      <section className="card">
        <ul className="list-plain">
          {links.map(([v, l, i, d]) => (
            <li key={v}>
              <button className="spread" style={{ width: '100%', background: 'none', border: 0, padding: '6px 0', cursor: 'pointer', textAlign: 'left' }} onClick={() => navigate(v)}>
                <span className="row" style={{ gap: 12 }}><Icon name={i} /><span><strong>{l}</strong><span className="small muted" style={{ display: 'block' }}>{d}</span></span></span>
                <Icon name="arrow" size={18} />
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h3 style={{ marginBottom: 8 }}>Your events</h3>
        <ul className="list-plain">
          {state.events.map((e) => (
            <li key={e.id}>
              <button className="spread" style={{ width: '100%', background: 'none', border: 0, padding: '4px 0', cursor: 'pointer', textAlign: 'left' }} onClick={() => navigate({ name: 'event', eventId: e.id, tab: 'overview' })}>
                <span><strong>{e.name}</strong><span className="small muted" style={{ display: 'block' }}>{phaseLabel(e.phase)}</span></span>
                <Icon name="arrow" size={18} />
              </button>
            </li>
          ))}
        </ul>
      </section>
      <button className="btn btn-secondary" onClick={() => dispatch({ type: 'reset' })}>Reset demo data</button>
    </div>
  );
}
