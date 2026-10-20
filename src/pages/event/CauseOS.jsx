import { useState } from 'react';
import { formatMoney, pct } from '../../domain/metrics.js';
import { FOUR_WS } from '../../domain/fourW.js';
import { Card, Stat, Progress } from '../../components/ui.jsx';

export default function CauseOS({ event, sim }) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!event.cause) {
    return <div className="empty">This event has no beneficiary yet. Add one in the Event Builder to track funds raised, supporters and stories for a nonprofit partner.</div>;
  }

  const raised = sim.impact.raised;
  const goal = Math.round((Number(event.expected) || 100) * 40 / 500) * 500 || 2000;
  const supporters = sim.impact.causeParticipants;
  const donors = sim.participants.filter((p) => p.donated).length;
  const ws = event.fourWs ?? [];
  const stories = sim.feedback.filter((f) => f.sentiment !== 'negative').slice(0, 3);
  const actions = [
    { label: 'Gave a donation', value: donors },
    { label: 'Fundraised with a team', value: sim.teams.filter((t) => t.raised > 0).reduce((a, t) => a + t.members, 0) },
    { label: 'Signed up for cause updates', value: sim.participants.filter((p) => p.causeAction && p.consent.marketing).length },
    { label: 'Volunteered', value: sim.impact.volunteers },
    ...(sim.impact.storiesCollected ? [{ label: 'Shared a story', value: sim.impact.storiesCollected }] : []),
  ];
  const milestones = [
    { at: goal * 0.25, label: 'First quarter of goal' },
    { at: goal * 0.5, label: 'Halfway' },
    { at: goal, label: 'Goal reached' },
    { at: goal * 1.25, label: 'Stretch goal' },
  ];

  const summary = [
    `${event.name}: Cause Impact Summary for ${event.cause}`,
    ``,
    `${supporters} of ${sim.registered} participants (${pct(sim.registered ? supporters / sim.registered : 0)}) took action for ${event.cause}.`,
    `${formatMoney(raised)} raised: ${formatMoney(sim.revenue.donations)} in direct donations and ${formatMoney(sim.revenue.fundraising)} through team fundraising.`,
    `${sim.impact.volunteers} volunteers gave about ${sim.impact.volunteerHours} hours.`,
    ws.length ? `Focus: ${ws.map((w) => FOUR_WS[w].name).join(' + ')}. ${ws.map((w) => FOUR_WS[w].goal).join(' ')}` : '',
    sim.impact.storiesCollected ? `${sim.impact.storiesCollected} community stories were recorded with consent.` : '',
    ``,
    `Participants who agreed to hear from ${event.cause}: ${sim.participants.filter((p) => p.causeAction && p.consent.sharePartners).length}. Contact details are shared only with explicit partner-sharing consent.`,
  ].filter((l, i, arr) => l !== '' || arr[i - 1] !== '').join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
    } catch {
      setCopied(false);
      const el = document.getElementById('cause-summary');
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  };

  return (
    <div className="stack-lg">
      <section className="card stack">
        <div className="spread">
          <div>
            <div className="eyebrow">Beneficiary</div>
            <h3 className="display" style={{ fontSize: 32, marginTop: 4 }}>{event.cause}</h3>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setSummaryOpen(true)} disabled={event.phase === 'planning'}>Generate Cause Impact Summary</button>
        </div>
        <div className="spread small"><span><strong className="num">{formatMoney(raised)}</strong> raised</span><span className="muted num">Goal {formatMoney(goal)}</span></div>
        <Progress value={raised / goal} />
        {event.phase === 'planning' && <p className="small muted">Funds, supporters and stories appear once registration opens.</p>}
      </section>

      {summaryOpen && (
        <Card title="Cause Impact Summary" aside={<span className="row" style={{ gap: 6 }}><button className="btn btn-secondary btn-sm" onClick={copy}>{copied ? 'Copied' : 'Copy text'}</button><button className="btn btn-ghost btn-sm" onClick={() => setSummaryOpen(false)}>Close</button></span>}>
          <pre id="cause-summary" className="code" style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-body)', fontSize: 14 }}>{summary}</pre>
        </Card>
      )}

      <div className="grid-stats">
        <Stat label="Funds raised" value={formatMoney(raised, { compact: true })} />
        <Stat label="Supporters" value={supporters} sub="Took a cause action" />
        <Stat label="Volunteers" value={sim.impact.volunteers} sub={`${sim.impact.volunteerHours} hours`} />
        <Stat label="Donors" value={donors} />
      </div>

      <div className="grid-2">
        <Card title="Community actions">
          <ul className="list-plain">
            {actions.map((a) => <li key={a.label} className="spread"><span>{a.label}</span><strong className="num">{a.value}</strong></li>)}
          </ul>
        </Card>
        <Card title="Impact milestones">
          <ul className="timeline">
            {milestones.map((m) => {
              const hit = raised >= m.at;
              return (
                <li key={m.label} style={{ opacity: hit ? 1 : 0.6 }}>
                  <div style={{ fontWeight: 700 }}>{m.label} {hit && <span className="pill good" style={{ marginLeft: 6 }}>Reached</span>}</div>
                  <div className="small muted num">{formatMoney(m.at)}</div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card title="Stories">
        {stories.length ? (
          <div className="stack" style={{ gap: 10 }}>
            {stories.map((s) => <div key={s.theme} className="quote">“{s.quote}”<div className="small muted" style={{ marginTop: 4 }}>{s.theme}</div></div>)}
            <p className="small muted">Shared by participants who agreed to have their words used.</p>
          </div>
        ) : <p className="small muted">Stories come from post-event surveys and the story booth, with consent.</p>}
      </Card>
    </div>
  );
}
