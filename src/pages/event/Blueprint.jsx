import { useMemo, useState } from 'react';
import { useStore } from '../../store.jsx';
import { readiness, stageReviews } from '../../domain/controls.js';
import { epicScore, EPIC_DOMAINS, EPIC_ORDER, reviewSnapshot } from '../../domain/epic.js';
import { Ring, Card, SafetyNote, EpicChip, readinessTone } from '../../components/ui.jsx';
import { Checklist } from './Checklist.jsx';

export default function Blueprint({ event, sim }) {
  const { org, dispatch, can, role } = useStore();
  const r = useMemo(() => readiness(event, sim), [event, sim]);
  const score = useMemo(() => epicScore(event, sim, org), [event, sim, org]);
  const reviews = useMemo(() => stageReviews(event, sim), [event, sim]);
  const defaultStage = event.phase === 'complete' ? 'closure' : event.phase === 'eventday' ? 'eventday' : 't30';
  const [stage, setStage] = useState(defaultStage);
  const [groupBy, setGroupBy] = useState('epic');
  const review = reviews.find((x) => x.id === stage);

  const record = () => {
    const snap = reviewSnapshot(event, sim, org, stage, org?.coordinator || role);
    dispatch({ type: 'updateEvent', id: event.id, patch: (e) => ({ reviews: [...(e.reviews ?? []).filter((x) => x.stage !== stage), snap] }), toast: `${review.label} recorded` });
  };

  return (
    <div className="stack-lg">
      <section className="card">
        <div className="row" style={{ alignItems: 'flex-start', gap: 20 }}>
          <Ring value={r.score} label={r.score + '%'} caption="Ready" size={124} stroke={12} tone={readinessTone(r.score)} />
          <div className="min0 stack" style={{ flex: 1, gap: 10, minWidth: 220 }}>
            <div>
              <div className="eyebrow">EPIC readiness plan</div>
              <h3 className="display" style={{ fontSize: 30, marginTop: 4 }}>Readiness: {r.score}%</h3>
            </div>
            <p className="small">{r.done} of {r.items.length} controls complete for this phase. {r.unassessed.length ? `${r.unassessed.length} not assessed yet; they count as zero, never as done.` : 'Every control has been assessed.'}</p>
            {score.critical.length > 0 && (
              <div className="banner bad">
                <span className="min0"><strong>{score.critical.length} critical items open.</strong> These stay visible no matter how good the overall score looks.
                  <ul className="bullets small" style={{ marginTop: 6 }}>{score.critical.slice(0, 6).map((c) => <li key={c.id}><EpicChip id={c.epic} /> {c.title} <span className="muted">({c.detail})</span></li>)}</ul>
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      <Card title="Staged readiness reviews" aside={<span className="small muted">Pick a checkpoint</span>}>
        <div className="stack">
          <div className="subtabs" role="group" aria-label="Review stage">
            {reviews.map((s) => (
              <button key={s.id} aria-pressed={stage === s.id} onClick={() => setStage(s.id)}>
                {s.short} · {s.done}/{s.items.length}{s.critical.length ? ` · ${s.critical.length}!` : ''}
              </button>
            ))}
          </div>
          <div className="spread">
            <p className="small">
              <strong>{review.label}:</strong> {review.outstanding.length ? `${review.outstanding.length} outstanding, ${review.critical.length} critical.` : 'everything due by this checkpoint is complete.'}
              {review.recorded && <span className="muted"> Last recorded {new Date(review.recorded.at).toLocaleDateString()} by {review.recorded.by}: EPIC {review.recorded.composite}, {review.recorded.criticalOpen} critical open.</span>}
            </p>
            {can('event.edit') && <button className="btn btn-secondary btn-sm" onClick={record}>Record this review</button>}
          </div>
          <div className="subtabs" role="group" aria-label="Group by">
            <button aria-pressed={groupBy === 'epic'} onClick={() => setGroupBy('epic')}>By EPIC area</button>
            <button aria-pressed={groupBy === 'status'} onClick={() => setGroupBy('status')}>Outstanding first</button>
          </div>
          {review.items.some((i) => i.informational) && <SafetyNote />}
          {groupBy === 'epic'
            ? EPIC_ORDER.map((d) => {
                const items = review.items.filter((i) => i.epic === d);
                if (!items.length) return null;
                const dom = score.domains.find((x) => x.id === d);
                return (
                  <section key={d} className="stack" style={{ gap: 4 }}>
                    <div className="spread" style={{ borderBottom: '2px solid var(--line)', paddingBottom: 6 }}>
                      <EpicChip id={d} long />
                      <span className="small muted">{items.filter((i) => i.status === 'done').length}/{items.length} done · area score {dom?.score ?? '–'}</span>
                    </div>
                    <Checklist event={event} items={items} showEpic={false} />
                  </section>
                );
              })
            : <Checklist event={event} items={[...review.outstanding.sort((a, b) => (a.weight === 'critical' ? -1 : 1) - (b.weight === 'critical' ? -1 : 1)), ...review.items.filter((i) => i.status === 'done')]} />}
        </div>
      </Card>

      <p className="small muted">EPIC areas: {EPIC_ORDER.map((d) => EPIC_DOMAINS[d].name).join(' · ')}. Controls are scaled to this event's size, format and risk.</p>
    </div>
  );
}
