import { useStore } from '../../store.jsx';
import { getEventType } from '../../domain/catalog.js';
import { FOUR_WS } from '../../domain/fourW.js';
import { formatMoney } from '../../domain/metrics.js';
import { WChip, formatDate, Progress } from '../../components/ui.jsx';

export default function EventPage({ event, sim }) {
  const { dispatch } = useStore();
  const type = getEventType(event.typeId);
  const ws = event.fourWs ?? [];
  const prog = (event.programming ?? [])
    .map((id) => Object.values(FOUR_WS).flatMap((w) => w.programming.map((p) => ({ ...p, fourW: w.id }))).find((p) => p.id === id))
    .filter(Boolean);
  const open = event.phase === 'live';
  const spotsLeft = Math.max(0, sim.goal - sim.registered);

  return (
    <div className="stack-lg">
      <div className="info small">This is what participants see. It is mobile-first and can be published as a public page or embedded on your site.</div>
      <article style={{ maxWidth: 640, width: '100%', margin: '0 auto', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', overflow: 'hidden', background: 'var(--surface)' }}>
        <div className="hero" style={{ borderRadius: 0 }}>
          <div className="eyebrow">{event.organization} presents</div>
          <h1 style={{ fontSize: 'clamp(38px, 9vw, 60px)' }}>{event.name}</h1>
          <p>{formatDate(event.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}<br />{event.location || 'Location announced soon'}</p>
          <div style={{ height: 30 }} />
        </div>
        <div className="stack-lg" style={{ padding: 20 }}>
          <div className="stack" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 6 }}>{ws.map((w) => <WChip key={w} id={w} />)}<span className="pill neutral plain">{type.label}</span></div>
            <p style={{ fontSize: 16 }}>{event.description || 'Join neighbors for a walk and run that moves our community forward.'}</p>
          </div>

          {open && (
            <div className="stack" style={{ gap: 8 }}>
              <div className="spread small"><strong>{sim.registered} registered</strong><span className="muted">{spotsLeft} spots left</span></div>
              <Progress value={sim.registered / sim.goal} />
            </div>
          )}

          <div className="row">
            <button className="btn btn-primary" disabled={event.phase === 'complete'} onClick={() => dispatch({ type: 'toast', message: 'Prototype: registration would open in your registration provider' })}>
              {event.phase === 'complete' ? 'This event has happened' : `Register · ${Number(event.price) ? formatMoney(event.price) : 'Free'}`}
            </button>
            <button className="btn btn-secondary" onClick={() => dispatch({ type: 'toast', message: 'Passport sign-in would prefill your details (prototype)' })}>Join with your WRTS Passport</button>
          </div>

          {ws.length > 0 && (
            <section className="stack" style={{ gap: 10 }}>
              <h3 className="display" style={{ fontSize: 26 }}>Why we are gathering</h3>
              {ws.map((w) => (
                <div key={w} className="quote"><strong>{FOUR_WS[w].prompt}</strong><div className="small muted" style={{ marginTop: 4 }}>{FOUR_WS[w].goal}</div></div>
              ))}
            </section>
          )}

          {prog.length > 0 && (
            <section className="stack" style={{ gap: 10 }}>
              <h3 className="display" style={{ fontSize: 26 }}>What to expect</h3>
              <ul className="bullets">{prog.map((p) => <li key={p.id}><strong>{p.label}.</strong> <span className="muted">{p.why}</span></li>)}</ul>
            </section>
          )}

          {event.cause && (
            <section className="stack" style={{ gap: 6 }}>
              <h3 className="display" style={{ fontSize: 26 }}>Who benefits</h3>
              <p><strong>{event.cause}</strong>. Add a donation when you register or start a team fundraising page.</p>
            </section>
          )}

          {sim.sponsors.length > 0 && (
            <section className="stack" style={{ gap: 8 }}>
              <div className="eyebrow">Made possible by</div>
              <div className="row" style={{ gap: 8 }}>{sim.sponsors.map((s) => <span key={s.id} className="pill neutral plain">{s.name}</span>)}</div>
            </section>
          )}

          <p className="small muted">Questions? {event.contact || 'Contact the organizer'} · Your data is used only for this event and the follow-ups you choose. Manage your choices in your Passport.</p>
        </div>
      </article>
    </div>
  );
}
