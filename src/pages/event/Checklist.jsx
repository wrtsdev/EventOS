import { useStore, permForControl } from '../../store.jsx';
import { nextStatus, STAGES } from '../../domain/controls.js';
import { StatusPill, EpicChip } from '../../components/ui.jsx';

export function ChecklistItem({ event, item, showEpic = true }) {
  const { dispatch, can } = useStore();
  const editable = !item.auto && can(permForControl(item.epic)) && event.status !== 'canceled';
  const cycle = () => dispatch({ type: 'setChecklist', id: event.id, item: item.id, epic: item.epic, status: nextStatus(item.status) });
  const stage = STAGES.find((s) => s.id === item.stage)?.short;
  return (
    <div className="check-item">
      {editable ? (
        <button className="status-btn" onClick={cycle} title="Change status" aria-label={`${item.label}: ${item.status}. Change status`}>
          <StatusPill status={item.status} />
        </button>
      ) : (
        <span title={item.auto ? 'Calculated from records' : 'Your role cannot change this'}><StatusPill status={item.status} /></span>
      )}
      <div className="min0">
        <div className="ci-title">
          {item.label}
          {item.weight === 'critical' && <span className="pill bad plain" style={{ marginLeft: 8, fontSize: 11 }}>Critical</span>}
          {item.carryOver && <span className="pill neutral plain" style={{ marginLeft: 8, fontSize: 11 }}>From last edition</span>}
        </div>
        <div className="ci-meta row" style={{ gap: 8 }}>
          {showEpic && <EpicChip id={item.epic} />}
          <span>{item.owner} · {stage}{item.due > 0 ? ` · ${item.due} days before` : ''}{item.informational ? ' · verify locally' : ''}</span>
        </div>
        {item.auto && <div className="ci-meta">Calculated from {item.autoSource}</div>}
        <details>
          <summary>How to do this</summary>
          <p style={{ marginTop: 6 }}>{item.help}</p>
        </details>
      </div>
    </div>
  );
}

export function Checklist({ event, items, showEpic = true }) {
  if (!items.length) return <p className="small muted">Nothing here for this stage.</p>;
  return <div>{items.map((i) => <ChecklistItem key={i.id} event={event} item={i} showEpic={showEpic} />)}</div>;
}
