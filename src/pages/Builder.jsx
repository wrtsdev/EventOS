import { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { PURPOSES, EVENT_TYPES, FORMATS, EXPERIENCE_FEATURES, getEventType, getPurpose } from '../domain/catalog.js';
import { FOUR_W_LIST, FOUR_WS, suggestFourWs } from '../domain/fourW.js';
import { recommend, readiness, volunteerNeed } from '../domain/blueprint.js';
import { getTemplate } from '../data/templates.js';
import { SAMPLE_ORG } from '../data/sampleData.js';
import { WChip, Ring, readinessTone } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

const STEPS = ['Why', 'Experience', 'Basics', 'Participants', 'Review'];

function blankDraft(org) {
  return {
    purpose: '',
    purposeOther: '',
    fourWs: [],
    typeId: '',
    format: 'physical',
    name: '',
    date: '',
    location: '',
    expected: 200,
    cap: '',
    price: 30,
    visibility: 'public',
    description: '',
    organization: org?.name ?? '',
    cause: '',
    contact: org?.email ?? '',
    features: [],
    programming: [],
  };
}

export default function Builder({ templateId }) {
  const { state, dispatch } = useStore();
  const org = state.org ?? SAMPLE_ORG;
  const template = getTemplate(templateId);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(() => (template ? { ...blankDraft(org), ...template.preset, organization: org.name, date: '' } : blankDraft(org)));
  const [featuresTouched, setFeaturesTouched] = useState(Boolean(template));
  const [moreOpen, setMoreOpen] = useState(false);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const rec = useMemo(() => recommend(draft), [draft]);

  const goTo = (n) => {
    if (n === 3 && !featuresTouched) {
      set({ features: rec.features, programming: draft.fourWs.flatMap((w) => rec.programming.filter((p) => p.fourW === w).slice(0, draft.fourWs.length > 1 ? 3 : 5)).map((p) => p.id) });
    }
    setStep(n);
    try { window.scrollTo({ top: 0 }); } catch { /* ignore */ }
  };

  const canNext = [
    Boolean(draft.purpose) && (draft.purpose !== 'other' || draft.purposeOther.trim()),
    Boolean(draft.typeId),
    Boolean(draft.name.trim()),
    true,
    true,
  ][step];

  const toggle = (key, id) => {
    if (key === 'features') setFeaturesTouched(true);
    set({ [key]: draft[key].includes(id) ? draft[key].filter((x) => x !== id) : [...draft[key], id] });
  };

  const choosePurpose = (id) => {
    const suggested = suggestFourWs(id);
    set({ purpose: id, fourWs: draft.fourWs.length ? draft.fourWs : suggested });
  };

  const chooseType = (id) => {
    const t = getEventType(id);
    const format = id === 'virtual' || id === 'wellness-challenge' || id === 'team-challenge' ? 'virtual' : id === 'hybrid' ? 'hybrid' : draft.format;
    set({ typeId: id, format, name: draft.name || (draft.fourWs[0] ? `Community ${FOUR_WS[draft.fourWs[0]].name} ${t.label.replace(' walk/run', '')}` : '') });
  };

  const create = () => {
    const id = 'evt-' + Date.now().toString(36);
    const event = {
      ...draft,
      id,
      expected: Number(draft.expected) || 0,
      cap: draft.cap ? Number(draft.cap) : '',
      price: Number(draft.price) || 0,
      phase: 'planning',
      checklist: {},
      sponsors: [],
      templateId: templateId ?? null,
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: 'addEvent', event });
    dispatch({ type: 'toast', message: 'Your Event Blueprint is ready' });
  };

  const preview = useMemo(() => readiness({ ...draft, checklist: {} }), [draft]);

  return (
    <div className="wizard fade-in">
      <div className="stack" style={{ gap: 10 }}>
        <div className="spread">
          <span className="eyebrow">Event Builder · Step {step + 1} of {STEPS.length}: {STEPS[step]}</span>
          {template && <span className="pill neutral plain">Template: {template.name}</span>}
        </div>
        <div className="steps-meter" aria-hidden="true">{STEPS.map((s, i) => <span key={s} className={i <= step ? 'on' : ''} />)}</div>
      </div>

      {step === 0 && (
        <div className="stack-lg">
          <div className="stack" style={{ gap: 8 }}>
            <h2>Why are you gathering people?</h2>
            <p className="muted">Pick the main purpose. You can have more than one goal, but one usually leads.</p>
          </div>
          <div className="choices" role="group" aria-label="Main purpose">
            {PURPOSES.map((p) => (
              <button key={p.id} className="choice" aria-pressed={draft.purpose === p.id} onClick={() => choosePurpose(p.id)}>
                <span className="ct">{p.label}</span>
                <span className="ch">{p.hint}</span>
              </button>
            ))}
          </div>
          {draft.purpose === 'other' && (
            <div className="field">
              <label htmlFor="purpose-other">In your own words</label>
              <input id="purpose-other" className="input" value={draft.purposeOther} onChange={(e) => set({ purposeOther: e.target.value })} placeholder="What do you want this event to do?" />
            </div>
          )}
          <div className="stack" style={{ gap: 8 }}>
            <h2 style={{ fontSize: 30 }}>Which of the 4Ws does it serve?</h2>
            <p className="muted">Choose one or several. Your choice shapes the programming, partners, survey and follow-up EventOS suggests.</p>
          </div>
          <div className="choices" role="group" aria-label="4W focus">
            {FOUR_W_LIST.map((w) => (
              <button key={w.id} className={`choice w ${w.id}`} aria-pressed={draft.fourWs.includes(w.id)} onClick={() => toggle('fourWs', w.id)}>
                <span className="ct">{w.name}</span>
                <span className="ch">{w.prompt}</span>
              </button>
            ))}
          </div>
          {draft.fourWs.length > 1 && <p className="small muted">Multiple selected. EventOS will blend programming from {draft.fourWs.map((w) => FOUR_WS[w].name).join(' and ')}.</p>}
        </div>
      )}

      {step === 1 && (
        <div className="stack-lg">
          <div className="stack" style={{ gap: 8 }}>
            <h2>Choose the experience</h2>
            <p className="muted">What will people do together?</p>
          </div>
          <div className="choices" role="group" aria-label="Event type">
            {EVENT_TYPES.map((t) => (
              <button key={t.id} className="choice" aria-pressed={draft.typeId === t.id} onClick={() => chooseType(t.id)}>
                <span className="ct">{t.label}</span>
                <span className="ch">{t.audience}</span>
              </button>
            ))}
          </div>
          <div className="field">
            <label>Where does it happen?</label>
            <div className="seg" role="group" aria-label="Format">
              {FORMATS.map((f) => <button key={f.id} aria-pressed={draft.format === f.id} onClick={() => set({ format: f.id })}>{f.label}</button>)}
            </div>
            <span className="hint">{FORMATS.find((f) => f.id === draft.format)?.hint}</span>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="stack-lg">
          <div className="stack" style={{ gap: 8 }}>
            <h2>The basics</h2>
            <p className="muted">Only the name is required now. Everything else can change later.</p>
          </div>
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="ev-name">Event name</label>
              <input id="ev-name" className="input" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Eastgate Family Fun Walk" />
            </div>
            <div className="field">
              <label htmlFor="ev-date">Date</label>
              <input id="ev-date" className="input" type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
              <span className="hint">Give yourself 10–12 weeks for a first in-person event.</span>
            </div>
            <div className="field">
              <label htmlFor="ev-loc">{draft.format === 'virtual' ? 'Home base (optional)' : 'Location'}</label>
              <input id="ev-loc" className="input" value={draft.location} onChange={(e) => set({ location: e.target.value })} placeholder="Park, campus, street" />
            </div>
            <div className="field">
              <label htmlFor="ev-exp">How many people do you expect?</label>
              <input id="ev-exp" className="input" type="number" min="10" value={draft.expected} onChange={(e) => set({ expected: e.target.value })} />
              <span className="hint">You will need about {volunteerNeed(draft)} volunteers.</span>
            </div>
            <div className="field">
              <label htmlFor="ev-price">Registration price ($)</label>
              <input id="ev-price" className="input" type="number" min="0" value={draft.price} onChange={(e) => set({ price: e.target.value })} />
              <span className="hint">0 makes it free. You can add a sponsored free option later.</span>
            </div>
            <div className="field full">
              <label htmlFor="ev-cause">Who benefits? (optional)</label>
              <input id="ev-cause" className="input" value={draft.cause} onChange={(e) => set({ cause: e.target.value })} placeholder="Nonprofit, fund, school or program" />
            </div>
          </div>
          <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setMoreOpen((x) => !x)} aria-expanded={moreOpen}>
            {moreOpen ? 'Hide more details' : 'Add more details'}
          </button>
          {moreOpen && (
            <div className="form-grid">
              <div className="field">
                <label htmlFor="ev-cap">Registration cap</label>
                <input id="ev-cap" className="input" type="number" min="0" value={draft.cap} onChange={(e) => set({ cap: e.target.value })} placeholder="No cap" />
              </div>
              <div className="field">
                <label>Who can join?</label>
                <div className="seg" role="group">
                  <button aria-pressed={draft.visibility === 'public'} onClick={() => set({ visibility: 'public' })}>Anyone</button>
                  <button aria-pressed={draft.visibility === 'private'} onClick={() => set({ visibility: 'private' })}>Invite only</button>
                </div>
              </div>
              <div className="field">
                <label htmlFor="ev-org">Hosting organization</label>
                <input id="ev-org" className="input" value={draft.organization} onChange={(e) => set({ organization: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="ev-contact">Organizer contact</label>
                <input id="ev-contact" className="input" value={draft.contact} onChange={(e) => set({ contact: e.target.value })} placeholder="Email or phone" />
              </div>
              <div className="field full">
                <label htmlFor="ev-desc">Describe it for participants</label>
                <textarea id="ev-desc" className="textarea" value={draft.description} onChange={(e) => set({ description: e.target.value })} placeholder="What will people experience, and why does it matter?" />
              </div>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="stack-lg">
          <div className="stack" style={{ gap: 8 }}>
            <h2>Build the participant experience</h2>
            <p className="muted">We turned on what works for a {getEventType(draft.typeId).label.toLowerCase()}{draft.fourWs.length ? ` with a ${draft.fourWs.map((w) => FOUR_WS[w].name).join(' + ')} focus` : ''}. Change anything.</p>
          </div>
          <section className="card">
            <h3 style={{ marginBottom: 4 }}>Who is joining your event, and what do they get?</h3>
            {EXPERIENCE_FEATURES.map((f) => (
              <label key={f.id} className="toggle-row" htmlFor={'feat-' + f.id}>
                <input id={'feat-' + f.id} type="checkbox" checked={draft.features.includes(f.id)} onChange={() => toggle('features', f.id)} />
                <span className="min0">
                  <span className="tt">{f.label}</span>
                  {rec.features.includes(f.id) && <span className="rec">Recommended</span>}
                  {rec.reasons[f.id] && <span className="why" style={{ display: 'block' }}>{rec.reasons[f.id]}</span>}
                </span>
              </label>
            ))}
          </section>
          {rec.programming.length > 0 && (
            <section className="card">
              <h3 style={{ marginBottom: 4 }}>4W programming</h3>
              <p className="small muted">These activities make the 4Ws real on event day.</p>
              {rec.programming.map((p) => (
                <label key={p.fourW + p.id} className="toggle-row" htmlFor={'prog-' + p.id}>
                  <input id={'prog-' + p.id} type="checkbox" checked={draft.programming.includes(p.id)} onChange={() => toggle('programming', p.id)} />
                  <span className="min0">
                    <span className="tt">{p.label}</span> <WChip id={p.fourW} />
                    <span className="why" style={{ display: 'block' }}>{p.why}</span>
                  </span>
                </label>
              ))}
            </section>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="stack-lg">
          <div className="stack" style={{ gap: 8 }}>
            <h2>Ready to generate your Blueprint</h2>
            <p className="muted">EventOS will build your plan, checklist and communication timeline.</p>
          </div>
          <section className="card stack">
            <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
              <div className="min0" style={{ flex: 1 }}>
                <div className="eyebrow">{getPurpose(draft.purpose).label}</div>
                <h3 className="display" style={{ fontSize: 34, marginTop: 4 }}>{draft.name}</h3>
                <p className="muted" style={{ marginTop: 6 }}>{getEventType(draft.typeId).label} · {FORMATS.find((f) => f.id === draft.format)?.label} · {draft.expected} people{draft.cause ? ` · Benefiting ${draft.cause}` : ''}</p>
                <div className="row" style={{ gap: 6, marginTop: 10 }}>{draft.fourWs.map((w) => <WChip key={w} id={w} />)}</div>
              </div>
              <Ring value={preview.score} label={preview.score + '%'} caption="Ready" size={92} stroke={9} tone={readinessTone(preview.score)} />
            </div>
            <hr className="lane" />
            <p className="small">Your starting checklist has <strong>{preview.items.length} items</strong>, {preview.blocking.length} of them must be done before race day. The Blueprint explains each one in plain language.</p>
            <p className="small muted">Features: {draft.features.map((id) => EXPERIENCE_FEATURES.find((f) => f.id === id)?.label).filter(Boolean).join(', ')}</p>
          </section>
        </div>
      )}

      <div className="wizard-nav">
        <button className="btn btn-secondary" onClick={() => goTo(Math.max(0, step - 1))} disabled={step === 0}><Icon name="back" size={16} /> Back</button>
        {step < STEPS.length - 1
          ? <button className="btn btn-primary" disabled={!canNext} onClick={() => goTo(step + 1)}>Continue <Icon name="arrow" size={16} /></button>
          : <button className="btn btn-primary" onClick={create}>Generate my Blueprint <Icon name="arrow" size={16} /></button>}
      </div>
    </div>
  );
}
