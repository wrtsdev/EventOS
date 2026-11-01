import { Fragment, useMemo } from 'react';
import { useStore } from '../../store.jsx';
import { formatMoney, pct } from '../../domain/metrics.js';
import { SAMPLE_ZIPS } from '../../domain/simulate.js';
import { fulfillment, packageInventory } from '../../domain/sponsors.js';
import { Card, Stat, Gate, DemoTag } from '../../components/ui.jsx';

const ROWS = [
  ['Impressions', (s) => s.impressions.toLocaleString()],
  ['Clicks', (s) => s.clicks],
  ['Registrations attributed', (s) => s.registrations],
  ['Promo code uses', (s) => s.promoRedemptions],
  ['Booth interactions', (s) => s.boothVisits || '—'],
  ['Survey recall', (s) => (s.surveyRecall != null ? pct(s.surveyRecall) : 'After event')],
  ['Referrals', (s) => s.referrals],
  ['Geographic reach', (s) => `${s.zipsReached} of ${SAMPLE_ZIPS.length} ZIPs`],
  ['Cause impact', (s) => (s.causeImpact ? `${formatMoney(s.causeImpact)} matched` : '—')],
];
const STATUS_NEXT = { pending: 'delivered', delivered: 'missed', missed: 'pending' };
const TONE = { pending: 'neutral', delivered: 'good', missed: 'bad' };
const COMMIT_TONE = { pledged: 'neutral', invoiced: 'warn', paid: 'good' };

export default function SponsorOS({ event, sim }) {
  const { dispatch, can, org } = useStore();
  const ful = useMemo(() => fulfillment(event), [event]);
  const inventory = useMemo(() => packageInventory(event), [event]);
  const editable = can('partners.edit') && event.status !== 'canceled';
  const planning = event.phase === 'planning';

  if (!sim.sponsors.length) {
    return <div className="empty">No sponsors on this event. Turn on sponsor visibility in the Event Builder and EventOS will suggest partners that fit your 4W focus.</div>;
  }

  const setDeliverable = (sid, did, status) => dispatch({ type: 'updateEvent', id: event.id, perm: 'partners.edit', patch: (e) => ({ deliverables: { ...(e.deliverables ?? {}), [sid]: { ...(e.deliverables?.[sid] ?? {}), [did]: status } } }) });
  const setCommit = (sid, status) => dispatch({ type: 'updateEvent', id: event.id, perm: 'partners.edit', patch: (e) => ({ sponsorCommitments: { ...(e.sponsorCommitments ?? {}), [sid]: status } }) });

  return (
    <Gate feature="sponsorOS" tier={org?.tier}>
      <div className="stack-lg">
        <div className="spread">
          <div>
            <div className="eyebrow">Sponsorship and community commerce</div>
            <h2 className="display" style={{ fontSize: 32 }}>Sponsor performance and fulfillment</h2>
          </div>
          <DemoTag>Synthetic engagement data</DemoTag>
        </div>

        <div className="grid-stats">
          <Stat label="Committed" value={formatMoney(ful.committed, { compact: true })} sub={`${ful.rows.length} sponsors`} />
          <Stat label="Paid" value={formatMoney(ful.rows.filter((r) => r.commitment === 'paid').reduce((a, r) => a + r.sponsor.amount, 0), { compact: true })} sub="Received" />
          <Stat label="Deliverables met" value={ful.rate == null ? '—' : pct(ful.rate)} sub={`${ful.delivered} of ${ful.total}`} />
          <Stat label="Missed deliverables" value={ful.rows.reduce((a, r) => a + r.missed, 0)} sub="Owed a make-good" />
        </div>

        <Card title="Packages and inventory">
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Package</th><th className="r">Price</th><th className="r">Sold</th><th className="r">Available</th><th>Benefits</th></tr></thead>
              <tbody>
                {inventory.map((p) => <tr key={p.id}><td style={{ fontWeight: 600 }}>{p.name}</td><td className="r">{p.price ? formatMoney(p.price) : 'In-kind'}</td><td className="r">{p.sold}</td><td className="r">{Math.max(0, p.inventory - p.sold)}</td><td className="small muted">{p.benefits.join(' · ')}</td></tr>)}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Fulfillment Report" aside={<span className="small muted">Tap a status to update</span>}>
          <div className="stack">
            {ful.rows.map((r) => (
              <section key={r.sponsor.id} className="stack" style={{ gap: 6 }}>
                <div className="spread">
                  <strong>{r.sponsor.name} <span className="small muted">· {r.sponsor.tier} · {formatMoney(r.sponsor.amount)}</span></strong>
                  {editable
                    ? <select aria-label={`Commitment ${r.sponsor.name}`} className="inline-input" value={r.commitment} onChange={(e) => setCommit(r.sponsor.id, e.target.value)}><option value="pledged">Pledged</option><option value="invoiced">Invoiced</option><option value="paid">Paid</option></select>
                    : <span className={`pill ${COMMIT_TONE[r.commitment]}`}>{r.commitment}</span>}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {r.items.map((d) => (
                    editable
                      ? <button key={d.id} className={`pill ${TONE[d.status]}`} style={{ border: 0, cursor: 'pointer' }} onClick={() => setDeliverable(r.sponsor.id, d.id, STATUS_NEXT[d.status])} title={`${d.label}: ${d.status}`}>{d.label}</button>
                      : <span key={d.id} className={`pill ${TONE[d.status]}`}>{d.label}</span>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </Card>

        {planning && <div className="info small">Visibility metrics start when registration opens.</div>}
        {!planning && (
          <div className="grid-2">
            {sim.sponsors.map((s) => (
              <Card key={s.id} title={s.name} aside={<span className="pill neutral plain">{s.tier}</span>}>
                <p className="small" style={{ marginBottom: 10 }}><strong>Activation:</strong> {s.activation}</p>
                <dl className="kv">
                  {ROWS.map(([label, fn]) => <Fragment key={label}><dt>{label}</dt><dd>{fn(s)}</dd></Fragment>)}
                </dl>
              </Card>
            ))}
          </div>
        )}

        {!planning && (
          <Card title="Cost per engaged participant">
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Sponsor</th><th className="r">Investment</th><th className="r">Engaged people</th><th className="r">Cost per engaged</th></tr></thead>
                <tbody>
                  {sim.sponsors.map((s) => {
                    const engaged = s.boothVisits + s.registrations + s.promoRedemptions;
                    return <tr key={s.id}><td>{s.name}</td><td className="r">{formatMoney(s.amount)}</td><td className="r">{engaged}</td><td className="r">{engaged ? formatMoney(s.amount / engaged) : '—'}</td></tr>;
                  })}
                </tbody>
              </table>
            </div>
            <p className="small muted" style={{ marginTop: 8 }}>Counts only. No participant contact data goes to sponsors without partner-sharing consent.</p>
          </Card>
        )}
      </div>
    </Gate>
  );
}
