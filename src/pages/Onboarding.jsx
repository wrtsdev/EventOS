import { useState } from 'react';
import { useStore } from '../store.jsx';
import { SAMPLE_ORG } from '../data/sampleData.js';
import { FOUR_W_LIST } from '../domain/fourW.js';

const ORG_TYPES = ['Nonprofit', 'Run club', 'School or PTA', 'Faith organization', 'Greek-letter organization', 'Employer / HR', 'Municipality / recreation', 'Veterans organization', 'Neighborhood association', 'Community health organization', 'Other'];
const EXPERIENCE = [
  { id: 'never', label: 'Never organized one' },
  { id: 'some', label: 'Helped with one or two' },
  { id: 'regular', label: 'We run events every year' },
];

export default function Onboarding() {
  const { dispatch, navigate } = useStore();
  const [name, setName] = useState('');
  const [type, setType] = useState('Nonprofit');
  const [coordinator, setCoordinator] = useState('');
  const [experience, setExperience] = useState('never');
  const [perYear, setPerYear] = useState(1);

  const start = (next) => {
    const org = name.trim()
      ? { id: 'org-' + Date.now().toString(36), name: name.trim(), type, coordinator: coordinator.trim(), experience, eventsPerYear: Number(perYear) || 1, historicMembers: 0, membershipPerParticipant: 12 }
      : SAMPLE_ORG;
    dispatch({ type: 'setOrg', org });
    navigate(next);
  };

  return (
    <div className="stack-lg fade-in">
      <section className="hero">
        <div className="eyebrow">We Run These Streetz · EventOS</div>
        <h1>From idea <em>to impact</em></h1>
        <p>Build your community event in one guided system. You bring the community. EventOS helps you build the experience, then shows you what it created.</p>
        <div className="row" style={{ marginTop: 18 }}>
          <a className="btn btn-primary" href="#org-setup">Set up your organization</a>
          <button className="btn btn-secondary" onClick={() => start('home')}>Explore the demo</button>
        </div>
        <div className="hero-flow" aria-label="The EventOS lifecycle">
          {['Community need', 'Event creation', 'Registration', 'Participation', 'Cause + 4W engagement', 'Community intelligence', 'Impact', 'Next experience', 'Stronger community'].map((s, i) => (
            <span key={s} className={i === 0 || i === 8 ? 'hl' : ''}>{s}</span>
          ))}
        </div>
      </section>

      <div className="grid-2">
        <section className="card stack" id="org-setup">
          <div>
            <div className="eyebrow">Step 1 of 2</div>
            <h2 className="display" style={{ fontSize: 30, marginTop: 4 }}>Who is hosting?</h2>
          </div>
          <div className="field">
            <label htmlFor="org-name">Organization name</label>
            <input id="org-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Eastgate PTA" />
          </div>
          <div className="field">
            <label htmlFor="org-type">What kind of organization?</label>
            <select id="org-type" className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {ORG_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="org-coord">Your name</label>
            <input id="org-coord" className="input" value={coordinator} onChange={(e) => setCoordinator(e.target.value)} placeholder="Event coordinator" />
          </div>
          <div className="field">
            <label>Have you organized a walk or run before?</label>
            <div className="seg" role="group">
              {EXPERIENCE.map((x) => (
                <button key={x.id} aria-pressed={experience === x.id} onClick={() => setExperience(x.id)}>{x.label}</button>
              ))}
            </div>
            {experience === 'never' && <span className="hint">Perfect. EventOS walks you through every step and flags what you still need.</span>}
          </div>
          <div className="field">
            <label htmlFor="org-per-year">How many events a year are you planning?</label>
            <input id="org-per-year" className="input" type="number" min="1" max="50" value={perYear} onChange={(e) => setPerYear(e.target.value)} style={{ maxWidth: 120 }} />
          </div>
          <div className="row">
            <button className="btn btn-primary" onClick={() => start('builder')} disabled={!name.trim()}>Build my first event</button>
            <button className="btn btn-secondary" onClick={() => start('home')}>{name.trim() ? 'Go to my dashboard' : 'Use the demo organization'}</button>
          </div>
        </section>

        <section className="card stack">
          <div>
            <div className="eyebrow">The WRTS 4Ws</div>
            <h2 className="display" style={{ fontSize: 30, marginTop: 4 }}>Every event can move a community forward</h2>
          </div>
          <ul className="list-plain">
            {FOUR_W_LIST.map((w) => (
              <li key={w.id} className="stack" style={{ gap: 4 }}>
                <span className={`wchip ${w.id}`} style={{ alignSelf: 'flex-start' }}>{w.name}</span>
                <span style={{ fontWeight: 700 }}>{w.prompt}</span>
                <span className="small muted">{w.summary}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="compare">
        <div className="old">
          <div className="eyebrow">Traditional race software asks</div>
          <b>How many people registered?</b>
          <p className="small" style={{ marginTop: 8 }}>Registration → Race → Results</p>
        </div>
        <div className="new">
          <div className="eyebrow">EventOS asks</div>
          <b>What did this event create for the community?</b>
          <p className="small" style={{ marginTop: 8, color: '#c8d7ff' }}>Need → Event → Participation → Cause and 4W engagement → Intelligence → Impact → Next experience</p>
        </div>
      </section>
    </div>
  );
}
