import { useMemo, useState } from 'react';
import { useStore } from '../../store.jsx';
import { weatherFor, WEATHER_STATUS } from '../../domain/safety.js';
import { stageReviews } from '../../domain/controls.js';
import { messagesFor } from '../../domain/comms.js';
import { Card, Stat, Progress, DemoTag } from '../../components/ui.jsx';
import { Checklist } from './Checklist.jsx';
import { Incidents } from './Safety.jsx';

export default function EventDay({ event, sim }) {
  const { dispatch, can, role, org } = useStore();
  const reviews = useMemo(() => stageReviews(event, sim), [event, sim]);
  const day = reviews.find((r) => r.id === 'eventday');
  const dayItems = day.items.filter((i) => i.stage === 'eventday');
  const weather = weatherFor(event);
  const [note, setNote] = useState('');
  const [wNote, setWNote] = useState(weather.note ?? '');
  const active = event.phase === 'eventday' || event.phase === 'complete';
  const log = event.dayLog ?? [];

  const decide = (status) => {
    const patch = { weather: { status, note: wNote, decidedBy: org?.coordinator || role, at: new Date().toISOString() } };
    if (status === 'delay' || status === 'cancel' || status === 'modified') {
      const msgs = messagesFor(event).filter((m) => m.id !== 'wx');
      msgs.push({
        id: 'wx', audience: 'participants', title: status === 'cancel' ? 'Event canceled for weather' : status === 'delay' ? 'Start delayed for weather' : 'Course or format changed for weather',
        channel: 'Text + email', weeks: 0, when: 'Event day', detail: wNote || 'Details from the organizer on duty.', status: 'draft', author: 'template', approvedBy: '',
      });
      patch.messages = msgs;
    }
    dispatch({ type: 'updateEvent', id: event.id, perm: 'safety.edit', patch, toast: status === 'go' ? 'Go decision recorded' : 'Decision recorded. A participant message is drafted and waiting for approval.' });
  };
  const addLog = () => {
    if (!note.trim()) return;
    dispatch({ type: 'updateEvent', id: event.id, patch: { dayLog: [...log, { time: new Date().toTimeString().slice(0, 5), note: note.trim(), by: org?.coordinator || role }] } });
    setNote('');
  };

  if (!active) {
    return (
      <div className="stack-lg">
        <div className="empty stack" style={{ alignItems: 'center' }}>
          <p>The event-day console opens on event day: check-ins, the weather decision, event-day controls, the incident log and a running operations log.</p>
          <p className="small">{event.phase === 'live' ? 'Use Start event day above to open it now.' : 'Open registration first, then start event day.'}</p>
        </div>
        <Card title="What event day will ask for"><Checklist event={event} items={dayItems} /></Card>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <div className="spread">
        <div>
          <div className="eyebrow">Execute</div>
          <h2 className="display" style={{ fontSize: 32 }}>Event-day operations</h2>
        </div>
        <DemoTag>Synthetic check-in data</DemoTag>
      </div>

      <div className="grid-stats">
        <Stat label="Checked in" value={sim.checkedIn} sub={`of ${sim.registered} registered`} />
        <Stat label="Volunteers on site" value={sim.impact.volunteers} sub={`${sim.impact.volunteersNeeded} needed`} />
        <Stat label="Event-day controls" value={`${dayItems.filter((i) => i.status === 'done').length}/${dayItems.length}`} sub={`${dayItems.filter((i) => i.weight === 'critical' && i.status !== 'done').length} critical open`} />
        <Stat label="Weather" value={WEATHER_STATUS[weather.status].label.split(' ')[0]} sub={weather.decidedBy ? `Decided by ${weather.decidedBy}` : 'No decision recorded'} />
      </div>
      <Progress value={sim.registered ? sim.checkedIn / sim.registered : 0} />

      <Card title="Weather go / no-go">
        <div className="stack" style={{ gap: 10 }}>
          <div className="field">
            <label htmlFor="wx-note">Conditions and reason</label>
            <input id="wx-note" className="input" value={wNote} onChange={(e) => setWNote(e.target.value)} placeholder="e.g. Lightning 12 miles out, 30-minute hold" />
          </div>
          <div className="row">
            {Object.entries(WEATHER_STATUS).map(([id, w]) => (
              <button key={id} className={`btn btn-sm ${weather.status === id && event.weather ? 'btn-primary' : 'btn-secondary'}`} onClick={() => decide(id)} disabled={!can('safety.edit')}>{w.label}</button>
            ))}
          </div>
          <p className="small muted">Recording a delay, change or cancellation drafts a participant message in Communications. Nothing is sent until a person approves it.</p>
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Event-day controls"><Checklist event={event} items={dayItems} /></Card>
        <Card title="Operations log">
          <div className="stack" style={{ gap: 8 }}>
            {log.length === 0 ? <p className="small muted">Nothing logged yet.</p> : (
              <ul className="timeline">{log.map((l, i) => <li key={i}><div className="eyebrow">{l.time} · {l.by}</div><div className="small">{l.note}</div></li>)}</ul>
            )}
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <label htmlFor="log-note" style={{ position: 'absolute', left: -9999 }}>Log note</label>
              <input id="log-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Water station 2 restocked" onKeyDown={(e) => e.key === 'Enter' && addLog()} />
              <button className="btn btn-secondary btn-sm" onClick={addLog}>Add</button>
            </div>
          </div>
        </Card>
      </div>

      <Incidents event={event} role={role} />
    </div>
  );
}
