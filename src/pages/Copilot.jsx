import { useMemo, useRef, useState, useEffect } from 'react';
import { useStore, useSim } from '../store.jsx';
import { localRulesProvider, SUGGESTED_QUESTIONS, GUARDRAILS } from '../copilot/engine.js';
import { SafetyNote, AssistantTag } from '../components/ui.jsx';
import { SAMPLE_ORG } from '../data/sampleData.js';
import Icon from '../components/Icon.jsx';

function Answer({ a, onLink }) {
  return (
    <div className="msg bot">
      <div className="spread"><h4>{a.title}</h4>{a.basis === 'suggestion' ? <AssistantTag /> : <span className="pill good plain">From your event records</span>}</div>
      {a.blocks.map((b, i) => {
        if (b.type === 'p') return <p key={i}>{b.text}</p>;
        if (b.type === 'list') return <ul key={i} className="bullets">{b.items.map((x) => <li key={x}>{x}</li>)}</ul>;
        if (b.type === 'steps') return <ol key={i} className="steps-list">{b.items.map((x) => <li key={x.when}><b>{x.when}</b>{x.text}</li>)}</ol>;
        return null;
      })}
      {a.disclaimer && <SafetyNote text={a.disclaimer} />}
      {a.link && <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => onLink(a.link)}>{a.link.label} →</button>}
    </div>
  );
}

export default function Copilot({ eventId }) {
  const { navigate, org, events, can } = useStore();
  const [selected, setSelected] = useState(eventId ?? events[0]?.id);
  const event = events.find((e) => e.id === selected) ?? events[0];
  const sim = useSim(event);
  const o = org ?? SAMPLE_ORG;
  const enabled = o.assistantEnabled !== false;
  const provider = useMemo(() => (event && enabled ? localRulesProvider({ event, sim, org: o }) : null), [event, sim, o, enabled]);
  const [thread, setThread] = useState([]);
  const [q, setQ] = useState('');
  const endRef = useRef(null);

  useEffect(() => setThread([]), [selected]);
  useEffect(() => {
    if (thread.length) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [thread]);

  const ask = async (question) => {
    if (!question.trim() || !provider) return;
    const answer = await provider.answer(question);
    setThread((t) => [...t, { q: question, a: answer }]);
    setQ('');
  };

  const onLink = (link) => navigate(link.view ? link.view : { name: 'event', eventId: event.id, tab: link.tab });

  if (!enabled) {
    return (
      <div className="stack-lg fade-in" style={{ maxWidth: 820, margin: '0 auto', width: '100%' }}>
        <header className="page-head"><div className="eyebrow">Planning assistant</div><h1>Assistant is turned off</h1></header>
        <div className="empty">Your organization has turned the assistant off. Everything else in EventOS works the same: readiness, finance, safety, reports and reviews are all calculated from your records.{can('org.admin') && <> <button className="btn btn-ghost" onClick={() => navigate('settings')}>Change in Settings</button></>}</div>
      </div>
    );
  }
  if (!event) return <div className="empty">Create an event first, then ask the assistant about it.</div>;

  return (
    <div className="stack-lg fade-in" style={{ maxWidth: 820, margin: '0 auto', width: '100%' }}>
      <header className="page-head">
        <div className="eyebrow">Planning assistant · optional</div>
        <h1>Ask about your event</h1>
        <div className="field" style={{ maxWidth: 420 }}>
          <label htmlFor="cp-event">Event</label>
          <select id="cp-event" className="select" value={event.id} onChange={(e) => setSelected(e.target.value)}>
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div className="info small">{GUARDRAILS} Answers marked <AssistantTag /> are recommendations; answers marked “From your event records” restate your own data.</div>
        <p className="small muted">Prototype: a local rules engine reads only this organization’s records for the selected event. The same interface can host an AI model or MCP-connected agent with the same limits.</p>
      </header>

      <div className="chat">
        <div className="msg bot">
          <h4>Hi{o.coordinator ? `, ${o.coordinator.split(' ')[0]}` : ''}. I know {event.name}.</h4>
          <p>Ask what is left to do, which EPIC controls apply, where things are stuck, or what to plan next.</p>
        </div>
        {thread.map((t, i) => (
          <div key={i} className="chat">
            <div className="msg user">{t.q}</div>
            <Answer a={t.a} onLink={onLink} />
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="chips">
        {SUGGESTED_QUESTIONS.map((s) => <button key={s} className="chip-btn" onClick={() => ask(s)}>{s}</button>)}
      </div>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <label htmlFor="cp-q" style={{ position: 'absolute', left: -9999 }}>Your question</label>
        <input id="cp-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything about this event" autoComplete="off" />
        <button className="btn btn-primary" type="submit" aria-label="Ask"><Icon name="send" size={18} /></button>
      </form>
    </div>
  );
}
