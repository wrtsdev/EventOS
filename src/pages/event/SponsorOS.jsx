import { Fragment } from 'react';
import { formatMoney, pct } from '../../domain/metrics.js';
import { SAMPLE_ZIPS } from '../../domain/simulate.js';
import { Card } from '../../components/ui.jsx';

const ROWS = [
  ['Impressions', (s) => s.impressions.toLocaleString()],
  ['Clicks', (s) => s.clicks],
  ['Registrations attributed', (s) => s.registrations],
  ['Promo code uses', (s) => s.promoRedemptions],
  ['Participant interactions (booth)', (s) => s.boothVisits || '—'],
  ['Survey recall', (s) => (s.surveyRecall != null ? pct(s.surveyRecall) : 'After event')],
  ['Referrals', (s) => s.referrals],
  ['Geographic reach', (s) => `${s.zipsReached} of ${SAMPLE_ZIPS.length} ZIPs`],
  ['Cause impact', (s) => (s.causeImpact ? `${formatMoney(s.causeImpact)} matched` : '—')],
];

export default function SponsorOS({ event, sim }) {
  if (!sim.sponsors.length) {
    return <div className="empty">No sponsors on this event. Turn on sponsor visibility in the Event Builder and EventOS will suggest partners that fit your 4W focus.</div>;
  }
  const planning = event.phase === 'planning';
  return (
    <div className="stack-lg">
      <section className="compare">
        <div className="old">
          <div className="eyebrow">What sponsors usually get</div>
          <b>A logo on a shirt</b>
          <p className="small" style={{ marginTop: 8 }}>No way to know if anyone noticed.</p>
        </div>
        <div className="new">
          <div className="eyebrow">What SponsorOS shows them</div>
          <b>Measurable activation</b>
          <p className="small" style={{ marginTop: 8, color: '#c8d7ff' }}>Registrations, booth conversations, recall, reach and cause impact they can take back to their board.</p>
        </div>
      </section>

      {planning && <div className="info small">Sponsor tracking starts when registration opens. Below is each sponsor’s planned activation.</div>}

      <div className="grid-2">
        {sim.sponsors.map((s) => (
          <Card key={s.id} title={s.name} aside={<span className="pill neutral plain">{s.tier} · {formatMoney(s.amount)}</span>}>
            <p className="small" style={{ marginBottom: 10 }}><strong>Activation:</strong> {s.activation}</p>
            {planning ? <p className="small muted">Metrics appear here once participants start engaging.</p> : (
              <dl className="kv">
                {ROWS.map(([label, fn]) => (
                  <Fragment key={label}><dt>{label}</dt><dd>{fn(s)}</dd></Fragment>
                ))}
              </dl>
            )}
          </Card>
        ))}
      </div>

      {!planning && (
        <Card title="Cost per engaged participant">
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Sponsor</th><th className="r">Investment</th><th className="r">Engaged people</th><th className="r">Cost per engaged</th></tr></thead>
              <tbody>
                {sim.sponsors.map((s) => {
                  const engaged = s.boothVisits + s.registrations + s.promoRedemptions;
                  return (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td className="r">{formatMoney(s.amount)}</td>
                      <td className="r">{engaged}</td>
                      <td className="r">{engaged ? formatMoney(s.amount / engaged) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>Engaged people = booth visits + attributed registrations + promo code uses. Counts only; no participant contact data is shared without partner-sharing consent.</p>
        </Card>
      )}
    </div>
  );
}
