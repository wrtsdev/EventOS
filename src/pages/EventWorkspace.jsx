import { useStore, useEvent, useSim } from '../store.jsx';
import { getEventType } from '../domain/catalog.js';
import { PHASES, WChip, formatDate, daysUntil, phaseLabel, phaseTone } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import CommandCenter from './event/CommandCenter.jsx';
import Blueprint from './event/Blueprint.jsx';
import Operations from './event/Operations.jsx';
import CauseOS from './event/CauseOS.jsx';
import SponsorOS from './event/SponsorOS.jsx';
import Intelligence from './event/Intelligence.jsx';
import Value from './event/Value.jsx';
import ImpactReport from './event/ImpactReport.jsx';
import EventPage from './event/EventPage.jsx';

const TABS = [
  { id: 'overview', label: 'Command Center' },
  { id: 'blueprint', label: 'Blueprint' },
  { id: 'ops', label: 'Volunteers + Ops' },
  { id: 'cause', label: 'CauseOS' },
  { id: 'sponsors', label: 'SponsorOS' },
  { id: 'intelligence', label: 'Community Intelligence' },
  { id: 'value', label: 'Value' },
  { id: 'impact', label: 'Impact Report' },
  { id: 'page', label: 'Event page' },
];

const PHASE_ORDER = ['planning', 'live', 'complete'];

export default function EventWorkspace({ eventId, tab = 'overview' }) {
  const { navigate, dispatch } = useStore();
  const event = useEvent(eventId);
  const sim = useSim(event);
  if (!event) {
    return (
      <div className="empty">
        This event no longer exists. <button className="btn btn-ghost" onClick={() => navigate('home')}>Go home</button>
      </div>
    );
  }

  const setTab = (t) => navigate({ name: 'event', eventId, tab: t });
  const idx = PHASE_ORDER.indexOf(event.phase);
  const stopState = (i) => {
    const current = event.phase === 'complete' && tab === 'impact' ? 3 : idx;
    return i < current ? 'done' : i === current ? 'now' : '';
  };
  const setPhase = (phase, toastMsg, nextTab) => {
    dispatch({ type: 'updateEvent', id: eventId, patch: { phase } });
    dispatch({ type: 'toast', message: toastMsg });
    navigate({ name: 'event', eventId, tab: nextTab });
  };
  const d = daysUntil(event.date);

  return (
    <div className="stack-lg fade-in">
      <header className="page-head">
        <div className="spread">
          <span className="row" style={{ gap: 8 }}>
            <span className={`pill ${phaseTone(event.phase)}`}>{phaseLabel(event.phase)}</span>
            {(event.fourWs ?? []).map((w) => <WChip key={w} id={w} />)}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate({ name: 'copilot', eventId })}><Icon name="spark" size={16} /> Ask Copilot</button>
        </div>
        <h1>{event.name}</h1>
        <p className="lede">
          {getEventType(event.typeId).label} · {formatDate(event.date)}
          {d != null && d > 0 && event.phase !== 'complete' ? ` · ${d} days to go` : ''}
          {event.location ? ` · ${event.location}` : ''}
        </p>

        <nav className="course" aria-label="Event lifecycle">
          {PHASES.map((p, i) => (
            <button
              key={p.id}
              className={`stop ${stopState(i)}`}
              onClick={() => setTab(i === 0 ? 'blueprint' : i === 1 ? 'overview' : i === 2 ? 'overview' : 'impact')}
              aria-current={stopState(i) === 'now' ? 'step' : undefined}
            >
              <span className="mk">{stopState(i) === 'done' ? <Icon name="check" size={14} /> : i + 1}</span>
              <span className="sl">{p.label}</span>
              <span className="ss">{p.sub}</span>
            </button>
          ))}
        </nav>

        <div className="info row" style={{ justifyContent: 'space-between' }}>
          <span className="min0 small">
            <strong>Demo control.</strong>{' '}
            {event.phase === 'planning' && 'Move this event forward to see registration data flow in from connected providers.'}
            {event.phase === 'live' && 'Simulate race day to see results, survey feedback and the Impact Report.'}
            {event.phase === 'complete' && 'This event is complete. Step back to replay earlier phases.'}
          </span>
          <span className="row" style={{ gap: 6 }}>
            {event.phase !== 'planning' && (
              <button className="btn btn-ghost btn-sm" onClick={() => setPhase(PHASE_ORDER[idx - 1], 'Moved back a phase', 'overview')}>Step back</button>
            )}
            {event.phase === 'planning' && <button className="btn btn-primary btn-sm" onClick={() => setPhase('live', 'Registration is open', 'overview')}>Open registration</button>}
            {event.phase === 'live' && <button className="btn btn-primary btn-sm" onClick={() => setPhase('complete', 'Event complete. Impact Report generated.', 'impact')}>Simulate race day</button>}
          </span>
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="Event sections">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      <div key={tab} className="fade-in">
        {tab === 'overview' && <CommandCenter event={event} sim={sim} setTab={setTab} />}
        {tab === 'blueprint' && <Blueprint event={event} />}
        {tab === 'ops' && <Operations event={event} sim={sim} />}
        {tab === 'cause' && <CauseOS event={event} sim={sim} />}
        {tab === 'sponsors' && <SponsorOS event={event} sim={sim} />}
        {tab === 'intelligence' && <Intelligence event={event} sim={sim} />}
        {tab === 'value' && <Value event={event} sim={sim} />}
        {tab === 'impact' && <ImpactReport event={event} sim={sim} setTab={setTab} />}
        {tab === 'page' && <EventPage event={event} sim={sim} />}
      </div>
    </div>
  );
}
