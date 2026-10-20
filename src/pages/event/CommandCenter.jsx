import { readiness } from '../../domain/blueprint.js';
import { formatMoney, pct } from '../../domain/metrics.js';
import { FOUR_WS } from '../../domain/fourW.js';
import { Card, Stat, Ring, Progress, Columns, Bars, readinessTone } from '../../components/ui.jsx';
import { useStore } from '../../store.jsx';
import { nextStatus, STATUS } from '../../domain/blueprint.js';
import Icon from '../../components/Icon.jsx';

const OPS = [
  ['permits', 'Permits'],
  ['insurance', 'Insurance'],
  ['timing', 'Timing'],
  ['volunteers', 'Volunteers'],
  ['vendors', 'Vendors'],
  ['ems', 'EMS'],
  ['security', 'Police / security'],
  ['route', 'Course approval'],
];

export default function CommandCenter({ event, sim, setTab }) {
  const { dispatch } = useStore();
  const r = readiness(event);
  const byId = Object.fromEntries(r.items.map((i) => [i.id, i]));
  const planning = event.phase === 'planning';
  const complete = event.phase === 'complete';
  const rev = sim.revenue;

  const attention = [
    ...r.blocking.map((i) => ({ tone: 'bad', text: `${i.label} is blocking`, tab: 'blueprint' })),
    ...(event.phase === 'live' && sim.registered / sim.goal < 0.8 ? [{ tone: 'warn', text: `Registration at ${pct(sim.registered / sim.goal)} of goal. Biggest drop: ${sim.leakFrom} → ${sim.leakStage}`, tab: 'intelligence' }] : []),
    ...(event.phase === 'live' && sim.impact.volunteers < sim.impact.volunteersNeeded ? [{ tone: 'warn', text: `${sim.impact.volunteersNeeded - sim.impact.volunteers} more volunteers needed`, tab: 'ops' }] : []),
    ...r.attention.slice(0, 3).map((i) => ({ tone: 'warn', text: `${i.label} needs attention`, tab: 'blueprint' })),
  ].slice(0, 6);

  const weeks = ['8w', '7w', '6w', '5w', '4w', '3w', '2w', '1w'];

  return (
    <div className="stack-lg">
      <div className="grid-2">
        <Card title={complete ? 'How it went' : 'What requires attention'}>
          {complete ? (
            <div className="stack" style={{ gap: 10 }}>
              <p>{sim.finishers} finishers, {sim.impact.volunteers} volunteers, {formatMoney(sim.impact.raised)} raised, average satisfaction {sim.impact.avgSatisfaction?.toFixed(1)} of 5.</p>
              <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => setTab('impact')}>Open the Impact Report <Icon name="arrow" size={16} /></button>
            </div>
          ) : attention.length ? (
            <ul className="list-plain">
              {attention.map((a, i) => (
                <li key={i} className="spread" style={{ flexWrap: 'nowrap' }}>
                  <span className="row min0" style={{ gap: 8, flexWrap: 'nowrap' }}>
                    <span className={`pill ${a.tone} plain`} style={{ padding: '3px 7px' }}><Icon name={a.tone === 'bad' ? 'alert' : 'flag'} size={14} /></span>
                    <span className="min0">{a.text}</span>
                  </span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setTab(a.tab)}>Open</button>
                </li>
              ))}
            </ul>
          ) : <p>Nothing needs you right now.</p>}
        </Card>
        <section className="card">
          <div className="row" style={{ gap: 18, flexWrap: 'nowrap' }}>
            <Ring value={r.score} label={r.score + '%'} caption="Ready" size={104} tone={readinessTone(r.score)} />
            <div className="min0 stack" style={{ gap: 6 }}>
              <div className="eyebrow">Participant Lifetime Value{sim.plv.projected ? ' (projected)' : ''}</div>
              <div className="display num" style={{ fontSize: 46 }}>{formatMoney(sim.plv.value)}</div>
              <div className="small muted">Community Lifetime Value {formatMoney(sim.clv, { compact: true })} · CVI {sim.cvi ? `${sim.cvi.value}/100` : 'after registration opens'}</div>
              <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => setTab('value')}>How this is calculated</button>
            </div>
          </div>
        </section>
      </div>

      <section className="stack">
        <h3 className="eyebrow">Registration</h3>
        {planning ? (
          <div className="info">Registration has not opened. Goal: <strong>{sim.goal}</strong> participants. Use <strong>Open registration</strong> above to see live data flow in from RunSignup, Race Roster and EventOS registration.</div>
        ) : (
          <>
            <div className="grid-stats">
              <Stat label="Registered" value={sim.registered} sub={`Goal ${sim.goal}`} />
              <Stat label="Of goal" value={pct(sim.registered / sim.goal)} />
              <Stat label="Page conversion" value={pct(sim.conversionRate, 1)} sub="Visitors who registered" />
              <Stat label="Teams" value={sim.teams.length} sub={`${sim.engagement.teamRegistrations} people on teams`} />
            </div>
            <Card title="Registrations by week">
              <Progress value={sim.registered / sim.goal} />
              <div style={{ marginTop: 14 }}>
                <Columns
                  values={sim.regSeries}
                  ghost={event.phase === 'live' ? [Math.round((sim.goal - sim.registered) * 0.4), Math.round((sim.goal - sim.registered) * 0.6)] : []}
                  labels={weeks}
                />
              </div>
              {event.phase === 'live' && <p className="small muted" style={{ marginTop: 8 }}>Striped bars show what you need in the final two weeks to reach goal.</p>}
            </Card>
          </>
        )}
      </section>

      <section className="stack">
        <h3 className="eyebrow">Operations</h3>
        <div className="ops-grid">
          {OPS.map(([id, label]) => {
            const item = byId[id];
            if (!item) return <div key={id} className="ops-tile" style={{ borderColor: 'var(--line)' }}>{label}<small className="muted">Not needed</small></div>;
            const tone = STATUS[item.status].tone;
            return (
              <button key={id} className={`ops-tile ${tone}`} onClick={() => dispatch({ type: 'setChecklist', id: event.id, item: id, status: nextStatus(item.status) })} title="Tap to change status">
                {label}
                <small>{STATUS[item.status].label}</small>
              </button>
            );
          })}
        </div>
        <p className="small muted">Green is complete, yellow needs attention, red is blocking. Tap a tile to update it.</p>
      </section>

      <div className="grid-2">
        <Card title={planning ? 'Projected budget' : 'Revenue'}>
          <dl className="kv">
            <dt>Registration</dt><dd>{formatMoney(planning ? sim.goal * (Number(event.price) || 0) : rev.registration)}</dd>
            <dt>Sponsorship</dt><dd>{formatMoney(planning ? sim.sponsors.reduce((a, s) => a + s.amount, 0) : rev.sponsorship)}</dd>
            <dt>Donations to cause</dt><dd>{formatMoney(rev.donations + rev.fundraising)}</dd>
            <dt>Merchandise</dt><dd>{formatMoney(rev.merchandise)}</dd>
            <dt>Estimated costs</dt><dd>−{formatMoney(rev.costs)}</dd>
            <dt className="total">{event.phase === 'live' ? 'Projected margin at goal' : planning ? 'Margin so far' : 'Event margin'}</dt>
            <dd className="total" style={{ color: (event.phase === 'live' ? rev.projectedMargin : rev.margin) >= 0 ? 'var(--good)' : 'var(--bad)' }}>{formatMoney(event.phase === 'live' ? rev.projectedMargin : rev.margin)}</dd>
          </dl>
          <p className="small muted" style={{ marginTop: 10 }}>Cause donations pass through to the beneficiary and are not counted in margin.</p>
        </Card>
        <Card title="Engagement">
          {planning ? <p className="muted small">Email, referral and team activity appear once registration opens.</p> : (
            <dl className="kv">
              <dt>Emails sent</dt><dd>{sim.engagement.emailsSent}</dd>
              <dt>Open rate</dt><dd>{pct(sim.engagement.openRate)}</dd>
              <dt>Click rate</dt><dd>{pct(sim.engagement.clickRate)}</dd>
              <dt>Referral registrations</dt><dd>{sim.engagement.referralRegistrations}</dd>
              <dt>Team registrations</dt><dd>{sim.engagement.teamRegistrations}</dd>
              <dt>Fundraising pages</dt><dd>{sim.engagement.fundraisingPages}</dd>
              <dt>Raised by teams</dt><dd>{formatMoney(sim.engagement.fundraising)}</dd>
            </dl>
          )}
        </Card>
      </div>

      <Card title="Community impact" aside={<button className="btn btn-ghost btn-sm" onClick={() => setTab('cause')}>Open CauseOS</button>}>
        {planning ? <p className="muted small">Cause participation, volunteers, survey results and 4W activity are tracked here from the day registration opens.</p> : (
          <div className="grid-2">
            <dl className="kv">
              <dt>Took a cause action</dt><dd>{sim.impact.causeParticipants}</dd>
              <dt>Volunteers</dt><dd>{sim.impact.volunteers} of {sim.impact.volunteersNeeded}</dd>
              <dt>Survey responses</dt><dd>{complete ? sim.impact.surveyResponses : 'After event'}</dd>
              <dt>Average satisfaction</dt><dd>{complete ? sim.impact.avgSatisfaction.toFixed(1) + ' / 5' : 'After event'}</dd>
              <dt>Community resources accessed</dt><dd>{complete ? sim.impact.resourcesAccessed : 'After event'}</dd>
            </dl>
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>4W activities</div>
              {complete
                ? <Bars rows={Object.entries(sim.impact.fourWActivities).map(([w, v]) => ({ label: FOUR_WS[w].name, value: v, color: `var(--w-${w})` }))} />
                : <p className="small muted">Activity check-ins start on event day.</p>}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
