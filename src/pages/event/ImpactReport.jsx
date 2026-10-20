import { useState } from 'react';
import { useStore } from '../../store.jsx';
import { formatMoney, pct } from '../../domain/metrics.js';
import { FOUR_WS } from '../../domain/fourW.js';
import { partnersFor } from '../../domain/simulate.js';
import { syncPreview } from '../../integrations/hubspot.js';
import { Card, Ring, Bars, WChip, formatDate } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';

const WE_LEARNED = {
  'Parking and arrival were confusing': 'Next time: a parking map in the know-before-you-go message and volunteer greeters at each lot.',
  'Check-in lines were long': 'Next time: a second packet pickup window the day before.',
  'Want more water on course': 'Next time: a midpoint water station, sponsored.',
  'Felt welcoming for every pace': 'Keep the walking division and a sweep walker at the back.',
  'Great energy at the finish': 'Keep the finish-line music and add a family photo spot.',
  'Liked doing it with family': 'Add a family registration price.',
};

export default function ImpactReport({ event, sim, setTab }) {
  const { dispatch } = useStore();
  const [sent, setSent] = useState({});

  if (event.phase !== 'complete') {
    return (
      <div className="empty stack" style={{ alignItems: 'center' }}>
        <p>The Community Impact Report is generated automatically after event day from registration, results, surveys and cause data.</p>
        {event.phase === 'live'
          ? <p className="small">Use <strong>Simulate race day</strong> above to generate it now.</p>
          : <p className="small">Open registration first, then simulate race day.</p>}
      </div>
    );
  }

  const hub = syncPreview(sim.participants, event);
  const ws = event.fourWs ?? [];
  const totalW = Object.values(sim.impact.fourWActivities).reduce((a, b) => a + b, 0);
  const metrics = [
    ['Participants', sim.registered],
    ['Finishers', sim.finishers],
    ['Teams', sim.teams.length],
    ['Volunteers', sim.impact.volunteers],
    ['Money raised', formatMoney(sim.impact.raised)],
    ['Causes supported', event.cause ? 1 : 0],
    ['Community partners', partnersFor(event).length],
    ['Sponsors', sim.sponsors.length],
    ['Repeat participants', sim.returning],
    ['First-time participants', sim.firstTime],
    ['Referrals', sim.referrals],
    ['Satisfaction', `${sim.impact.avgSatisfaction.toFixed(1)} / 5`],
  ];
  const said = sim.feedback.slice(0, 5);

  const send = (a) => {
    setSent((s) => ({ ...s, [a.id]: true }));
    dispatch({ type: 'toast', message: `Sent to HubSpot: ${a.crm} (mock)` });
  };

  return (
    <div className="stack-lg">
      <section className="report-hero">
        <div className="spread">
          <span className="eyebrow">Community Impact Report · {formatDate(event.date)}</span>
          <span className="row" style={{ gap: 6 }}>{ws.map((w) => <WChip key={w} id={w} />)}</span>
        </div>
        <h2>What {event.name} created</h2>
        <p style={{ maxWidth: '62ch', color: 'var(--ink-2)' }}>
          {sim.registered} neighbors from {sim.zips.length} ZIP codes moved together. {sim.firstTime} were here for the first time. {event.cause ? `${sim.impact.causeParticipants} took action for ${event.cause}, and together they raised ${formatMoney(sim.impact.raised)}.` : ''} {sim.impact.volunteers} volunteers made it happen.
        </p>
      </section>

      <div className="grid-stats">
        {metrics.map(([l, v]) => <div key={l} className="stat"><span className="label">{l}</span><span className="value">{v}</span></div>)}
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="row" style={{ gap: 16, flexWrap: 'nowrap' }}>
            <Ring value={sim.cvi.value} caption="CVI" size={104} />
            <div className="min0">
              <div className="eyebrow">What the community gained</div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>Community Value Index {sim.cvi.value}/100 · {sim.cvi.band}</div>
              <p className="small muted">Repeat participation, cause action, referrals, volunteering, Passport activity, feedback and 4W participation.</p>
            </div>
          </div>
        </section>
        <section className="card stack" style={{ gap: 6 }}>
          <div className="eyebrow">What was the economic value</div>
          <div className="row" style={{ gap: 26 }}>
            <div><div className="display num" style={{ fontSize: 44 }}>{formatMoney(sim.plv.value)}</div><div className="small muted">Participant Lifetime Value</div></div>
            <div><div className="display num" style={{ fontSize: 44 }}>{formatMoney(sim.clv, { compact: true })}</div><div className="small muted">Community Lifetime Value</div></div>
          </div>
          <p className="small muted">Event margin {formatMoney(sim.revenue.margin)}. Volunteering and cause impact are reported separately, never as dollars.</p>
        </section>
      </div>

      <Card title="4W engagement">
        <div className="grid-2">
          <Bars rows={ws.map((w) => ({ label: FOUR_WS[w].name, value: sim.impact.fourWActivities[w], color: `var(--w-${w})` }))} />
          <p className="small">{totalW} participants ({pct(totalW / sim.registered)}) joined a {ws.map((w) => FOUR_WS[w].name).join(' or ')} activity. {sim.impact.resourcesAccessed} visited a community resource{sim.impact.storiesCollected ? `, and ${sim.impact.storiesCollected} shared a story for the archive` : ''}.</p>
        </div>
      </Card>

      <Card title="You said / We learned">
        <div className="stack">
          {said.map((f) => (
            <div key={f.theme} className="grid-2" style={{ alignItems: 'start' }}>
              <div className="quote">“{f.quote}”<div className="small muted" style={{ marginTop: 4 }}>{f.theme} · {f.mentions} mentions</div></div>
              <p className="small" style={{ paddingTop: 10 }}>{WE_LEARNED[f.theme] ?? (f.sentiment === 'need' ? 'We heard you. This is on the list for what happens next.' : 'Keep doing this.')}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="What happens next" aside={<span className="small muted">{hub.syncable} contacts can sync to HubSpot · {hub.withheld} did not opt in</span>}>
        <div>
          {sim.nextActions.map((a, i) => (
            <div key={a.id} className="action-item">
              <span className="n">{i + 1}</span>
              <div className="min0 stack" style={{ gap: 6 }}>
                <div style={{ fontWeight: 700 }}>{a.title} {a.fourW && <WChip id={a.fourW} />}</div>
                <div className="small muted">{a.why}</div>
                <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => send(a)} disabled={sent[a.id]}>
                  {sent[a.id] ? <><Icon name="check" size={14} /> Sent to HubSpot</> : `Send to ${a.crm}`}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="row">
        <button className="btn btn-secondary" onClick={() => setTab('cause')}>Cause Impact Summary</button>
        <button className="btn btn-secondary" onClick={() => setTab('sponsors')}>Sponsor results</button>
        <button className="btn btn-secondary" onClick={() => setTab('intelligence')}>Full Community Intelligence</button>
      </div>
    </div>
  );
}
