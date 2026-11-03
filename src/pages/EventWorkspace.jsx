import { useState } from 'react';
import { useStore, useEvent, useSim } from '../store.jsx';
import { getEventType } from '../domain/catalog.js';
import { readiness } from '../domain/controls.js';
import { LIFECYCLE, WChip, formatDate, daysUntil, phaseLabel, phaseTone } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import CommandCenter from './event/CommandCenter.jsx';
import Charter from './event/Charter.jsx';
import Blueprint from './event/Blueprint.jsx';
import Safety from './event/Safety.jsx';
import Workforce from './event/Workforce.jsx';
import EventDay from './event/EventDay.jsx';
import Finance from './event/Finance.jsx';
import SponsorOS from './event/SponsorOS.jsx';
import Civic from './event/Civic.jsx';
import CauseOS from './event/CauseOS.jsx';
import Comms from './event/Comms.jsx';
import Scorecard from './event/Scorecard.jsx';
import Intelligence from './event/Intelligence.jsx';
import Value from './event/Value.jsx';
import ImpactReport from './event/ImpactReport.jsx';
import AAR from './event/AAR.jsx';
import EventPage from './event/EventPage.jsx';
import Participants from './event/Participants.jsx';

export const SECTIONS = [
  { id: 'overview', label: 'Overview', tabs: [['overview', 'Command Center']] },
  { id: 'plan', label: 'Plan', tabs: [['charter', 'Charter'], ['blueprint', 'Readiness']] },
  { id: 'operations', label: 'Operations', tabs: [['participants', 'Participants'], ['safety', 'Safety'], ['workforce', 'Workforce'], ['eventday', 'Event day']] },
  { id: 'commerce', label: 'Commerce', tabs: [['finance', 'Finance'], ['sponsors', 'Sponsors']] },
  { id: 'community', label: 'Community', tabs: [['civic', 'Partners and outcomes'], ['cause', 'Cause'], ['comms', 'Communications']] },
  { id: 'intel', label: 'EPIC Intelligence', tabs: [['scorecard', 'Scorecard'], ['intelligence', 'Community Intelligence'], ['value', 'Value']] },
  { id: 'reports', label: 'Reports', tabs: [['impact', 'Impact Report'], ['aar', 'After Action Review'], ['page', 'Event page']] },
];

const ALIASES = { ops: 'workforce' };
const PHASE_ORDER = ['planning', 'live', 'eventday', 'complete'];

function lifecycleStage(event) {
  if (event.phase === 'complete') return event.aar?.status === 'complete' ? 'improve' : 'measure';
  if (event.phase === 'eventday') return 'execute';
  if (event.phase === 'live') return 'promote';
  const r = readiness(event);
  if (event.checklist?.budget !== 'done') return r.score < 40 ? 'design' : 'finance';
  return 'prepare';
}

