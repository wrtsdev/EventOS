import { useMemo } from 'react';
import { useStore } from '../../store.jsx';
import { financeView, budgetFor } from '../../domain/finance.js';
import { formatMoney } from '../../domain/metrics.js';
import { Card, Stat, Gate, NoAccess, EpicChip, DemoTag } from '../../components/ui.jsx';

const SEV = { critical: 'bad', warn: 'warn', info: 'neutral' };

export default function Finance({ event, sim }) {
  const { dispatch, can, org, role } = useStore();
  const fin = useMemo(() => financeView(event, sim), [event, sim]);
  if (!can('finance.view')) return <NoAccess what="budgets and financial details" />;
  const editable = can('finance.edit') && event.status !== 'canceled';
  const tier = org?.tier ?? 'community';

  const setLine = (id, patch) => {
    const b = budgetFor(event);
    dispatch({ type: 'updateEvent', id: event.id, perm: 'finance.edit', patch: { budget: { ...b, lines: b.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) } } });
  };
  const setContingency = (v) => {
    const b = budgetFor(event);
    dispatch({ type: 'updateEvent', id: event.id, perm: 'finance.edit', patch: { budget: { ...b, contingencyPct: v } } });
  };
  const approve = () => {
    dispatch({ type: 'setChecklist', id: event.id, item: 'budget', epic: 'E', status: 'done' });
    dispatch({ type: 'updateEvent', id: event.id, perm: 'finance.edit', patch: { budgetApproval: { by: org?.coordinator || role, at: new Date().toISOString(), net: fin.planned.net } }, toast: 'Budget approved' });
  };
  const num = (v) => (v === '' ? null : Number(v));
  const plannedTotal = fin.planned.expense + fin.planned.contingency;
  const refunds = event.status === 'canceled' ? (sim?.revenue?.registration ?? 0) : 0;

  return (
    <div className="stack-lg">
      <div className="spread">
        <div>
          <div className="eyebrow">Economic Vitality</div>
          <h2 className="display" style={{ fontSize: 32 }}>Financial health</h2>
        </div>
        <span className="row" style={{ gap: 8 }}>
          <DemoTag>Synthetic amounts</DemoTag>
          {fin.approved ? <span className="pill good">Approved{event.budgetApproval ? ` by ${event.budgetApproval.by}` : ''}</span> : editable && <button className="btn btn-primary btn-sm" onClick={approve} disabled={fin.essentialAtRisk} title={fin.essentialAtRisk ? 'Restore essential safety spending first' : ''}>Approve budget</button>}
        </span>
      </div>

      {event.status === 'canceled' && (
        <div className="banner neutral"><span><strong>Canceled.</strong> Registration revenue of {formatMoney(refunds)} may be owed back under your refund policy. Record refunds as actuals and confirm vendor cancellation terms.</span></div>
      )}

      {fin.flags.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          {fin.flags.map((f) => (
            <div key={f.id} className={`banner ${SEV[f.severity]}`}>
              <EpicChip id={f.epic} />
              <span className="min0"><strong>{f.title}.</strong> {f.detail}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid-stats">
        <Stat label="Planned revenue" value={formatMoney(fin.planned.revenue, { compact: true })} sub={event.revenueGoal ? `Goal ${formatMoney(event.revenueGoal, { compact: true })}` : 'Registration, sponsors, merch, fees'} />
        <Stat label="Planned spending" value={formatMoney(plannedTotal, { compact: true })} sub={`Includes ${fin.contingencyPct}% contingency`} />
        <Stat label={fin.actual ? 'Actual net so far' : 'Planned net'} value={formatMoney(fin.actual ? fin.actual.net : fin.planned.net, { compact: true })} sub={fin.actual ? `Planned ${formatMoney(fin.planned.net, { compact: true })}` : 'At your participation goal'} />
        <Stat label="Break-even" value={fin.breakEven == null ? 'Not reachable' : fin.breakEven === 0 ? 'Covered' : fin.breakEven} sub={fin.breakEven === 0 ? 'Sponsors and fees cover fixed costs' : fin.breakEven == null ? 'Each participant costs more than they bring' : `participants, of ${event.expected} goal`} />
      </div>

      <Card title="Budget: planned vs actual" aside={editable ? <span className="small muted">Edit any amount</span> : <span className="small muted">View only</span>}>
        <div className="table-wrap">
          <table className="t" style={{ minWidth: 760 }}>
            <thead><tr><th>Line</th><th className="r">Planned</th><th className="r">Actual</th><th>Local</th><th>Payment</th><th>Notes</th></tr></thead>
            <tbody>
              {['revenue', 'expense'].map((kind) => [
                <tr key={kind + 'h'}><td colSpan={6} className="eyebrow" style={{ paddingTop: 14 }}>{kind === 'revenue' ? 'Revenue' : 'Expenses'}</td></tr>,
                ...fin.lines.filter((l) => l.kind === kind).map((l) => {
                  const over = l.kind === 'expense' && l.actualValue != null && l.actualValue > (l.perHead ? l.planned * fin.flex : l.planned) * 1.1;
                  const belowMin = l.essential && l.minimum != null && l.planned < l.minimum;
                  return (
                    <tr key={l.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{l.label}</div>
                        <div className="small muted">{l.category}{l.vendor ? ` · ${l.vendor}` : ''}{l.essential ? ' · essential' : ''}</div>
                      </td>
                      <td className="r">
                        {editable ? <input aria-label={`Planned ${l.label}`} className="inline-input" type="number" value={l.planned} onChange={(e) => setLine(l.id, { planned: num(e.target.value) ?? 0 })} style={belowMin ? { borderColor: 'var(--bad)' } : undefined} /> : formatMoney(l.planned)}
                        {belowMin && <div className="small" style={{ color: 'var(--bad)' }}>min {formatMoney(l.minimum)}</div>}
                      </td>
                      <td className="r">
                        {editable ? <input aria-label={`Actual ${l.label}`} className="inline-input" type="number" placeholder={l.actualValue != null ? String(l.actualValue) : '—'} value={l.actual ?? ''} onChange={(e) => setLine(l.id, { actual: num(e.target.value) })} style={over ? { borderColor: 'var(--warn)' } : undefined} /> : (l.actualValue != null ? formatMoney(l.actualValue) : '—')}
                        {l.actual == null && l.actualSource && <div className="small muted">{l.actualSource}</div>}
                      </td>
                      <td>{l.kind === 'expense' ? (editable ? <input type="checkbox" aria-label={`${l.label} is a local vendor`} checked={l.local} onChange={(e) => setLine(l.id, { local: e.target.checked })} /> : l.local ? 'Yes' : 'No') : ''}</td>
                      <td>{l.kind === 'expense' ? (editable ? (
                        <select aria-label={`Payment status ${l.label}`} className="inline-input" value={l.payment} onChange={(e) => setLine(l.id, { payment: e.target.value, paymentSet: true })}>
                          <option value="unpaid">Unpaid</option><option value="deposit">Deposit</option><option value="paid">Paid</option>
                        </select>) : l.payment) : ''}</td>
                      <td className="small muted">{l.note ?? ''}</td>
                    </tr>
                  );
                }),
              ])}
              <tr>
                <td style={{ fontWeight: 600 }}>Contingency</td>
                <td className="r">{editable ? <><input aria-label="Contingency percent" className="inline-input" type="number" min="0" max="30" value={fin.contingencyPct} onChange={(e) => setContingency(num(e.target.value) ?? 0)} style={{ maxWidth: 70 }} /> %</> : `${fin.contingencyPct}%`}</td>
                <td className="r">{formatMoney(fin.planned.contingency)}</td>
                <td colSpan={3} />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Local economic contribution">
          <div className="stack" style={{ gap: 8 }}>
            <div className="display num" style={{ fontSize: 44 }}>{formatMoney(fin.local.spend)}</div>
            <p className="small">{Math.round(fin.local.share * 100)}% of spending goes to {fin.local.vendors.length} local vendors ({fin.local.basis}). Tracked separately from total expenses; no multiplier is applied.</p>
            <ul className="bullets small">{fin.local.vendors.map((v) => <li key={v}>{v}</li>)}</ul>
          </div>
        </Card>
        <Card title="Registration payments">
          {fin.payments ? (
            <dl className="kv">
              <dt>Payment attempts</dt><dd>{fin.payments.attempted}</dd>
              <dt>Failed</dt><dd>{fin.payments.failed}</dd>
              <dt>Recovered on retry</dt><dd>{fin.payments.recovered}</dd>
              <dt>Still pending</dt><dd style={{ color: fin.payments.pending ? 'var(--warn)' : undefined }}>{fin.payments.pending}</dd>
            </dl>
          ) : <p className="small muted">Payments start when registration opens. Pending payments are never counted as revenue or as registrations.</p>}
        </Card>
      </div>

      <Gate feature="financeAdvanced" tier={tier}>
        <div className="grid-2">
          <Card title="Scenarios">
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Scenario</th><th className="r">People</th><th className="r">Revenue</th><th className="r">Spending</th><th className="r">Net</th></tr></thead>
                <tbody>
                  {fin.scenarios.map((s) => (
                    <tr key={s.id}><td>{s.label}</td><td className="r">{s.people}</td><td className="r">{formatMoney(s.revenue)}</td><td className="r">{formatMoney(s.expense)}</td><td className="r" style={{ color: s.net >= 0 ? 'var(--good)' : 'var(--bad)', fontWeight: 700 }}>{formatMoney(s.net)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Cash on hand by checkpoint">
            <CashFlow rows={fin.cashflow} />
            <p className="small muted" style={{ marginTop: 8 }}>Lowest point {formatMoney(fin.lowPoint)}. Assumes deposits on their due dates and registration arriving on a typical curve.</p>
          </Card>
        </div>
      </Gate>
    </div>
  );
}

function CashFlow({ rows }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.cash)));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div key={r.week} className="bar-row">
          <span className="bl">{r.label}</span>
          <span className="bar-track" style={{ position: 'relative' }}>
            <span className="bar-fill" style={{ width: `${(Math.abs(r.cash) / max) * 100}%`, background: r.cash < 0 ? 'var(--bad)' : 'var(--good)' }} />
          </span>
          <span className="bv">{formatMoney(r.cash, { compact: true })}</span>
        </div>
      ))}
    </div>
  );
}
