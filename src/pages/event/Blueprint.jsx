import { useMemo } from 'react';
import { buildBlueprint } from '../../domain/blueprint.js';
import { EXPERIENCE_FEATURES } from '../../domain/catalog.js';
import { FOUR_WS } from '../../domain/fourW.js';
import { Ring, Card, SafetyNote, WChip, readinessTone } from '../../components/ui.jsx';
import { Checklist } from './Checklist.jsx';

export default function Blueprint({ event }) {
  const bp = useMemo(() => buildBlueprint(event), [event]);
  const r = bp.readiness;
  const prog = (event.programming ?? [])
    .map((id) => Object.values(FOUR_WS).flatMap((w) => w.programming.map((p) => ({ ...p, fourW: w.id }))).find((p) => p.id === id))
    .filter(Boolean);

  return (
    <div className="stack-lg">
      <section className="card">
        <div className="row" style={{ alignItems: 'flex-start', gap: 20 }}>
          <Ring value={r.score} label={r.score + '%'} caption="Ready" size={128} stroke={12} tone={readinessTone(r.score)} />
          <div className="min0 stack" style={{ flex: 1, gap: 10, minWidth: 220 }}>
            <div>
              <div className="eyebrow">Smart Event Blueprint</div>
              <h3 className="display" style={{ fontSize: 30, marginTop: 4 }}>Event readiness: {r.score}%</h3>
            </div>
            <p className="small">{r.done} of {r.items.length} items complete. Tap any status to update it.</p>
            {r.missing.length > 0 ? (
              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>Still missing</div>
                <div className="row" style={{ gap: 6 }}>
                  {r.missing.map((i) => <span key={i.id} className={`pill ${i.status === 'blocking' ? 'bad' : 'warn'}`}>{i.label}</span>)}
                </div>
              </div>
            ) : <span className="pill good">Everything is in place</span>}
          </div>
        </div>
      </section>

      <div className="grid-2">
        <Card title="Experience">
          <dl className="kv">
            <dt>Distance</dt><dd>{bp.experience.distance}</dd>
            <dt>Event type</dt><dd>{bp.experience.eventType}</dd>
            <dt>Format</dt><dd>{bp.experience.format}</dd>
            <dt>Audience</dt><dd>{bp.experience.audience}</dd>
            <dt>Expected participants</dt><dd>{bp.experience.expected}</dd>
          </dl>
        </Card>
        <Card title="Purpose">
          <div className="stack" style={{ gap: 10 }}>
            <dl className="kv">
              <dt>Main purpose</dt><dd>{bp.purpose.purpose}</dd>
              <dt>Beneficiary</dt><dd>{bp.purpose.cause}</dd>
            </dl>
            <div className="row" style={{ gap: 6 }}>{bp.purpose.fourWs.map((w) => <WChip key={w.id} id={w.id} />)}</div>
            <p className="small">{bp.purpose.objective}</p>
          </div>
        </Card>
      </div>

      <Card title="Operations" aside={<span className="small muted">Registration, safety, race day, people</span>}>
        <div className="stack">
          <SafetyNote />
          <Checklist event={event} items={bp.operations} />
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Engagement">
          <div className="stack" style={{ gap: 12 }}>
            <dl className="kv">
              <dt>Teams</dt><dd>{bp.engagement.teams ? 'On' : 'Off'}</dd>
              <dt>Challenges</dt><dd>{bp.engagement.challenges ? 'On' : 'Off'}</dd>
              <dt>Sponsors</dt><dd>{bp.engagement.sponsors ? 'On' : 'Off'}</dd>
              <dt>Volunteers needed</dt><dd>{bp.engagement.volunteers}</dd>
            </dl>
            {bp.engagement.partners.length > 0 && (
              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>Community partners to invite</div>
                <ul className="bullets small">{bp.engagement.partners.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            )}
            {prog.length > 0 && (
              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>4W programming</div>
                <ul className="list-plain small">{prog.map((p) => <li key={p.id} className="row" style={{ gap: 6 }}><WChip id={p.fourW} /> {p.label}</li>)}</ul>
              </div>
            )}
            <div className="small muted">Features: {(event.features ?? []).map((id) => EXPERIENCE_FEATURES.find((f) => f.id === id)?.label).filter(Boolean).join(', ')}</div>
          </div>
        </Card>
        <Card title="What should happen when">
          <ul className="timeline">
            {bp.engagement.comms.map((c) => (
              <li key={c.when}>
                <div className="eyebrow">{c.when}</div>
                <div style={{ fontWeight: 700 }}>{c.title}</div>
                <div className="small muted">{c.detail}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Impact plan">
        <div className="grid-2">
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Success metrics</div>
            <ul className="bullets small">{bp.impact.metrics.map((m) => <li key={m}>{m}</li>)}{bp.impact.causeOutcomes.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Survey questions</div>
            <ul className="bullets small">{bp.impact.survey.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>After the event</div>
            <ul className="bullets small">{bp.impact.postEvent.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Partners and community readiness</div>
            <Checklist event={event} items={r.items.filter((i) => ['Partners', 'Community impact', 'Participant experience'].includes(i.category))} />
          </div>
        </div>
      </Card>
    </div>
  );
}
