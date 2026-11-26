import { useMemo, useState } from 'react';
import { useStore } from '../../store.jsx';
import { draftAAR, emptyAAR, snapshotFromEvent, createNextEdition } from '../../domain/aar.js';
import { EPIC_ORDER, EPIC_DOMAINS } from '../../domain/epic.js';
import { Card, EpicChip, Gate } from '../../components/ui.jsx';

export default function AAR({ event, sim }) {
  const { dispatch, can, org, role, navigate } = useStore();
  const saved = event.aar;
  const [aar, setAar] = useState(saved ?? null);
  const editable = can('event.edit') && saved?.status !== 'complete';
  const reached = event.phase === 'complete' || event.status === 'canceled';
  const set = (patch) => setAar((a) => ({ ...a, ...patch }));
  const setAction = (id, patch) => set({ actions: aar.actions.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const save = (status = 'draft') => {
    const next = { ...aar, status, ...(status === 'complete' ? { completedBy: org?.coordinator || role, completedAt: new Date().toISOString() } : {}) };
    dispatch({ type: 'updateEvent', id: event.id, patch: { aar: next }, toast: status === 'complete' ? 'After Action Review complete. Results saved for trends.' : 'Draft saved' });
    if (status === 'complete') dispatch({ type: 'addSnapshot', snapshot: snapshotFromEvent({ ...event, aar: next }, sim, org) });
    setAar(next);
  };
  const nextEdition = () => {
    const id = 'evt-' + Date.now().toString(36);
    dispatch({ type: 'addEvent', event: createNextEdition(event, sim, id), tab: 'blueprint' });
    dispatch({ type: 'toast', message: 'Next edition created with last year’s plan and corrective actions' });
  };
  const plan = useMemo(() => (aar?.actions ?? []).filter((a) => a.status !== 'dropped'), [aar]);

  if (!reached) {
    return <div className="empty">The After Action Review opens once the event is complete (or canceled). It turns results, incidents and feedback into corrective actions for the next edition.</div>;
  }

  return (
    <Gate feature="aar" tier={org?.tier}>
      <div className="stack-lg">
        <div className="spread">
          <div>
            <div className="eyebrow">Improve</div>
            <h2 className="display" style={{ fontSize: 32 }}>After Action Review</h2>
          </div>
          {saved?.status === 'complete'
            ? <span className="pill good">Complete · {saved.completedBy}</span>
            : !aar && can('event.edit') && (
              <span className="row" style={{ gap: 6 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setAar(emptyAAR())}>Start blank</button>
                <button className="btn btn-primary btn-sm" onClick={() => setAar(draftAAR(event, sim, org))}>Draft from event records</button>
              </span>
            )}
        </div>

        {!aar && <p className="muted">Start from a draft built from this event's own records (results, budget, incidents, survey feedback), or from a blank page. You edit and approve every line.</p>}

        {aar && (
          <>
            {aar.draftedFrom && aar.status !== 'complete' && <div className="info small">Drafted from {aar.draftedFrom}. Each line traces to data in this event; check it before completing the review.</div>}
            <div className="grid-2">
              <Field label="What went well" id="aar-well" value={aar.wentWell} onChange={(v) => set({ wentWell: v })} disabled={!editable} />
              <Field label="What to improve" id="aar-improve" value={aar.improve} onChange={(v) => set({ improve: v })} disabled={!editable} />
              <Field label="Incidents and safety observations" id="aar-safety" value={aar.safety} onChange={(v) => set({ safety: v })} disabled={!editable} />
              <Field label="Lessons learned" id="aar-lessons" value={aar.lessons} onChange={(v) => set({ lessons: v })} disabled={!editable} placeholder="Workforce and volunteer feedback, sponsor notes, community feedback" />
            </div>

            <Card title="Corrective actions" aside={editable && <button className="btn btn-secondary btn-sm" onClick={() => set({ actions: [...aar.actions, { id: 'ca' + Date.now().toString(36), action: '', epic: 'I', owner: '', due: '', status: 'open' }] })}>Add action</button>}>
              {aar.actions.length === 0 ? <p className="small muted">No actions yet.</p> : (
                <div className="table-wrap">
                  <table className="t" style={{ minWidth: 700 }}>
                    <thead><tr><th>Action</th><th>EPIC area</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead>
                    <tbody>
                      {aar.actions.map((a) => (
                        <tr key={a.id}>
                          <td>{editable ? <input aria-label="Action" className="inline-input" style={{ maxWidth: 'none', minWidth: 220 }} value={a.action} onChange={(e) => setAction(a.id, { action: e.target.value })} /> : a.action}{a.why && <div className="small muted">{a.why}</div>}</td>
                          <td>{editable ? <select aria-label="EPIC area" className="inline-input" value={a.epic} onChange={(e) => setAction(a.id, { epic: e.target.value })}>{EPIC_ORDER.map((d) => <option key={d} value={d}>{d} · {EPIC_DOMAINS[d].short}</option>)}</select> : <EpicChip id={a.epic} />}</td>
                          <td>{editable ? <input aria-label="Owner" className="inline-input" value={a.owner} onChange={(e) => setAction(a.id, { owner: e.target.value })} /> : a.owner}</td>
                          <td>{editable ? <input aria-label="Due" className="inline-input" type="date" value={a.due} onChange={(e) => setAction(a.id, { due: e.target.value })} /> : a.due || '—'}</td>
                          <td>{editable ? <select aria-label="Status" className="inline-input" value={a.status} onChange={(e) => setAction(a.id, { status: e.target.value })}><option value="open">Open</option><option value="done">Done</option><option value="dropped">Dropped</option></select> : a.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {editable && (
              <div className="row">
                <button className="btn btn-secondary" onClick={() => save('draft')}>Save draft</button>
                <button className="btn btn-primary" onClick={() => save('complete')} disabled={!aar.wentWell.trim() && !aar.improve.trim()}>Complete review</button>
              </div>
            )}

            <Card title="Next-Event Improvement Plan">
              <div className="stack" style={{ gap: 10 }}>
                {plan.length ? (
                  <ol className="bullets">{plan.map((a) => <li key={a.id}><EpicChip id={a.epic} /> {a.action}{a.owner ? ` (${a.owner})` : ''}</li>)}</ol>
                ) : <p className="small muted">Add corrective actions to build the plan.</p>}
                <p className="small">Creating the next edition copies this event's setup, rebases the budget on actual costs, re-opens the risk register for review, and adds each open action as a checklist control. This event and its reports stay unchanged.</p>
                {can('event.edit') && <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={nextEdition} disabled={saved?.status !== 'complete'}>{saved?.status === 'complete' ? 'Create next edition' : 'Complete the review to create the next edition'}</button>}
              </div>
            </Card>
          </>
        )}
        {!aar && saved == null && event.priorEventId && <button className="btn btn-ghost" onClick={() => navigate({ name: 'event', eventId: event.priorEventId, tab: 'aar' })}>See last edition's review</button>}
      </div>
    </Gate>
  );
}

function Field({ label, id, value, onChange, disabled, placeholder }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} className="textarea" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={placeholder} rows={5} />
    </div>
  );
}
