import { useStore } from '../../store.jsx';
import { nextStatus } from '../../domain/blueprint.js';
import { StatusPill } from '../../components/ui.jsx';

export function ChecklistItem({ event, item }) {
  const { dispatch } = useStore();
  const cycle = () => dispatch({ type: 'setChecklist', id: event.id, item: item.id, status: nextStatus(item.status) });
  return (
    <div className="check-item">
      <button className="status-btn" onClick={cycle} title="Change status" aria-label={`${item.label}: ${item.status}. Change status`}>
        <StatusPill status={item.status} />
      </button>
      <div className="min0">
        <div className="ci-title">{item.label}</div>
        <div className="ci-meta">{item.owner} · usually {item.due} days before{item.informational ? ' · verify locally' : ''}</div>
        <details>
          <summary>How to do this</summary>
          <p style={{ marginTop: 6 }}>{item.help}</p>
        </details>
      </div>
    </div>
  );
}

export function Checklist({ event, items }) {
  return <div>{items.map((i) => <ChecklistItem key={i.id} event={event} item={i} />)}</div>;
}
