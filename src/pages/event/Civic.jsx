import { useMemo, useState } from 'react';
import { useStore } from '../../store.jsx';
import { civicSummary, outcomesView, partnersFor, EVIDENCE } from '../../domain/civic.js';
import { formatMoney } from '../../domain/metrics.js';
import { Card, Stat, WChip, EvidencePill, Gate } from '../../components/ui.jsx';

const TYPE_LABEL = { beneficiary: 'Beneficiary', community: 'Community partner', vendor: 'Local vendor', sponsor: 'Sponsor' };

export function fmtValue(v, unit) {
  if (v == null) return '—';
  if (unit === '$') return formatMoney(v);
  if (unit?.startsWith('%')) return `${v}%`;
  return `${Number(v).toLocaleString()} ${unit}`;
}

export default function Civic({ event, sim }) {
  const { dispatch, can, org } = useStore();
  const cv = useMemo(() => civicSummary(event, sim), [event, sim]);
  const out = useMemo(() => outcomesView(event, sim), [event, sim]);
  const editable = can('partners.edit') && event.status !== 'canceled';
  const [copied, setCopied] = useState(false);
  const update = (patch, toast) => dispatch({ type: 'updateEvent', id: event.id, perm: 'partners.edit', patch, toast });
  const setPartner = (id, patch) => update({ partners: partnersFor(event).map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const setOutcome = (id, patch) => update({ outcomes: { ...(event.outcomes ?? {}), [id]: { ...(event.outcomes?.[id] ?? {}), ...patch } } });
  const dist = cv.distribution;
  const raised = sim?.impact?.raised ?? 0;

  const statement = [
    `Community Impact Statement: ${event.name}`,
    '',
    ...out.rows.map((r) => `${r.label}: ${r.actual != null ? fmtValue(r.actual, r.unit) : 'not measured'} (target ${fmtValue(r.target, r.unit)})${r.evidence ? `, ${EVIDENCE[r.evidence].label.toLowerCase()}` : ''}.`),
    '',
    `Partners: ${cv.partners.length} (${cv.local} local, ${cv.repeat} returning). Local vendor spending: ${formatMoney(cv.localSpend)}.`,
    event.cause ? `Funds distributed to ${event.cause}: ${dist.distributed != null ? formatMoney(dist.distributed) + (dist.evidence ? ` (${EVIDENCE[dist.evidence].label.toLowerCase()})` : '') : 'not yet recorded'}.` : '',
    '',
    'Reach (people attending) is reported separately from impact. Only verified results are presented as results; reported and estimated figures are labeled.',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');

  const copy = async () => {
    try { await navigator.clipboard.writeText(statement); setCopied(true); } catch {
      const el = document.getElementById('impact-statement');
      if (el) { const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
    }
  };

  return (
    <Gate feature="partners" tier={org?.tier}>
      <div className="stack-lg">
        <div>
          <div className="eyebrow">Civic Influence · Partners and outcomes</div>
          <h2 className="display" style={{ fontSize: 32 }}>Community benefit, with evidence</h2>
        </div>

        <div className="grid-stats">
          <Stat label="Partners" value={cv.partners.length} sub={`${cv.local} local · ${cv.repeat} returning`} />
          <Stat label="Intended outcomes set" value={`${cv.withIntended}/${cv.partners.length}`} sub="Agreed before the event" />
          <Stat label="Outcomes measured" value={`${out.measured}/${out.total}`} sub={`${out.verified} verified`} />
          <Stat label="Local vendor spending" value={formatMoney(cv.localSpend, { compact: true })} sub={`${cv.localVendors.length} local vendors`} />
        </div>

        <Card title="4W outcomes: planned vs actual" aside={<span className="legend">{Object.entries(EVIDENCE).map(([k, v]) => <span key={k} title={v.detail}><EvidencePill level={k} /></span>)}</span>}>
          <div className="table-wrap">
            <table className="t" style={{ minWidth: 760 }}>
              <thead><tr><th>Measure</th><th>W</th><th className="r">Target</th><th className="r">Actual</th><th>Evidence</th><th>Result</th></tr></thead>
              <tbody>
                {out.rows.map((r) => (
                  <tr key={r.id}>
                    <td><div style={{ fontWeight: 600 }}>{r.label}</div><div className="small muted">{r.source}{r.reach ? ' · reach, not impact' : ''}</div></td>
                    <td><WChip id={r.fourW} /></td>
                    <td className="r">{editable ? <input aria-label={`Target ${r.label}`} className="inline-input" type="number" value={r.target ?? ''} onChange={(e) => setOutcome(r.id, { target: e.target.value === '' ? null : Number(e.target.value) })} /> : fmtValue(r.target, r.unit)}<div className="small muted">{r.unit}</div></td>
                    <td className="r">{editable ? <input aria-label={`Actual ${r.label}`} className="inline-input" type="number" placeholder={r.actual != null ? String(r.actual) : 'Not measured'} value={event.outcomes?.[r.id]?.actual ?? ''} onChange={(e) => setOutcome(r.id, { actual: e.target.value === '' ? null : Number(e.target.value) })} /> : fmtValue(r.actual, r.unit)}</td>
                    <td>{editable && event.outcomes?.[r.id]?.actual != null ? (
                      <select aria-label={`Evidence ${r.label}`} className="inline-input" value={event.outcomes[r.id].evidence ?? 'reported'} onChange={(e) => setOutcome(r.id, { evidence: e.target.value })}>
                        {Object.entries(EVIDENCE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>) : <EvidencePill level={r.evidence} />}</td>
                    <td>{r.result === 'not-measured' ? <span className="pill neutral">Not measured</span> : r.result === 'met' ? <span className="pill good">Met</span> : <span className="pill warn">Below target</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {out.missing.length > 0 && event.phase === 'complete' && <p className="small" style={{ marginTop: 8, color: 'var(--warn)' }}>{out.missing.length} measures have no result. They stay blank rather than being estimated.</p>}
        </Card>

        <Card title="Partners, beneficiaries and local vendors">
          <div className="table-wrap">
            <table className="t" style={{ minWidth: 820 }}>
              <thead><tr><th>Partner</th><th>Type</th><th>Intended outcome (before)</th><th>Actual outcome (after)</th><th>Evidence</th></tr></thead>
              <tbody>
                {cv.partners.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.name}<div className="small muted">{p.local ? 'Local' : 'Regional'}{p.repeat ? ' · returning partner' : ''}</div></td>
                    <td className="small">{TYPE_LABEL[p.type]}</td>
                    <td>{editable ? <input aria-label={`Intended outcome ${p.name}`} className="inline-input" style={{ maxWidth: 'none', minWidth: 180 }} value={p.intended} placeholder="Agree before the event" onChange={(e) => setPartner(p.id, { intended: e.target.value })} /> : p.intended || '—'}</td>
                    <td>{editable ? <input aria-label={`Actual outcome ${p.name}`} className="inline-input" style={{ maxWidth: 'none', minWidth: 180 }} value={p.actual} placeholder={event.phase === 'complete' ? 'What happened?' : 'After the event'} onChange={(e) => setPartner(p.id, { actual: e.target.value })} /> : p.actual || '—'}</td>
                    <td>{editable ? (
                      <select aria-label={`Evidence ${p.name}`} className="inline-input" value={p.evidence ?? ''} onChange={(e) => setPartner(p.id, { evidence: e.target.value || null })}>
                        <option value="">None yet</option>{Object.entries(EVIDENCE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>) : <EvidencePill level={p.evidence} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {event.cause && (
          <Card title={`Funds to ${event.cause}`}>
            <div className="form-grid">
              <div className="field"><span className="small muted">Raised through the event</span><strong className="num" style={{ fontSize: 22 }}>{formatMoney(raised)}</strong></div>
              <div className="field">
                <label htmlFor="dist-amt">Distributed to beneficiary ($)</label>
                <input id="dist-amt" className="input" type="number" disabled={!editable} value={dist.distributed ?? ''} onChange={(e) => update({ distribution: { ...dist, distributed: e.target.value === '' ? null : Number(e.target.value) } })} />
              </div>
              <div className="field">
                <label htmlFor="dist-ev">Evidence</label>
                <select id="dist-ev" className="select" disabled={!editable} value={dist.evidence ?? ''} onChange={(e) => update({ distribution: { ...dist, evidence: e.target.value || null } })}>
                  <option value="">None yet</option>{Object.entries(EVIDENCE).map(([k, v]) => <option key={k} value={k}>{v.label}: {v.detail}</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="dist-date">Date</label><input id="dist-date" className="input" type="date" disabled={!editable} value={dist.date ?? ''} onChange={(e) => update({ distribution: { ...dist, date: e.target.value } })} /></div>
            </div>
            {dist.note && <p className="small muted" style={{ marginTop: 8 }}>{dist.note}</p>}
          </Card>
        )}

        <Card title="Community Impact Statement and Partner Impact Report" aside={<button className="btn btn-secondary btn-sm" onClick={copy}>{copied ? 'Copied' : 'Copy text'}</button>}>
          <pre id="impact-statement" className="code" style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-body)', fontSize: 14 }}>{statement}</pre>
        </Card>
      </div>
    </Gate>
  );
}
