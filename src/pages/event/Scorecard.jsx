import { useMemo } from 'react';
import { useStore } from '../../store.jsx';
import { epicScore, epicHeatmap, CLEARANCE, EPIC_DOMAINS } from '../../domain/epic.js';
import { outcomesView } from '../../domain/civic.js';
import { financeView } from '../../domain/finance.js';
import { snapshotFromEvent } from '../../domain/aar.js';
import { FOUR_WS } from '../../domain/fourW.js';
import { formatMoney } from '../../domain/metrics.js';
import { Card, Ring, EpicChip, WChip, EvidencePill, Gate } from '../../components/ui.jsx';
import { fmtValue } from './Civic.jsx';

export default function Scorecard({ event, sim, setTab }) {
  const { org, snapshots } = useStore();
  const score = useMemo(() => epicScore(event, sim, org), [event, sim, org]);
  const heat = useMemo(() => epicHeatmap(event, sim), [event, sim]);
  const out = useMemo(() => outcomesView(event, sim), [event, sim]);
  const fin = useMemo(() => financeView(event, sim), [event, sim]);
  const clear = CLEARANCE[score.clearance];
  const series = useMemo(() => {
    const prior = snapshots.filter((s) => s.seriesId === (event.seriesId ?? event.id) && s.eventId !== event.id).sort((a, b) => a.date.localeCompare(b.date));
    const current = event.phase === 'complete' ? [{ ...snapshotFromEvent(event, sim, org), current: true }] : [];
    return [...prior, ...current];
  }, [snapshots, event, sim, org]);
  const actions = [
    ...(event.aar?.actions ?? []).map((a) => ({ ...a, source: 'This event’s review' })),
    ...(event.carryOver ?? []).map((a) => ({ ...a, source: `Carried from ${a.fromEvent}`, status: event.checklist?.['carry-' + a.id] === 'done' ? 'done' : 'open' })),
  ];

  return (
    <Gate feature="epicScorecard" tier={org?.tier}>
      <div className="stack-lg">
        <div className="spread">
          <div>
            <div className="eyebrow">EPIC Intelligence</div>
            <h2 className="display" style={{ fontSize: 32 }}>Scorecard</h2>
          </div>
          <span className="small muted">Operational health and community outcomes are scored separately on purpose.</span>
        </div>

        <div className={`banner ${clear.tone}`}>
          <span className="min0"><strong>{clear.label}.</strong>{' '}
            {score.clearance === 'blocked' && `${score.critical.length} critical items are open. They are listed below, separate from the score.`}
            {score.clearance === 'insufficient-data' && `Only ${Math.round(score.coverage * 100)}% of controls have been assessed. Treat the score as incomplete.`}
            {score.clearance === 'clear' && 'Every critical control for this phase is complete.'}
            {score.clearance === 'canceled' && 'Scores are frozen at cancellation.'}
          </span>
        </div>

        <div className="grid-2">
          <Card title="1 · EPIC Operational Health">
            <div className="row" style={{ gap: 18, alignItems: 'flex-start' }}>
              <Ring value={score.composite ?? 0} label={score.composite ?? '–'} caption={score.band} size={120} />
              <div className="min0 small stack" style={{ gap: 4, flex: 1, minWidth: 160 }}>
                <span>Weighted: {score.domains.map((d) => `${d.id} ${d.weight}%`).join(' · ')}{org?.epicWeights && JSON.stringify(org.epicWeights) !== JSON.stringify({ E: 40, P: 20, I: 20, C: 20 }) ? ' (custom)' : ''}</span>
                <span>{Math.round(score.coverage * 100)}% of controls assessed. Unassessed controls score zero.</span>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              {score.domains.map((d) => (
                <div key={d.id} className="domain-bar">
                  <span className="min0"><EpicChip id={d.id} long /><span className="small muted" style={{ display: 'block' }}>{d.weight}% weight · {d.unassessed.length} not assessed</span></span>
                  <span className="db-track" title={`${Math.round(d.coverage * 100)}% assessed`}>
                    <span className="db-fill" style={{ width: `${d.score ?? 0}%` }} />
                    <span className="db-cover" style={{ width: `${d.coverage * 100}%` }} />
                  </span>
                  <span className="db-v">{d.score ?? '–'}</span>
                </div>
              ))}
            </div>
            <p className="small muted" style={{ marginTop: 6 }}>Bar = score. Dashed line = share of the area that has been assessed.</p>
          </Card>

          <Card title="Critical risks (shown on their own)">
            {score.critical.length === 0 ? <p className="small">None open.</p> : (
              <ul className="list-plain">
                {score.critical.map((c) => (
                  <li key={c.id} className="spread" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                    <span className="min0 row" style={{ gap: 8, flexWrap: 'nowrap', alignItems: 'flex-start' }}><EpicChip id={c.epic} /><span><strong className="small">{c.title}</strong><span className="small muted" style={{ display: 'block' }}>{c.detail}</span></span></span>
                    <button className="btn btn-ghost btn-sm" onClick={() => setTab(c.kind === 'finance' ? 'finance' : c.kind === 'control' ? 'blueprint' : 'safety')}>Open</button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card title="Operational risk heatmap" aside={<span className="legend"><span><i className="h-good" />All done</span><span><i className="h-warn" />Some open</span><span><i className="h-bad" />Critical open</span><span><i className="h-none" />Not due yet</span></span>}>
          <div className="table-wrap">
            <div className="heat" style={{ minWidth: 520 }}>
              <div className="hrow"><span />{heat[0].cells.map((c) => <span key={c.stage} className="hhead">{c.label}</span>)}</div>
              {heat.map((row) => (
                <div key={row.domain.id} className="hrow">
                  <span className="hlabel"><EpicChip id={row.domain.id} long /></span>
                  {row.cells.map((c) => (
                    <span key={c.stage} className={`hcell ${c.total === 0 || c.future ? 'h-none' : c.critical ? 'h-bad' : c.done === c.total ? 'h-good' : 'h-warn'}`} title={c.future ? 'Not due yet' : `${c.done} of ${c.total} done`}>
                      {!c.total ? '–' : c.future ? `${c.total} later` : `${c.done}/${c.total}`}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card title="2 · 4Ws Community Outcomes" aside={<button className="btn btn-ghost btn-sm" onClick={() => setTab('civic')}>Enter results</button>}>
          <div className="grid">
            {(event.fourWs ?? []).map((w, i) => (
              <section key={w} className="stack" style={{ gap: 8 }}>
                <span className="row" style={{ gap: 6 }}><WChip id={w} /><span className="small muted">{i === 0 ? 'Primary' : 'Supporting'}</span></span>
                <span className="small muted">{FOUR_WS[w].prompt}</span>
                {out.byW[w].map((r) => (
                  <div key={r.id} className="stack" style={{ gap: 2, paddingBottom: 6, borderBottom: '1px solid var(--line)' }}>
                    <span className="small" style={{ fontWeight: 600 }}>{r.label}</span>
                    <span className="row" style={{ gap: 8 }}>
                      <span className="display num" style={{ fontSize: 24 }}>{fmtValue(r.actual, r.unit)}</span>
                      <span className="small muted">target {fmtValue(r.target, r.unit)}</span>
                    </span>
                    <span className="row" style={{ gap: 6 }}><EvidencePill level={r.evidence} />{r.reach && <span className="small muted">reach, not impact</span>}</span>
                  </div>
                ))}
              </section>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>Units differ by measure and are never combined into one number.</p>
        </Card>

        <Card title="Planned vs actual">
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Measure</th><th className="r">Planned</th><th className="r">Actual</th></tr></thead>
              <tbody>
                <tr><td>Revenue</td><td className="r">{formatMoney(fin.planned.revenue)}</td><td className="r">{fin.actual ? formatMoney(fin.actual.revenue) : '—'}</td></tr>
                <tr><td>Spending</td><td className="r">{formatMoney(fin.planned.expense + fin.planned.contingency)}</td><td className="r">{fin.actual ? formatMoney(fin.actual.expense) : '—'}</td></tr>
                <tr><td>Net</td><td className="r">{formatMoney(fin.planned.net)}</td><td className="r">{fin.actual ? formatMoney(fin.actual.net) : '—'}</td></tr>
                <tr><td>Participants</td><td className="r">{event.expected}</td><td className="r">{sim.registered || '—'}</td></tr>
                {out.rows.map((r) => <tr key={r.id}><td>{r.label}</td><td className="r">{fmtValue(r.target, r.unit)}</td><td className="r">{fmtValue(r.actual, r.unit)}</td></tr>)}
              </tbody>
            </table>
          </div>
        </Card>

        <Gate feature="seriesTrends" tier={org?.tier}>
          <Card title="Trends across editions" aside={<span className="demo-tag">Prior editions are synthetic</span>}>
            {series.length < 1 ? <p className="small muted">Trends appear once this event has a prior edition or its After Action Review is complete.</p> : (
              <div className="grid-2">
                <Trend title="Net revenue" rows={series} get={(s) => s.netRevenue} fmt={(v) => formatMoney(v, { compact: true })} />
                <Trend title="Local vendor spending" rows={series} get={(s) => s.localSpend} fmt={(v) => formatMoney(v, { compact: true })} />
                <Trend title="Participants" rows={series} get={(s) => s.participants} fmt={(v) => v} />
                <Trend title="Volunteer hours" rows={series} get={(s) => s.volunteerHours} fmt={(v) => v} />
                <Trend title="EPIC operational score" rows={series} get={(s) => s.epic} fmt={(v) => v ?? '–'} max={100} />
                <Trend title="Community Value Index" rows={series} get={(s) => s.cvi} fmt={(v) => v ?? '–'} max={100} />
              </div>
            )}
          </Card>
        </Gate>

        <Card title="Corrective action tracker">
          {actions.length === 0 ? <p className="small muted">Corrective actions come from the After Action Review and carry into the next edition as controls.</p> : (
            <div className="table-wrap">
              <table className="t" style={{ minWidth: 620 }}>
                <thead><tr><th>Action</th><th>Area</th><th>Owner</th><th>Source</th><th>Status</th></tr></thead>
                <tbody>
                  {actions.map((a, i) => <tr key={a.id + i}><td>{a.action}{a.why && <div className="small muted">{a.why}</div>}</td><td><EpicChip id={a.epic} /></td><td className="small">{a.owner}</td><td className="small muted">{a.source}</td><td><span className={`pill ${a.status === 'done' ? 'good' : 'warn'}`}>{a.status === 'done' ? 'Done' : 'Open'}</span></td></tr>)}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {(event.reviews ?? []).length > 0 && (
          <Card title="Score history">
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Review</th><th>Recorded</th><th className="r">EPIC</th>{Object.keys(EPIC_DOMAINS).map((d) => <th key={d} className="r">{d}</th>)}<th className="r">Critical open</th></tr></thead>
                <tbody>{event.reviews.map((r) => <tr key={r.stage}><td>{r.stage}</td><td className="small">{new Date(r.at).toLocaleDateString()} · {r.by}</td><td className="r">{r.composite}</td>{Object.keys(EPIC_DOMAINS).map((d) => <td key={d} className="r">{r.domains[d] ?? '–'}</td>)}<td className="r">{r.criticalOpen}</td></tr>)}</tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </Gate>
  );
}

function Trend({ title, rows, get, fmt, max }) {
  const top = max ?? Math.max(1, ...rows.map((r) => Math.abs(get(r) ?? 0)));
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="small" style={{ fontWeight: 700 }}>{title}</span>
      <div className="bars">
        {rows.map((r) => (
          <div key={r.id} className="bar-row">
            <span className="bl">{r.date?.slice(0, 4)}{r.current ? ' (this)' : ''}</span>
            <span className="bar-track"><span className="bar-fill" style={{ width: `${(Math.max(0, get(r) ?? 0) / top) * 100}%`, background: 'var(--accent)', opacity: r.current ? 1 : 0.45 }} /></span>
            <span className="bv">{fmt(get(r))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
