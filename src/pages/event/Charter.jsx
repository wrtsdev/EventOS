import { useMemo, useState } from 'react';
import { useStore } from '../../store.jsx';
import { buildBlueprint, purposeStatement } from '../../domain/blueprint.js';
import { applicableChecklist } from '../../domain/controls.js';
import { EPIC_ORDER, EPIC_DOMAINS, matrixFor } from '../../domain/epic.js';
import { FOUR_WS } from '../../domain/fourW.js';
import { financeView } from '../../domain/finance.js';
import { partnersFor, outcomesView } from '../../domain/civic.js';
import { formatMoney } from '../../domain/metrics.js';
import { Card, WChip, EpicChip, formatDate } from '../../components/ui.jsx';

export default function Charter({ event, sim, setTab }) {
  const { dispatch, can } = useStore();
  const bp = useMemo(() => buildBlueprint(event), [event]);
  const fin = useMemo(() => financeView(event, sim), [event, sim]);
  const outcomes = useMemo(() => outcomesView(event, sim), [event, sim]);
  const matrix = useMemo(() => matrixFor(event, sim), [event, sim]);
  const plan = useMemo(() => {
    const items = applicableChecklist(event, sim, { includeAll: true });
    return EPIC_ORDER.map((d) => ({ d, items: items.filter((i) => i.epic === d) }));
  }, [event, sim]);
  const partners = partnersFor(event);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(purposeStatement(event));

  const saveStatement = () => {
    dispatch({ type: 'updateEvent', id: event.id, patch: { purposeStatement: text }, toast: 'Purpose statement saved' });
    setEditing(false);
  };

  return (
    <div className="stack-lg">
      <section className="report-hero">
        <div className="spread">
          <span className="eyebrow">Community Purpose Statement</span>
          {can('event.edit') && !editing && <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Edit</button>}
        </div>
        {editing ? (
          <div className="stack" style={{ gap: 8 }}>
            <label htmlFor="purpose-text" className="small muted">Drafted from your answers. Make it sound like you.</label>
            <textarea id="purpose-text" className="textarea" value={text} onChange={(e) => setText(e.target.value)} />
            <div className="row"><button className="btn btn-primary btn-sm" onClick={saveStatement}>Save</button><button className="btn btn-ghost btn-sm" onClick={() => { setText(purposeStatement(event)); setEditing(false); }}>Cancel</button></div>
          </div>
        ) : (
          <p style={{ fontSize: 18, maxWidth: '62ch' }}>{purposeStatement(event)}</p>
        )}
        {!event.purposeStatement && !editing && <span className="small muted">Drafted from your Event Builder answers.</span>}
      </section>

      <div className="grid-2">
        <Card title="Event Charter">
          <dl className="kv">
            <dt>Event</dt><dd>{event.name}</dd>
            <dt>Organizer</dt><dd>{event.organization || '—'}</dd>
            <dt>Date</dt><dd>{formatDate(event.date)}</dd>
            <dt>Format</dt><dd>{bp.experience.format} · {bp.experience.eventType}</dd>
            <dt>Location</dt><dd>{event.location || 'To be set'}</dd>
            <dt>Audience</dt><dd>{bp.experience.audience}</dd>
            <dt>Participation goal</dt><dd>{bp.experience.expected}</dd>
            <dt>Beneficiary</dt><dd>{event.cause || 'None yet'}</dd>
            <dt>Revenue goal</dt><dd>{event.revenueGoal ? formatMoney(event.revenueGoal) : `${formatMoney(fin.planned.revenue)} (from budget)`}</dd>
            <dt>Spending plan</dt><dd>{formatMoney(fin.planned.expense + fin.planned.contingency)}{event.budgetGoal ? ` of ${formatMoney(event.budgetGoal)} limit` : ''}</dd>
          </dl>
          {event.budgetGoal && fin.planned.expense + fin.planned.contingency > event.budgetGoal && <p className="small" style={{ color: 'var(--bad)', marginTop: 8 }}>The drafted budget is over your spending limit. Review it in Finance.</p>}
        </Card>
        <Card title="Community outcomes">
          <div className="stack" style={{ gap: 10 }}>
            {(event.fourWs ?? []).map((w, i) => (
              <div key={w} className="stack" style={{ gap: 4 }}>
                <span className="row" style={{ gap: 6 }}><WChip id={w} /><span className="small muted">{i === 0 ? 'Primary' : 'Supporting'}</span></span>
                <span className="small">{FOUR_WS[w].prompt}</span>
                <ul className="bullets small">{outcomes.byW[w]?.map((o) => <li key={o.id}>{o.label}: target {o.target ?? '—'} {o.unit}</li>)}</ul>
              </div>
            ))}
            {!event.fourWs?.length && <p className="small muted">No 4W selected. Choose a primary W in the Event Builder.</p>}
          </div>
        </Card>
      </div>

      <Card title="EPIC × 4Ws for this event" aside={<span className="legend"><span><i style={{ background: 'var(--accent-soft)', border: '1.5px solid var(--accent)' }} />Primary link</span><span><i style={{ background: 'var(--surface-2)' }} />Supporting</span><span><i style={{ border: '1px dashed var(--line)' }} />Contextual</span></span>}>
        <div className="table-wrap">
          <div className="matrix" style={{ minWidth: 560 }}>
            <div className="mrow">
              <span />
              {EPIC_ORDER.map((d) => <span key={d} className="small" style={{ fontWeight: 700 }}><EpicChip id={d} long /></span>)}
            </div>
            {matrix.map((row) => (
              <div key={row.fourW} className="mrow">
                <span style={{ alignSelf: 'center' }}><WChip id={row.fourW} /></span>
                {row.cells.map((c) => (
                  <div key={c.domain} className={`mcell ${c.relevance}`}>
                    <b>{c.relevance}</b>{c.measures}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>The 4Ws say what this event is for. EPIC says how it must run. All four EPIC areas apply to every event.</p>
      </Card>

      <Card title="Initial EPIC readiness plan" aside={<button className="btn btn-ghost btn-sm" onClick={() => setTab('blueprint')}>Open readiness</button>}>
        <div className="grid">
          {plan.map(({ d, items }) => (
            <div key={d} className="stack" style={{ gap: 6 }}>
              <EpicChip id={d} long />
              <span className="small muted">{EPIC_DOMAINS[d].summary}</span>
              <span className="small"><strong>{items.length}</strong> controls · <strong>{items.filter((i) => i.weight === 'critical').length}</strong> critical · {items.filter((i) => i.status === 'done').length} done</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Partners">
          {partners.length ? (
            <ul className="list-plain small">{partners.map((p) => <li key={p.id} className="spread"><span>{p.name}</span><span className="muted">{p.type}{p.local ? ' · local' : ''}</span></li>)}</ul>
          ) : <p className="small muted">No partners yet.</p>}
        </Card>
        <Card title="What should happen when">
          <ul className="timeline">
            {bp.engagement.comms.slice(0, 6).map((c) => (
              <li key={c.when}>
                <div className="eyebrow">{c.when}</div>
                <div style={{ fontWeight: 700 }}>{c.title}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
