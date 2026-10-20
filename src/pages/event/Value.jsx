import { formatMoney } from '../../domain/metrics.js';
import { Card, Ring, Bars, Progress } from '../../components/ui.jsx';

const COMPONENT_LABELS = {
  contribution: 'Event contribution margin',
  merchandise: 'Merchandise margin',
  membership: 'Membership',
  referrals: 'Attributable referrals',
  sponsor: 'Sponsor-attributed value',
};

export default function Value({ event, sim }) {
  const plv = sim.plv;
  const cvi = sim.cvi;
  return (
    <div className="stack-lg">
      <div className="grid-2">
        <section className="card stack">
          <div>
            <div className="eyebrow">Economic value{plv.projected ? ' · projected from your plan' : ''}</div>
            <h3 className="display" style={{ fontSize: 28, marginTop: 4 }}>Participant Lifetime Value</h3>
          </div>
          <div className="display num" style={{ fontSize: 72, color: 'var(--accent)' }}>{formatMoney(plv.value)}</div>
          <p className="small">The modeled economic contribution of one participant over about <strong>{plv.expectedYears} years</strong> with your organization, at roughly {plv.eventsPerYear} events a year.</p>
          <Bars rows={Object.entries(plv.components).map(([k, v]) => ({ label: COMPONENT_LABELS[k], value: Math.max(0, v) }))} format={(v) => formatMoney(v)} />
        </section>

        <section className="card stack">
          <div>
            <div className="eyebrow">Economic value across your community</div>
            <h3 className="display" style={{ fontSize: 28, marginTop: 4 }}>Community Lifetime Value</h3>
          </div>
          <div className="display num" style={{ fontSize: 72, color: 'var(--accent)' }}>{formatMoney(sim.clv, { compact: true })}</div>
          <p className="small">PLV × <strong>{sim.uniqueMembers.toLocaleString()}</strong> unique community members in your Passport network{plv.projected ? ' (including projected first-timers)' : ''}.</p>
          <div className="info small">
            <strong>What is not in these numbers:</strong> volunteering, cause engagement, stories and social impact. EventOS never converts those into dollars. They are measured in the Community Value Index.
          </div>
        </section>
      </div>

      <section className="card">
        {cvi ? (
          <div className="stack">
            <div className="row" style={{ gap: 20, alignItems: 'flex-start' }}>
              <Ring value={cvi.value} caption="of 100" size={140} stroke={13} />
              <div className="min0 stack" style={{ gap: 6, flex: 1, minWidth: 220 }}>
                <div className="eyebrow">Non-financial · Is this event building community?</div>
                <h3 className="display" style={{ fontSize: 30 }}>Community Value Index: {cvi.band}</h3>
                <p className="small">Each input is scored against a healthy-community target and weighted. The two weakest areas are where the next event can do the most good: <strong>{cvi.weakest.map((w) => w.label.toLowerCase()).join(' and ')}</strong>.</p>
              </div>
            </div>
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Input</th><th>What it measures</th><th className="r">Weight</th><th style={{ minWidth: 120 }}>Score</th></tr></thead>
                <tbody>
                  {cvi.components.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.label}</td>
                      <td className="muted">{c.describe}</td>
                      <td className="r">{c.weight}</td>
                      <td><div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><span style={{ flex: 1 }}><Progress value={c.score / 100} /></span><span className="num" style={{ width: 28, textAlign: 'right' }}>{c.score}</span></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="stack" style={{ gap: 6 }}>
            <div className="eyebrow">Community Value Index</div>
            <p>The index starts measuring when people register: repeat participation, cause engagement, referrals, volunteering, Passport activity, feedback, community involvement, sponsor engagement and 4W participation.</p>
          </div>
        )}
      </section>

      <Card title="How PLV is calculated">
        <ol className="bullets small">
          <li>Per event: (registration revenue − direct costs + merchandise margin + sponsor-attributed value) ÷ participants. This event: <strong>{formatMoney(plv.perEvent)}</strong>.</li>
          <li>Per year: per-event value × events a year, plus membership, plus a one-time credit for each person a participant refers.</li>
          <li>Lifetime: yearly value × expected years, from your returning-participant rate (capped at 6 years).</li>
          <li>Sponsor-attributed value is 35% of sponsorship, the share modeled as renewal value driven by participant engagement.</li>
        </ol>
      </Card>
    </div>
  );
}
