import { useMemo } from 'react';
import { useStore } from '../store.jsx';
import { readiness } from '../domain/blueprint.js';
import { simulateEvent } from '../domain/simulate.js';
import { getEventType } from '../domain/catalog.js';
import { formatMoney } from '../domain/metrics.js';
import { TEMPLATES } from '../data/templates.js';
import { SAMPLE_ORG } from '../data/sampleData.js';
import { Ring, Stat, WChip, formatDate, daysUntil, phaseLabel, phaseTone, readinessTone } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

export default function Home() {
  const { state, navigate } = useStore();
  const org = state.org ?? SAMPLE_ORG;

  const rows = useMemo(
    () => state.events.map((e) => ({ e, r: readiness(e), s: simulateEvent(e, org) })),
    [state.events, org],
  );
  const totals = rows.reduce(
    (a, { s }) => ({ registered: a.registered + s.registered, raised: a.raised + s.impact.raised, volunteers: a.volunteers + s.impact.volunteers }),
    { registered: 0, raised: 0, volunteers: 0 },
  );
  const urgent = rows
    .filter(({ e }) => e.phase !== 'complete')
    .flatMap(({ e, r }) => r.blocking.map((i) => ({ e, i })))
    .slice(0, 5);
  const firstName = (org.coordinator || '').split(' ')[0];

  return (
    <div className="stack-lg fade-in">
      <header className="page-head">
        <div className="eyebrow">{org.name}</div>
        <h1>{firstName ? `Welcome back, ${firstName}` : 'Your events'}</h1>
        <p className="lede">From idea to impact. Here is where every event stands and what needs you next.</p>
      </header>

      <div className="grid-stats">
        <Stat label="Events" value={state.events.length} sub={`${rows.filter((r) => r.e.phase === 'complete').length} completed`} />
        <Stat label="People registered" value={totals.registered.toLocaleString()} sub="Across all events" />
        <Stat label="Raised for causes" value={formatMoney(totals.raised, { compact: true })} sub="Donations + fundraising" />
        <Stat label="Volunteers" value={totals.volunteers} sub="Confirmed or served" />
      </div>

      {urgent.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h3>What needs you today</h3>
            <span className="pill bad">{urgent.length} blocking</span>
          </div>
          <ul className="list-plain">
            {urgent.map(({ e, i }) => (
              <li key={e.id + i.id} className="spread">
                <span className="min0"><strong>{i.label}</strong> <span className="muted small">· {e.name}</span></span>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate({ name: 'event', eventId: e.id, tab: 'blueprint' })}>Resolve <Icon name="arrow" size={16} /></button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="stack">
        <div className="section-title">
          <h2>Events</h2>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('builder')}><Icon name="plus" size={16} /> New event</button>
        </div>
        <div className="grid">
          {rows.map(({ e, r, s }) => {
            const d = daysUntil(e.date);
            return (
              <button key={e.id} className="event-card" onClick={() => navigate({ name: 'event', eventId: e.id, tab: e.phase === 'complete' ? 'impact' : 'overview' })}>
                <div className="spread">
                  <span className={`pill ${phaseTone(e.phase)}`}>{phaseLabel(e.phase)}</span>
                  <span className="row" style={{ gap: 4 }}>{(e.fourWs ?? []).map((w) => <WChip key={w} id={w} />)}</span>
                </div>
                <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                  <div className="min0" style={{ flex: 1 }}>
                    <h3>{e.name}</h3>
                    <p className="meta" style={{ marginTop: 6 }}>{getEventType(e.typeId).label} · {formatDate(e.date)}{d != null && d > 0 ? ` · ${d} days away` : ''}</p>
                    <p className="meta">{e.location || 'Location to be set'}</p>
                  </div>
                  {e.phase === 'complete'
                    ? <Ring value={s.cvi?.value ?? 0} size={74} stroke={8} caption="CVI" />
                    : <Ring value={r.score} size={74} stroke={8} label={r.score + '%'} caption="Ready" tone={readinessTone(r.score)} />}
                </div>
                <div className="small" style={{ color: 'var(--ink-2)' }}>
                  {e.phase === 'planning' && (r.blocking.length ? `${r.blocking.length} blocking items before you open registration` : 'Ready to open registration')}
                  {e.phase === 'live' && `${s.registered} of ${s.goal} registered · ${formatMoney(s.revenue.registration + s.revenue.sponsorship, { compact: true })} committed`}
                  {e.phase === 'complete' && `${s.finishers} finishers · ${formatMoney(s.impact.raised, { compact: true })} raised · Impact Report ready`}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="stack">
        <div className="section-title">
          <div>
            <div className="eyebrow">Start from a proven plan</div>
            <h2>Templates</h2>
          </div>
        </div>
        <div className="grid">
          {TEMPLATES.map((t) => (
            <button key={t.id} className="tpl-card" onClick={() => navigate({ name: 'builder', templateId: t.id })}>
              <WChip id={t.fourW} />
              <h4>{t.name}</h4>
              <p className="small muted">{t.tagline}</p>
              <span className="btn-ghost small" style={{ fontWeight: 700, color: 'var(--accent)' }}>Use this template →</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
