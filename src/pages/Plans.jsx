import { useStore } from '../store.jsx';
import { TIERS, MANAGED_SERVICES, suggestTier } from '../domain/catalog.js';
import { SAMPLE_ORG } from '../data/sampleData.js';

export default function Plans() {
  const { org, events } = useStore();
  const o = org ?? SAMPLE_ORG;
  const biggest = Math.max(0, ...events.map((e) => Number(e.expected) || 0));
  const suggested = suggestTier(biggest, o.eventsPerYear ?? 1);

  return (
    <div className="stack-lg fade-in">
      <header className="page-head">
        <div className="eyebrow">Proposed commercial configurations · not final prices or public commitments</div>
        <h1>EventOS plans</h1>
        <p className="lede">Start simple and add depth as your events grow. No affiliation with any national organization is required.</p>
      </header>
      <div className="grid">
        {TIERS.map((t) => (
          <section key={t.id} className="card stack" style={t.id === suggested ? { borderColor: 'var(--accent)', boxShadow: 'inset 0 0 0 1px var(--accent)' } : undefined}>
            <div className="spread">
              <span className="eyebrow">{t.size}</span>
              {t.id === o.tier ? <span className="pill good plain">Current plan</span> : t.id === suggested ? <span className="pill neutral plain">Fits {o.name}</span> : null}
            </div>
            <h3 className="display" style={{ fontSize: 30 }}>{t.name.replace('EventOS ', '')}</h3>
            <p className="small">{t.audience}</p>
            <p style={{ fontWeight: 700 }}>{t.price}</p>
            <ul className="bullets small">{t.includes.map((x) => <li key={x}>{x}</li>)}</ul>
          </section>
        ))}
      </div>
      <section className="card">
        <h3>{MANAGED_SERVICES.name}</h3>
        <p className="small muted" style={{ marginTop: 4 }}>{MANAGED_SERVICES.detail}</p>
      </section>
      <p className="small muted">EventOS is developed and distributed by We Run These Streetz LLC. The EPIC operating framework is incorporated as a methodology; any attribution or rights it requires will be confirmed before commercial launch.</p>
    </div>
  );
}
