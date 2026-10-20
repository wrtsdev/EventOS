import { useStore } from '../store.jsx';
import { TIERS, suggestTier } from '../domain/catalog.js';
import { SAMPLE_ORG } from '../data/sampleData.js';

export default function Plans() {
  const { state } = useStore();
  const org = state.org ?? SAMPLE_ORG;
  const biggest = Math.max(0, ...state.events.map((e) => Number(e.expected) || 0));
  const suggested = suggestTier(biggest, org.eventsPerYear ?? 1);

  return (
    <div className="stack-lg fade-in">
      <header className="page-head">
        <div className="eyebrow">Future offerings · prototype pricing labels</div>
        <h1>EventOS plans</h1>
        <p className="lede">Start small, grow into a portfolio, or let WRTS build the event with you.</p>
      </header>
      <div className="grid">
        {TIERS.map((t) => (
          <section key={t.id} className="card stack" style={t.id === suggested ? { borderColor: 'var(--accent)', boxShadow: 'inset 0 0 0 1px var(--accent)' } : undefined}>
            <div className="spread">
              <span className="eyebrow">{t.size}</span>
              {t.id === suggested && <span className="pill good plain">Fits {org.name}</span>}
            </div>
            <h3 className="display" style={{ fontSize: 30 }}>{t.name.replace('EventOS ', '')}</h3>
            <p className="small">{t.audience}</p>
            <p style={{ fontWeight: 700 }}>{t.price}</p>
            <ul className="bullets small">{t.includes.map((x) => <li key={x}>{x}</li>)}</ul>
          </section>
        ))}
      </div>
      <p className="small muted">Prices are placeholders for stakeholder discussion.</p>
    </div>
  );
}
