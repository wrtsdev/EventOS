import { useMemo, useRef, useState, useEffect } from 'react';
import { useStore, useSim } from '../store.jsx';
import { localRulesProvider, SUGGESTED_QUESTIONS } from '../copilot/engine.js';
import { SafetyNote } from '../components/ui.jsx';
import { SAMPLE_ORG } from '../data/sampleData.js';
import Icon from '../components/Icon.jsx';

function Answer({ a, onLink }) {
  return (
    <div className="msg bot">
      <h4>{a.title}</h4>
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
  const { state, navigate } = useStore();
  const [selected, setSelected] = useState(eventId ?? state.events[0]?.id);
  const event = state.events.find((e) => e.id === selected) ?? state.events[0];
  const sim = useSim(event);
  const org = state.org ?? SAMPLE_ORG;
  const provider = useMemo(() => (event ? localRulesProvider({ event, sim, org }) : null), [event, sim, org]);
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

  if (!event) return <div className="empty">Create an event first, then ask Copilot about it.</div>;

  return (
    <div className="stack-lg fade-in" style={{ maxWidth: 820, margin: '0 auto', width: '100%' }}>
      <header className="page-head">
        <div className="eyebrow">EventOS Copilot</div>
        <h1>Ask about your event</h1>
        <div className="field" style={{ maxWidth: 420 }}>
          <label htmlFor="cp-event">Event</label>
          <select id="cp-event" className="select" value={event.id} onChange={(e) => setSelected(e.target.value)}>
            {state.events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <p className="small muted">Prototype: answers are built from this event’s data by a local rules engine. The same interface is ready for a hosted AI model or MCP-connected agent.</p>
      </header>

      <div className="chat">
        <div className="msg bot">
          <h4>Hi{org.coordinator ? `, ${org.coordinator.split(' ')[0]}` : ''}. I know {event.name}.</h4>
          <p>Ask me what is left to do, how registration is going, who to invite back, or what to plan next.</p>
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
        <label htmlFor="cp-q" className="sr-only" style={{ position: 'absolute', left: -9999 }}>Your question</label>
        <input id="cp-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything about this event" autoComplete="off" />
        <button className="btn btn-primary" type="submit" aria-label="Ask"><Icon name="send" size={18} /></button>
      </form>
    </div>
  );
}
