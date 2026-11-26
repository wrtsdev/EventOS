import { useMemo, useState } from 'react';
import { useStore } from '../../store.jsx';
import { commsSummary, messagesFor, questionsFor, documentsFor, accessFor, AUDIENCES } from '../../domain/comms.js';
import { Card, Stat, Progress, Gate, AssistantTag } from '../../components/ui.jsx';

const STATUS_TONE = { draft: 'neutral', approved: 'good', scheduled: 'good', sent: 'good' };
const STATUS_LABEL = { draft: 'Draft', approved: 'Approved', scheduled: 'Scheduled', sent: 'Sent' };

export default function Comms({ event }) {
  const { dispatch, can, org, role } = useStore();
  const c = useMemo(() => commsSummary(event), [event]);
  const [audience, setAudience] = useState('all');
  const [handoff, setHandoff] = useState(event.handoff ?? '');
  const [lang, setLang] = useState('');
  const editable = can('event.edit');
  const canApprove = can('comms.approve');
  const update = (patch, toast) => dispatch({ type: 'updateEvent', id: event.id, patch, toast });

  const approve = (id) => update({ messages: messagesFor(event).map((m) => (m.id === id ? { ...m, status: 'approved', approvedBy: org?.coordinator || role } : m)) }, 'Approved. It will go out through your connected email tool (demo: nothing is sent).');
  const answer = (id, text) => update({ questions: questionsFor(event).map((q) => (q.id === id ? { ...q, status: 'answered', answer: text } : q)) });
  const toggleDoc = (id) => update({ documents: documentsFor(event).map((d) => (d.id === id ? { ...d, status: d.status === 'current' ? 'missing' : 'current' } : d)) });
  const access = accessFor(event);
  const shown = c.messages.filter((m) => audience === 'all' || m.audience === audience);

  return (
    <Gate feature="comms" tier={org?.tier}>
      <div className="stack-lg">
        <div>
          <div className="eyebrow">Information & Culture</div>
          <h2 className="display" style={{ fontSize: 32 }}>Communication and community trust</h2>
        </div>

        <div className="grid-stats">
          <Stat label="Audience coverage" value={`${Math.round(c.coverage * 100)}%`} sub="Audiences with an approved message" />
          <Stat label="Drafts waiting" value={c.drafts.length} sub={c.awaitingApproval.length ? `${c.awaitingApproval.length} drafted by the assistant` : 'Need approval before sending'} />
          <Stat label="Open questions" value={c.openQuestions.length} sub={`${c.questions.length} asked in total`} />
          <Stat label="Knowledge transfer" value={`${Math.round(c.knowledgeTransfer * 100)}%`} sub="Documents, handoff notes, review" />
        </div>

        <Card title="Messages by audience" aside={<span className="small muted">Sent through HubSpot workflows when connected (demo)</span>}>
          <div className="stack">
            <div className="subtabs" role="group" aria-label="Audience">
              <button aria-pressed={audience === 'all'} onClick={() => setAudience('all')}>All</button>
              {c.audiences.map((a) => <button key={a.id} aria-pressed={audience === a.id} onClick={() => setAudience(a.id)}>{a.label} {a.ready}/{a.total}</button>)}
            </div>
            <div className="table-wrap">
              <table className="t" style={{ minWidth: 640 }}>
                <thead><tr><th>When</th><th>Message</th><th>Audience</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {shown.map((m) => (
                    <tr key={m.id}>
                      <td className="small" style={{ whiteSpace: 'nowrap' }}>{m.when}</td>
                      <td><div style={{ fontWeight: 600 }}>{m.title}</div><div className="small muted">{m.detail} · {m.channel}</div>{m.author === 'assistant' && <AssistantTag />}</td>
                      <td className="small">{AUDIENCES[m.audience]}</td>
                      <td><span className={`pill ${STATUS_TONE[m.status]}`}>{STATUS_LABEL[m.status]}</span>{m.approvedBy && <div className="small muted">by {m.approvedBy}</div>}</td>
                      <td>{m.status === 'draft' && (canApprove ? <button className="btn btn-secondary btn-sm" onClick={() => approve(m.id)}>Approve</button> : <span className="small muted">Needs approver</span>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted">Nothing is published automatically. Assistant drafts and template drafts both need a person with approval rights.</p>
          </div>
        </Card>

        <div className="grid-2">
          <Card title="Open questions">
            {c.questions.length === 0 ? <p className="small muted">No questions yet.</p> : (
              <ul className="list-plain">
                {c.questions.map((q) => <Question key={q.id} q={q} onAnswer={editable ? (t) => answer(q.id, t) : null} />)}
              </ul>
            )}
          </Card>
          <Card title="Language and accessibility">
            <div className="stack" style={{ gap: 8 }}>
              <div className="row" style={{ gap: 6 }}>{access.languages.map((l) => <span key={l} className="pill neutral plain">{l}</span>)}</div>
              {editable && (
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <label htmlFor="add-lang" style={{ position: 'absolute', left: -9999 }}>Add a language</label>
                  <input id="add-lang" className="input" value={lang} onChange={(e) => setLang(e.target.value)} placeholder="Add a language" />
                  <button className="btn btn-secondary btn-sm" onClick={() => { if (lang.trim()) { update({ access: { ...access, languages: [...access.languages, lang.trim()] } }); setLang(''); } }}>Add</button>
                </div>
              )}
              <ul className="bullets small">{access.features.map((f) => <li key={f}>{f}</li>)}</ul>
              <p className="small muted">Culturally relevant programming comes from your partners. Ask them to review key messages before they go out.</p>
            </div>
          </Card>
        </div>

        <div className="grid-2">
          <Card title="Documents">
            <ul className="list-plain">
              {c.documents.map((d) => (
                <li key={d.id} className="spread">
                  <span><strong>{d.name}</strong> <span className="small muted">{d.kind}</span></span>
                  {editable ? <button className={`pill ${d.status === 'current' ? 'good' : 'warn'}`} style={{ border: 0, cursor: 'pointer' }} onClick={() => toggleDoc(d.id)}>{d.status === 'current' ? 'Current' : 'Missing'}</button> : <span className={`pill ${d.status === 'current' ? 'good' : 'warn'}`}>{d.status}</span>}
                </li>
              ))}
            </ul>
            <p className="small muted" style={{ marginTop: 8 }}>The prototype tracks which documents exist; file storage connects in production.</p>
          </Card>
          <Card title="Handoff notes">
            <div className="stack" style={{ gap: 8 }}>
              <label htmlFor="handoff" className="small muted">What should next year's team know?</label>
              <textarea id="handoff" className="textarea" value={handoff} onChange={(e) => setHandoff(e.target.value)} disabled={!editable} placeholder="Contacts who were great, what to book earlier, what to never do again." />
              {editable && <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => update({ handoff }, 'Handoff notes saved')}>Save notes</button>}
            </div>
          </Card>
        </div>

        <Card title="Coverage by audience">
          <div className="stack" style={{ gap: 10 }}>
            {c.audiences.map((a) => (
              <div key={a.id} className="stack" style={{ gap: 4 }}>
                <div className="spread small"><strong>{a.label}</strong><span className="muted">{a.ready} of {a.total} approved or sent</span></div>
                <Progress value={a.total ? a.ready / a.total : 0} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Gate>
  );
}

function Question({ q, onAnswer }) {
  const [text, setText] = useState('');
  return (
    <li className="stack" style={{ gap: 4, paddingBottom: 8, borderBottom: '1px solid var(--line)' }}>
      <div className="spread"><strong className="small">{q.text}</strong><span className={`pill ${q.status === 'open' ? 'warn' : 'good'} plain`}>{q.status}</span></div>
      <span className="small muted">From: {q.from}</span>
      {q.status === 'answered' && <span className="small">{q.answer}</span>}
      {q.status === 'open' && onAnswer && (
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <label htmlFor={'ans-' + q.id} style={{ position: 'absolute', left: -9999 }}>Answer</label>
          <input id={'ans-' + q.id} className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Answer" />
          <button className="btn btn-secondary btn-sm" onClick={() => text.trim() && onAnswer(text.trim())}>Answer</button>
        </div>
      )}
    </li>
  );
}
