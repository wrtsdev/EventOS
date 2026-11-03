import { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { readiness } from '../domain/controls.js';
import { epicScore } from '../domain/epic.js';
import { simulateEvent } from '../domain/simulate.js';
import { getEventType } from '../domain/catalog.js';
import { formatMoney } from '../domain/metrics.js';
import { TEMPLATES } from '../data/templates.js';
import { SAMPLE_ORG } from '../data/sampleData.js';
import { Ring, Stat, WChip, formatDate, daysUntil, phaseLabel, phaseTone, readinessTone } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

const FILTERS = [
  { id: 'upcoming', label: 'Upcoming', test: (e) => e.status === 'active' && e.phase === 'planning' },
  { id: 'active', label: 'Active', test: (e) => e.status === 'active' && (e.phase === 'live' || e.phase === 'eventday') },
  { id: 'completed', label: 'Completed', test: (e) => e.status === 'active' && e.phase === 'complete' },
  { id: 'canceled', label: 'Canceled', test: (e) => e.status === 'canceled' },
  { id: 'archived', label: 'Archived', test: (e) => e.status === 'archived' },
];

export default function Home() {
  const { navigate, org, events, dispatch } = useStore();
  const o = org ?? SAMPLE_ORG;
  const [filter, setFilter] = useState('all');

  const rows = useMemo(
    () => events.map((e) => {
      const s = simulateEvent(e, o);
      return { e: { status: 'active', ...e }, r: readiness(e, s), s, epic: epicScore(e, s, o) };
    }),
    [events, o],
  );
  const shown = filter === 'all' ? rows.filter((x) => x.e.status !== 'archived') : rows.filter((x) => FILTERS.find((f) => f.id === filter).test(x.e));
  const totals = rows.reduce(
    (a, { s }) => ({ registered: a.registered + s.registered, raised: a.raised + s.impact.raised, volunteers: a.volunteers + s.impact.volunteers }),
    { registered: 0, raised: 0, volunteers: 0 },
  );
  const allUrgent = rows
    .filter(({ e }) => e.status === 'active' && e.phase !== 'complete')
    .flatMap(({ e, epic }) => epic.critical.map((c) => ({ e, c })));
  const urgent = allUrgent.slice(0, 6);
  const firstName = (o.coordinator || '').split(' ')[0];

  return (
    <div className="stack-lg fade-in">
      <header className="page-head">
        <div className="eyebrow">{o.name} · My Events</div>
        <h1>{firstName ? `Welcome back, ${firstName}` : 'Your events'}</h1>
        <p className="lede">Why each event matters, how ready it is, and what needs you next.</p>
      </header>

      {events.length === 0 ? (
        <section className="card stack">
          <h3>Start your first event</h3>
          <p className="muted">The Event Builder walks you through purpose, the 4Ws, budget and safety. You will get an Event Charter and an EPIC readiness plan at the end.</p>
          <div className="row">
            <button className="btn btn-primary" onClick={() => navigate('builder')}>Open the Event Builder</button>
            <button className="btn btn-secondary" onClick={() => dispatch({ type: 'setSession', session: { orgId: SAMPLE_ORG.id, role: 'owner' } })}>Look around the demo organization</button>
          </div>
        </section>
      ) : (
        <div className="grid-stats">
          <Stat label="Events" value={events.length} sub={`${rows.filter((r) => r.e.phase === 'complete').length} completed`} />
          <Stat label="People registered" value={totals.registered.toLocaleString()} sub="Across all events" />
          <Stat label="Raised for causes" value={formatMoney(totals.raised, { compact: true })} sub="Donations + fundraising" />
          <Stat label="Volunteers" value={totals.volunteers} sub="Confirmed or served" />
        </div>
      )}

      {urgent.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h3>Critical items open</h3>
            <span className="pill bad">{allUrgent.length} critical{allUrgent.length > urgent.length ? ` · showing ${urgent.length}` : ''}</span>
          </div>
          <ul className="list-plain">
            {urgent.map(({ e, c }) => (
              <li key={e.id + c.id} className="spread" style={{ flexWrap: 'nowrap' }}>
                <span className="min0"><strong>{c.title}</strong> <span className="muted small">· {e.name}</span></span>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate({ name: 'event', eventId: e.id, tab: c.kind === 'finance' ? 'finance' : c.kind === 'risk' || c.kind === 'incident' ? 'safety' : 'blueprint' })}>Resolve <Icon name="arrow" size={16} /></button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {events.length > 0 && (
        <section className="stack">
          <div className="section-title">
            <h2>Events</h2>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('builder')}><Icon name="plus" size={16} /> New event</button>
          </div>
          <div className="subtabs" role="group" aria-label="Filter events">
            <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
            {FILTERS.map((f) => (
              <button key={f.id} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label} ({rows.filter((x) => f.test(x.e)).length})</button>
            ))}
          </div>
          {shown.length === 0 ? <div className="empty">No events here.</div> : (
            <div className="grid">
              {shown.map(({ e, r, s, epic }) => {
                const d = daysUntil(e.date);
                return (
                  <button key={e.id} className="event-card" onClick={() => navigate({ name: 'event', eventId: e.id, tab: e.phase === 'complete' ? 'impact' : 'overview' })}>
                    <div className="spread">
                      <span className={`pill ${phaseTone(e.phase, e.status)}`}>{phaseLabel(e.phase, e.status)}</span>
                      <span className="row" style={{ gap: 4 }}>{(e.fourWs ?? []).map((w) => <WChip key={w} id={w} />)}</span>
                    </div>
                    <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                      <div className="min0" style={{ flex: 1 }}>
                        <h3>{e.name}</h3>
                        <p className="meta" style={{ marginTop: 6 }}>{getEventType(e.typeId).label} · {formatDate(e.date)}{d != null && d > 0 && e.status === 'active' ? ` · ${d} days away` : ''}</p>
                        <p className="meta">{e.location || 'Location to be set'}</p>
                      </div>
                      {e.phase === 'complete'
                        ? <Ring value={s.cvi?.value ?? 0} size={74} stroke={8} caption="CVI" />
                        : <Ring value={r.score} size={74} stroke={8} label={r.score + '%'} caption="Ready" tone={readinessTone(r.score)} />}
                    </div>
                    <div className="small" style={{ color: 'var(--ink-2)' }}>
                      {e.status === 'canceled' && `Canceled${e.cancelReason ? ': ' + e.cancelReason : ''}`}
                      {e.status !== 'canceled' && e.phase === 'planning' && (epic.critical.length ? `${epic.critical.length} critical items open · EPIC ${epic.composite ?? '–'}` : `No critical items open · EPIC ${epic.composite ?? '–'}`)}
                      {e.status !== 'canceled' && e.phase === 'live' && `${s.registered} of ${s.goal} registered · EPIC ${epic.composite}`}
                      {e.status !== 'canceled' && e.phase === 'eventday' && `Event day · ${s.checkedIn} checked in`}
                      {e.status !== 'canceled' && e.phase === 'complete' && `${s.finishers} finishers · ${formatMoney(s.impact.raised, { compact: true })} raised · ${e.aar?.status === 'complete' ? 'Review complete' : 'After Action Review due'}`}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

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
              <span className="small" style={{ fontWeight: 700, color: 'var(--accent)' }}>Use this template →</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