export default function EventWorkspace({ eventId, tab: rawTab = 'overview' }) {
  const { navigate, dispatch, can, isLive } = useStore();
  const event = useEvent(eventId);
  const sim = useSim(event);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const tab = ALIASES[rawTab] ?? rawTab;

  if (!event) {
    return (
      <div className="empty">
        This event does not exist or belongs to another organization. <button className="btn btn-ghost" onClick={() => navigate('home')}>Go to My Events</button>
      </div>
    );
  }

  const section = SECTIONS.find((s) => s.tabs.some(([t]) => t === tab)) ?? SECTIONS[0];
  const setTab = (t) => navigate({ name: 'event', eventId, tab: t });
  const idx = PHASE_ORDER.indexOf(event.phase);
  const stage = lifecycleStage(event);
  const stageIdx = LIFECYCLE.findIndex((s) => s.id === stage);
  const canceled = event.status === 'canceled';

  const setPhase = (phase, toastMsg, nextTab) => {
    dispatch({ type: 'updateEvent', id: eventId, patch: { phase }, toast: toastMsg });
    navigate({ name: 'event', eventId, tab: nextTab });
  };
  const cancel = () => {
    dispatch({ type: 'updateEvent', id: eventId, patch: { status: 'canceled', cancelReason: cancelReason.trim() || 'No reason recorded', canceledAt: new Date().toISOString() }, toast: 'Event canceled. Refunds and messages need your approval.' });
    setCancelOpen(false);
  };
  const d = daysUntil(event.date);

  return (
    <div className="stack-lg fade-in">
      <header className="page-head">
        <div className="spread">
          <span className="row" style={{ gap: 8 }}>
            <span className={`pill ${phaseTone(event.phase, event.status)}`}>{phaseLabel(event.phase, event.status)}</span>
            {(event.fourWs ?? []).map((w, i) => <span key={w} className="row" style={{ gap: 4 }}><WChip id={w} />{i === 0 && <span className="small muted">primary</span>}</span>)}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate({ name: 'copilot', eventId })}><Icon name="spark" size={16} /> Ask the assistant</button>
        </div>
        <h1>{event.name}</h1>
        <p className="lede">
          {getEventType(event.typeId).label} · {formatDate(event.date)}
          {d != null && d > 0 && event.phase !== 'complete' && event.phase !== 'eventday' && !canceled ? ` · ${d} days to go` : ''}
          {event.location ? ` · ${event.location}` : ''}
        </p>

        {canceled && (
          <div className="banner neutral">
            <Icon name="alert" size={18} />
            <span className="min0"><strong>Canceled.</strong> {event.cancelReason}. Scores are frozen; refunds, sponsor and partner messages, and the After Action Review still need doing.
              {can('event.edit') && <> <button className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: 'updateEvent', id: eventId, patch: { status: 'active', cancelReason: '' }, toast: 'Event reinstated' })}>Reinstate</button></>}
            </span>
          </div>
        )}

        <nav className="course lifecycle" aria-label="Event lifecycle">
          {LIFECYCLE.map((p, i) => {
            const st = i < stageIdx ? 'done' : i === stageIdx ? 'now' : '';
            return (
              <button key={p.id} className={`stop ${st}`} onClick={() => setTab(p.tab)} aria-current={st === 'now' ? 'step' : undefined}>
                <span className="mk">{st === 'done' ? <Icon name="check" size={14} /> : i + 1}</span>
                <span className="sl">{p.label}</span>
              </button>
            );
          })}
        </nav>

        {!canceled && (
          <div className="info stack" style={{ gap: 8 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="min0 small">
                <strong>{isLive ? 'Event phase.' : 'Demo controls.'}</strong>{' '}
                {event.phase === 'planning' && (isLive ? 'Open registration when the event page is ready. Publish it under Reports → Event page.' : 'Open registration to see registrations and payments flow in (synthetic data).')}
                {event.phase === 'live' && 'Start event day to monitor check-ins, weather and incidents.'}
                {event.phase === 'eventday' && 'Close event day to generate results, the scorecard and reports.'}
                {event.phase === 'complete' && 'Complete the After Action Review, then create the next edition.'}
              </span>
              <span className="row" style={{ gap: 6 }}>
                {event.phase !== 'planning' && <button className="btn btn-ghost btn-sm" onClick={() => setPhase(PHASE_ORDER[idx - 1], 'Moved back a phase', 'overview')}>Step back</button>}
                {event.phase !== 'complete' && can('event.edit') && <button className="btn btn-ghost btn-sm" onClick={() => setCancelOpen((x) => !x)}>Cancel event</button>}
                {event.phase === 'planning' && <button className="btn btn-primary btn-sm" onClick={() => setPhase('live', 'Registration is open', 'overview')}>Open registration</button>}
                {event.phase === 'live' && <button className="btn btn-primary btn-sm" onClick={() => setPhase('eventday', 'Event day started', 'eventday')}>Start event day</button>}
                {event.phase === 'eventday' && <button className="btn btn-primary btn-sm" onClick={() => setPhase('complete', 'Event day closed. Reports generated.', 'scorecard')}>Close event day</button>}
              </span>
            </div>
            {cancelOpen && (
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: 1, minWidth: 200 }}>
                  <label htmlFor="cancel-reason">Why is the event canceled?</label>
                  <input id="cancel-reason" className="input" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="e.g. Severe storm forecast; permit withdrawn" />
                </div>
                <button className="btn btn-primary btn-sm" onClick={cancel}>Confirm cancellation</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setCancelOpen(false)}>Keep event</button>
              </div>
            )}
          </div>
        )}
      </header>

      <div className="tabs" role="tablist" aria-label="Event sections">
        {SECTIONS.map((s) => (
          <button key={s.id} role="tab" aria-selected={section.id === s.id} onClick={() => setTab(s.tabs[0][0])}>{s.label}</button>
        ))}
      </div>
      {section.tabs.length > 1 && (
        <div className="subtabs" role="group" aria-label={section.label}>
          {section.tabs.map(([t, label]) => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{label}</button>)}
        </div>
      )}

      <div key={tab} className="fade-in">
        {tab === 'overview' && <CommandCenter event={event} sim={sim} setTab={setTab} />}
        {tab === 'charter' && <Charter event={event} sim={sim} setTab={setTab} />}
        {tab === 'blueprint' && <Blueprint event={event} sim={sim} setTab={setTab} />}
        {tab === 'safety' && <Safety event={event} sim={sim} />}
        {tab === 'workforce' && <Workforce event={event} sim={sim} />}
        {tab === 'eventday' && <EventDay event={event} sim={sim} setTab={setTab} />}
        {tab === 'finance' && <Finance event={event} sim={sim} />}
        {tab === 'sponsors' && <SponsorOS event={event} sim={sim} />}
        {tab === 'civic' && <Civic event={event} sim={sim} />}
        {tab === 'cause' && <CauseOS event={event} sim={sim} />}
        {tab === 'comms' && <Comms event={event} sim={sim} />}
        {tab === 'scorecard' && <Scorecard event={event} sim={sim} setTab={setTab} />}
        {tab === 'intelligence' && <Intelligence event={event} sim={sim} />}
        {tab === 'value' && <Value event={event} sim={sim} />}
        {tab === 'impact' && <ImpactReport event={event} sim={sim} setTab={setTab} />}
        {tab === 'aar' && <AAR event={event} sim={sim} setTab={setTab} />}
        {tab === 'page' && <EventPage event={event} sim={sim} />}
        {tab === 'participants' && <Participants event={event} />}
      </div>
    </div>
  );
}
