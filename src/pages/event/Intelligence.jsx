import { Fragment, useMemo } from 'react';
import { allowedFor } from '../../integrations/adapter.js';
import { FOUR_WS } from '../../domain/fourW.js';
import { pct } from '../../domain/metrics.js';
import { Card, Bars, WChip } from '../../components/ui.jsx';
import { useStore } from '../../store.jsx';

function Section({ name, question, children }) {
  return (
    <section className="stack">
      <div>
        <div className="eyebrow">{question}</div>
        <h2 className="display" style={{ fontSize: 34 }}>{name}</h2>
      </div>
      {children}
    </section>
  );
}

export default function Intelligence({ event, sim }) {
  const { navigate } = useStore();
  const consented = useMemo(() => sim.participants.filter((p) => allowedFor('analytics', p)), [sim]);
  const withheld = sim.participants.length - consented.length;
  const complete = event.phase === 'complete';

  if (!sim.registered) {
    return <div className="empty">Community Intelligence starts listening when registration opens. Use <strong>Open registration</strong> above to see it work.</div>;
  }

  const returning = consented.filter((p) => p.returning).length;
  const likely = consented.filter((p) => p.likelyReturn).length;
  const negatives = sim.feedback.filter((f) => f.sentiment === 'negative');
  const positives = sim.feedback.filter((f) => f.sentiment === 'positive');
  const ws = event.fourWs ?? [];
  const eng = (s) => (s.boothVisits ?? 0) + (s.registrations ?? 0) + (s.promoRedemptions ?? 0);
  const sponsorRank = sim.live ? [] : [...sim.sponsors].sort((a, b) => eng(b) - eng(a));

  const improvements = [
    sim.leakStage && `Fix the "${sim.leakFrom} → ${sim.leakStage}" step: shorten the form and show the total price up front.`,
    ...negatives.slice(0, 3).map((f) => {
      if (f.theme.includes('Parking')) return 'Publish a parking and arrival map in the know-before-you-go message.';
      if (f.theme.includes('Check-in')) return 'Add a second packet pickup window the day before.';
      if (f.theme.includes('water')) return 'Add a water station near the midpoint of the course.';
      return `Address: ${f.theme.toLowerCase()}.`;
    }),
    sim.referralGroups[0] && `Give ${sim.referralGroups[0].group.toLowerCase()} a team challenge; they brought the most people.`,
    sim.zips.at(-1) && `ZIP ${sim.zips.at(-1).zip} had the fewest participants. Partner with an organization based there.`,
  ].filter(Boolean);

  const nextNeed = sim.needs[0];

  return (
    <div className="stack-lg">
      <div className="info small">
        Based on <strong>{consented.length}</strong> participants who allowed analytics{withheld ? ` (${withheld} opted out and are excluded)` : ''}. EventOS never infers health conditions, race or ethnicity, religion, political views or other sensitive traits.
      </div>

      <Section name="Listen" question="What did participants tell us?">
        {complete ? (
          <div className="grid-2">
            <Card title="What people liked">
              <Bars rows={positives.map((f) => ({ label: f.theme, value: f.mentions, color: 'var(--good)' }))} />
            </Card>
            <Card title="What people disliked">
              <Bars rows={negatives.map((f) => ({ label: f.theme, value: f.mentions, color: 'var(--bad)' }))} />
            </Card>
            <Card title="Community needs that appeared in feedback">
              <ul className="list-plain">
                {sim.needs.map((n) => (
                  <li key={n.need} className="spread">
                    <span className="row" style={{ gap: 8 }}><WChip id={n.fourW} /> {n.need}</span>
                    <strong className="num">{n.mentions}</strong>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        ) : <p className="muted small">Survey feedback arrives after the event. Until then, Listen shows registration questions and team comments.</p>}
      </Section>

      <Section name="Engage" question="Who is showing up, and who brought them?">
        <div className="grid-stats">
          <div className="stat"><span className="label">Returning</span><span className="value">{returning}</span><span className="sub">{pct(returning / consented.length)} of participants</span></div>
          <div className="stat"><span className="label">First-time</span><span className="value">{consented.length - returning}</span></div>
          <div className="stat"><span className="label">Likely to return</span><span className="value">{likely}</span><span className="sub">Modeled from history and engagement</span></div>
          <div className="stat"><span className="label">Referrals</span><span className="value">{sim.referrals}</span></div>
        </div>
        <div className="grid-2">
          <Card title="Which groups generated referrals">
            <Bars rows={sim.referralGroups.map((g) => ({ label: g.group, value: g.referrals }))} />
          </Card>
          <Card title="Which ZIP codes are participating">
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>ZIP</th><th className="r">Participants</th><th className="r">Returning</th><th className="r">Share</th></tr></thead>
                <tbody>
                  {sim.zips.map((z) => (
                    <tr key={z.zip}><td>{z.zip}</td><td className="r">{z.count}</td><td className="r">{z.returning}</td><td className="r">{pct(z.count / sim.registered)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted" style={{ marginTop: 8 }}>ZIP codes are shown only as counts. Areas under 10 participants are grouped in exports.</p>
          </Card>
        </div>
      </Section>

      <Section name="Learn" question="What worked, and where did we lose people?">
        <div className="grid-2">
          <Card title="Registration funnel">
            {sim.funnel.length ? <><Bars rows={sim.funnel.map((f) => ({ label: f.stage, value: f.count, color: f.stage === sim.leakStage ? 'var(--warn)' : undefined }))} format={(v) => v.toLocaleString()} />
            <p className="small" style={{ marginTop: 10 }}>Biggest in-form drop: <strong>{sim.leakFrom} → {sim.leakStage}</strong>.</p></> : <p className="small muted">Page views are not tracked yet, so the funnel starts at registration: {sim.registered} registered, {sim.payments?.pending ?? 0} with unfinished payment.</p>}
          </Card>
          <Card title="Which cause and 4W produced engagement">
            <dl className="kv">
              <dt>{event.cause || 'Cause'} actions</dt><dd>{sim.impact.causeParticipants}</dd>
              {ws.map((w) => (
                <Fragment key={w + 'i'}><dt>{FOUR_WS[w].name} interest</dt><dd>{consented.filter((p) => p.fourWInterest.includes(w)).length}</dd></Fragment>
              ))}
              {complete && ws.map((w) => (
                <Fragment key={w + 'j'}><dt>{FOUR_WS[w].name} activities joined</dt><dd>{sim.impact.fourWActivities[w]}</dd></Fragment>
              ))}
            </dl>
          </Card>
          {sponsorRank.length > 0 && (
            <Card title="Which sponsors generated engagement">
              <Bars rows={sponsorRank.map((s) => ({ label: s.name, value: eng(s) }))} />
            </Card>
          )}
          <Card title="Where participants came from">
            <Bars rows={sim.sources.map((s) => ({ label: s.source === 'runsignup' ? 'RunSignup' : s.source === 'raceroster' ? 'Race Roster' : 'EventOS registration', value: s.count }))} />
          </Card>
        </div>
      </Section>

      <Section name="Improve" question="What should we change, and what comes next?">
        <div className="grid-2">
          <Card title="What to improve">
            <ol className="bullets">{improvements.map((x) => <li key={x}>{x}</li>)}</ol>
          </Card>
          <Card title="What event to consider next">
            {nextNeed ? (
              <div className="stack" style={{ gap: 10 }}>
                <WChip id={nextNeed.fourW} />
                <p style={{ fontWeight: 700 }}>A {nextNeed.need.toLowerCase()} paired with a monthly community walk.</p>
                <p className="small muted">{nextNeed.mentions} people asked for it. {FOUR_WS[nextNeed.fourW].prompt}</p>
                <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('builder')}>Start planning it</button>
              </div>
            ) : <p className="small muted">Recommendations appear once survey results are in.</p>}
          </Card>
        </div>
      </Section>
    </div>
  );
}
