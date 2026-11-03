import { useMemo, useState } from 'react';
import { useStore } from '../../store.jsx';
import { riskAssessment, riskLevel, risksFor, contactsStatus, contactsFor, incidentsFor, newIncident, weatherFor, WEATHER_STATUS } from '../../domain/safety.js';
import { epicScore } from '../../domain/epic.js';
import { stageReviews } from '../../domain/controls.js';
import { redactIncident } from '../../domain/access.js';
import { accessFor } from '../../domain/comms.js';
import { Card, Ring, SafetyNote, EpicChip } from '../../components/ui.jsx';

const LEVEL_TONE = { high: 'bad', medium: 'warn', low: 'good' };

export default function Safety({ event, sim }) {
  const { org, dispatch, can, role } = useStore();
  const ra = useMemo(() => riskAssessment(event), [event]);
  const cs = useMemo(() => contactsStatus(event), [event]);
  const score = useMemo(() => epicScore(event, sim, org), [event, sim, org]);
  const reviews = useMemo(() => stageReviews(event, sim), [event, sim]);
  const p = score.domains.find((d) => d.id === 'P');
  const critP = score.critical.filter((c) => c.epic === 'P');
  const editable = can('safety.edit') && event.status !== 'canceled';
  const weather = weatherFor(event);
  const access = accessFor(event);

  const setRisk = (id, patch) => dispatch({ type: 'updateEvent', id: event.id, perm: 'safety.edit', patch: { risks: risksFor(event).map((r) => (r.id === id ? { ...r, ...patch } : r)) } });
  const setContact = (i, patch) => dispatch({ type: 'updateEvent', id: event.id, perm: 'safety.edit', patch: { contacts: contactsFor(event).map((c, j) => (j === i ? { ...c, ...patch } : c)) } });

  return (
    <div className="stack-lg">
      <div className="spread">
        <div>
          <div className="eyebrow">Public Safety & Resilience</div>
          <h2 className="display" style={{ fontSize: 32 }}>Safety and resilience readiness</h2>
        </div>
      </div>
      <SafetyNote text="Planning support only. EventOS does not certify safety plans or replace approval from your permitting office, insurer, EMS provider or police." />

      <section className="card">
        <div className="row" style={{ gap: 20, alignItems: 'flex-start' }}>
          <Ring value={p.score ?? 0} caption="P score" size={112} tone={p.score >= 85 ? 'good' : p.score >= 60 ? 'warn' : 'bad'} />
          <div className="min0 stack" style={{ gap: 8, flex: 1, minWidth: 220 }}>
            <p className="small">{p.controls.filter((c) => c.status === 'done').length} of {p.controls.length} safety controls complete · {Math.round(p.coverage * 100)}% assessed · {ra.reviewed} of {ra.risks.length} risks reviewed · {cs.confirmed} of {cs.total} emergency contacts confirmed.</p>
            {critP.length ? (
              <div className="banner bad"><span className="min0"><strong>{critP.length} critical safety items open.</strong> A good overall score does not clear these.
                <ul className="bullets small" style={{ marginTop: 6 }}>{critP.map((c) => <li key={c.id}>{c.title} <span className="muted">({c.detail})</span></li>)}</ul></span></div>
            ) : <div className="banner good"><span><strong>No critical safety items open</strong> for this phase.</span></div>}
            <div className="subtabs">
              {reviews.map((r) => {
                const pending = r.outstanding.filter((i) => i.epic === 'P');
                return <span key={r.id} className={`pill ${pending.some((i) => i.weight === 'critical') ? 'bad' : pending.length ? 'warn' : 'good'} plain`}>{r.short}: {pending.length ? `${pending.length} open` : 'clear'}</span>;
              })}
            </div>
          </div>
        </div>
      </section>

      <div className="grid-2">
        <Card title="Risk heatmap">
          <div className="riskgrid" role="img" aria-label="Risks by likelihood and impact">
            <span className="ax" />
            {['Low', 'Medium', 'High'].map((x) => <span key={x} className="ax">{x} impact</span>)}
            {ra.heat.map((row, ri) => [
              <span key={'l' + ri} className="ax">{['Likely', 'Possible', 'Unlikely'][ri]}</span>,
              ...row.map((cell, ci) => {
                const sev = (3 - ri) * (ci + 1);
                const open = cell.filter((r) => !r.reviewed || !r.owner).length;
                return <span key={ri + '-' + ci} className={`rc ${cell.length ? (sev >= 6 ? 'h-bad' : sev >= 3 ? 'h-warn' : 'h-good') : 'h-none'}`} title={cell.map((r) => r.hazard).join(', ')}>{cell.length || ''}{open ? <small style={{ fontSize: 10, marginLeft: 3 }}>({open} open)</small> : ''}</span>;
              }),
            ])}
          </div>
        </Card>
        <Card title="Weather and continuity">
          <dl className="kv">
            <dt>Current decision</dt><dd><span className={`pill ${WEATHER_STATUS[weather.status].tone}`}>{WEATHER_STATUS[weather.status].label}</span></dd>
            <dt>Decision maker</dt><dd>{weather.decidedBy || 'Organizer on duty'}</dd>
          </dl>
          <p className="small muted" style={{ marginTop: 8 }}>Record go, delay, modify or cancel on the Event day tab. Delay and cancel messages are drafted in Communications and need approval before sending.</p>
          <div className="eyebrow" style={{ margin: '12px 0 6px' }}>Accessibility plan</div>
          <ul className="bullets small">{access.features.map((f) => <li key={f}>{f}</li>)}<li>Languages: {access.languages.join(', ')}</li></ul>
        </Card>
      </div>

      <Card title="Risk register" aside={<span className="small muted">{ra.incomplete.length ? `${ra.incomplete.length} need review` : 'All reviewed'}</span>}>
        {!ra.anyReviewed && <p className="small" style={{ marginBottom: 8 }}>These are suggestions for an event like yours. They do not count as an assessment until someone reviews each one and names an owner.</p>}
        <div className="table-wrap">
          <table className="t" style={{ minWidth: 820 }}>
            <thead><tr><th>Risk</th><th>Level</th><th>Likelihood</th><th>Impact</th><th>Mitigation</th><th>Owner</th><th>Reviewed</th></tr></thead>
            <tbody>
              {ra.risks.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.hazard}<div className="small muted">{r.category}</div></td>
                  <td><span className={`pill ${LEVEL_TONE[riskLevel(r)]}`}>{riskLevel(r)}</span></td>
                  <td>{editable ? <select aria-label={`Likelihood ${r.hazard}`} className="inline-input" value={r.likelihood} onChange={(e) => setRisk(r.id, { likelihood: Number(e.target.value) })}><option value={1}>Unlikely</option><option value={2}>Possible</option><option value={3}>Likely</option></select> : ['', 'Unlikely', 'Possible', 'Likely'][r.likelihood]}</td>
                  <td>{editable ? <select aria-label={`Impact ${r.hazard}`} className="inline-input" value={r.impact} onChange={(e) => setRisk(r.id, { impact: Number(e.target.value) })}><option value={1}>Low</option><option value={2}>Medium</option><option value={3}>High</option></select> : ['', 'Low', 'Medium', 'High'][r.impact]}</td>
                  <td className="small" style={{ minWidth: 220 }}>{editable ? <textarea aria-label={`Mitigation ${r.hazard}`} className="inline-input" rows={3} style={{ maxWidth: 'none' }} value={r.mitigation} onChange={(e) => setRisk(r.id, { mitigation: e.target.value })} /> : r.mitigation}</td>
                  <td>{editable ? <input aria-label={`Owner ${r.hazard}`} className="inline-input" value={r.owner} placeholder="Name or role" onChange={(e) => setRisk(r.id, { owner: e.target.value })} /> : r.owner || '—'}</td>
                  <td>{editable ? <input type="checkbox" aria-label={`Reviewed ${r.hazard}`} checked={r.reviewed} onChange={(e) => setRisk(r.id, { reviewed: e.target.checked, mitigationStatus: e.target.checked ? 'planned' : 'suggested' })} /> : r.reviewed ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Emergency contact directory" aside={<span className={`pill ${cs.complete ? 'good' : 'warn'}`}>{cs.confirmed}/{cs.total} confirmed</span>}>
        <div className="table-wrap">
          <table className="t" style={{ minWidth: 560 }}>
            <thead><tr><th>Role</th><th>Name</th><th>Phone</th><th>Confirmed</th></tr></thead>
            <tbody>
              {cs.contacts.map((c, i) => (
                <tr key={c.role}>
                  <td style={{ fontWeight: 600 }}>{c.role}</td>
                  <td>{editable ? <input aria-label={`${c.role} name`} className="inline-input" value={c.name} onChange={(e) => setContact(i, { name: e.target.value })} /> : c.name || '—'}</td>
                  <td>{editable ? <input aria-label={`${c.role} phone`} className="inline-input" value={c.phone} onChange={(e) => setContact(i, { phone: e.target.value })} /> : c.phone || '—'}</td>
                  <td>{editable ? <input type="checkbox" aria-label={`${c.role} confirmed`} checked={c.confirmed} onChange={(e) => setContact(i, { confirmed: e.target.checked })} /> : c.confirmed ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>Demo numbers use the fictional 555-01xx range.</p>
      </Card>

      <Incidents event={event} role={role} />
    </div>
  );
}

export function Incidents({ event, role }) {
  const { dispatch, can } = useStore();
  const [draft, setDraft] = useState(null);
  const list = incidentsFor(event);
  const canView = can('incidents.view');
  const canEdit = can('incidents.edit') && event.status !== 'canceled';
  const shown = list.map((i) => redactIncident(i, role));
  const save = () => {
    dispatch({ type: 'updateEvent', id: event.id, perm: 'incidents.edit', patch: { incidents: [...list, newIncident(draft)] }, toast: 'Incident logged (restricted record)' });
    setDraft(null);
  };
  const close = (id) => dispatch({ type: 'updateEvent', id: event.id, perm: 'incidents.edit', patch: { incidents: list.map((i) => (i.id === id ? { ...i, status: 'closed' } : i)) } });

  return (
    <Card title="Incident log" aside={<span className="row" style={{ gap: 6 }}><EpicChip id="P" /><span className="pill neutral plain">Restricted</span></span>}>
      <div className="stack" style={{ gap: 10 }}>
        {!canView && <p className="small muted">Your role sees that incidents exist, not their details.</p>}
        {shown.length === 0 ? <p className="small muted">No incidents recorded.</p> : (
          <ul className="list-plain">
            {shown.map((i) => (
              <li key={i.id} className="stack" style={{ gap: 4, paddingBottom: 8, borderBottom: '1px solid var(--line)' }}>
                <div className="spread"><strong>{i.time} · {i.type}</strong><span className="row" style={{ gap: 6 }}><span className={`pill ${i.severity === 'serious' ? 'bad' : i.severity === 'moderate' ? 'warn' : 'neutral'}`}>{i.severity}</span><span className={`pill ${i.status === 'closed' ? 'good' : 'warn'} plain`}>{i.status}</span></span></div>
                <span className="small">{i.summary}</span>
                {i.actions && <span className="small muted">Actions: {i.actions}</span>}
                {canEdit && !i.redacted && i.status !== 'closed' && <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => close(i.id)}>Mark closed</button>}
              </li>
            ))}
          </ul>
        )}
        {canEdit && !draft && <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setDraft({ type: 'Medical', severity: 'minor', summary: '', actions: '', involvesMinor: false })}>Log an incident</button>}
        {draft && (
          <div className="form-grid">
            <div className="field"><label htmlFor="inc-type">Type</label><select id="inc-type" className="select" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>{['Medical', 'Weather', 'Security', 'Separated child', 'Course', 'Facility', 'Other'].map((t) => <option key={t}>{t}</option>)}</select></div>
            <div className="field"><label htmlFor="inc-sev">Severity</label><select id="inc-sev" className="select" value={draft.severity} onChange={(e) => setDraft({ ...draft, severity: e.target.value })}><option value="minor">Minor</option><option value="moderate">Moderate</option><option value="serious">Serious</option></select></div>
            <div className="field full"><label htmlFor="inc-sum">What happened (facts only)</label><textarea id="inc-sum" className="textarea sm" value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} /></div>
            <div className="field full"><label htmlFor="inc-act">Actions taken</label><input id="inc-act" className="input" value={draft.actions} onChange={(e) => setDraft({ ...draft, actions: e.target.value })} /></div>
            <label className="toggle-row full" htmlFor="inc-minor"><input id="inc-minor" type="checkbox" checked={draft.involvesMinor} onChange={(e) => setDraft({ ...draft, involvesMinor: e.target.checked })} /><span>Involves a minor (details limited to owner and safety lead)</span></label>
            <div className="row full"><button className="btn btn-primary btn-sm" onClick={save} disabled={!draft.summary.trim()}>Save incident</button><button className="btn btn-ghost btn-sm" onClick={() => setDraft(null)}>Cancel</button></div>
          </div>
        )}
      </div>
    </Card>
  );
}

