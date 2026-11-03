import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { BrandLockup } from '../components/Brand.jsx';
import { formatDate } from '../components/ui.jsx';

const SHIRTS = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
const money = (n) => (n ? `$${Number(n).toFixed(2).replace(/\.00$/, '')}` : 'Free');

export default function PublicEvent({ slug }) {
  const [ev, setEv] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', zip: '', isAdult: true, guardianName: '', team: '', division: '', shirtSize: '', referral: '', donation: '', fourWInterest: [], waiver: false, consentAnalytics: true, consentMarketing: false, consentPartners: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const params = new URLSearchParams(location.search);
  const paid = params.get('registered') === '1';
  const canceled = params.get('canceled') === '1';
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    api(`/public/events/${encodeURIComponent(slug)}`)
      .then(({ event }) => {
        setEv(event);
        document.title = `${event.name} · EventOS`;
      })
      .catch((e) => setLoadError(e.status === 404 ? 'This event page isn’t available. It may not be published yet.' : e.message));
  }, [slug]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api(`/public/events/${encodeURIComponent(slug)}/register`, { method: 'POST', body: { ...f, donation: Number(f.donation) || 0 } });
      if (r.checkoutUrl) {
        location.assign(r.checkoutUrl);
        return;
      }
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const total = (ev?.price ?? 0) + (Number(f.donation) || 0);

  return (
    <div className="auth-shell">
      <div className="public-wrap">
        <header className="public-head">
          <BrandLockup variant="wordmark" />
          <span className="small muted">Powered by EventOS</span>
        </header>

        {loadError && <div className="card"><h1 className="display" style={{ fontSize: 28 }}>Event not found</h1><p className="muted">{loadError}</p></div>}
        {!ev && !loadError && <div className="card muted">Loading event…</div>}

        {ev && (
          <>
            <section className="hero" style={{ padding: 28 }}>
              <div className="eyebrow">{[ev.organization, ev.typeLabel].filter(Boolean).join(' · ')}</div>
              <h1 style={{ fontSize: 40 }}>{ev.name}</h1>
              <p>{[ev.date && formatDate(ev.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), ev.location].filter(Boolean).join(' · ')}</p>
              <div className="row" style={{ marginTop: 10 }}>
                <span className="pill neutral">{money(ev.price)}</span>
                {ev.spotsLeft != null && <span className="pill neutral">{ev.spotsLeft} spots left</span>}
                {ev.cause && <span className="pill good">Supports {ev.cause}</span>}
              </div>
            </section>

            {ev.description && <div className="card"><p style={{ whiteSpace: 'pre-wrap' }}>{ev.description}</p></div>}

            {ev.fourWs.length > 0 && (
              <div className="card stack">
                <h2 className="display" style={{ fontSize: 24 }}>More than a race</h2>
                {ev.fourWs.map((w) => <p key={w.id}><strong>{w.name}.</strong> <span className="muted">{w.prompt}</span></p>)}
                {ev.programming.length > 0 && <p className="small muted">On site: {ev.programming.join(' · ')}</p>}
              </div>
            )}

            {ev.sponsors.length > 0 && <p className="small muted">With support from {ev.sponsors.join(', ')}.</p>}

            {(done || paid) && (
              <div className="card" role="status">
                <h2 className="display" style={{ fontSize: 26 }}>You’re registered 🎉</h2>
                <p>Check your email for details. See you at {ev.name}.</p>
              </div>
            )}
            {canceled && !done && <div className="info small">Payment was canceled. Your spot isn’t held until payment is complete — you can try again below.</div>}

            {!done && !paid && !ev.registrationOpen && <div className="card"><strong>Registration is closed.</strong> <span className="muted">{ev.contact ? `Questions? ${ev.contact}` : ''}</span></div>}

            {!done && !paid && ev.registrationOpen && (
              <form className="card stack" onSubmit={submit} noValidate>
                <h2 className="display" style={{ fontSize: 26 }}>Register</h2>
                <div className="grid-2">
                  <div className="field"><label htmlFor="r-first">First name</label><input id="r-first" className="input" autoComplete="given-name" value={f.firstName} onChange={(e) => set('firstName')(e.target.value)} /></div>
                  <div className="field"><label htmlFor="r-last">Last name</label><input id="r-last" className="input" autoComplete="family-name" value={f.lastName} onChange={(e) => set('lastName')(e.target.value)} /></div>
                  <div className="field"><label htmlFor="r-email">Email</label><input id="r-email" className="input" type="email" autoComplete="email" value={f.email} onChange={(e) => set('email')(e.target.value)} /></div>
                  <div className="field"><label htmlFor="r-zip">ZIP code</label><input id="r-zip" className="input" inputMode="numeric" autoComplete="postal-code" value={f.zip} onChange={(e) => set('zip')(e.target.value)} /></div>
                  {ev.walkRun ? (
                    <div className="field"><label htmlFor="r-div">Walk or run</label><select id="r-div" className="input" value={f.division} onChange={(e) => set('division')(e.target.value)}><option value="">Choose</option><option value="walk">Walk</option><option value="run">Run</option></select></div>
                  ) : null}
                  {ev.shirts && <div className="field"><label htmlFor="r-shirt">Shirt size</label><select id="r-shirt" className="input" value={f.shirtSize} onChange={(e) => set('shirtSize')(e.target.value)}><option value="">Choose</option>{SHIRTS.map((s) => <option key={s}>{s}</option>)}</select></div>}
                  {ev.teams && <div className="field"><label htmlFor="r-team">Team (optional)</label><input id="r-team" className="input" value={f.team} onChange={(e) => set('team')(e.target.value)} /></div>}
                  <div className="field"><label htmlFor="r-ref">Who invited you? (optional)</label><input id="r-ref" className="input" value={f.referral} onChange={(e) => set('referral')(e.target.value)} /></div>
                  {ev.donations && <div className="field"><label htmlFor="r-don">Add a donation (optional)</label><input id="r-don" className="input" inputMode="decimal" placeholder="$0" value={f.donation} onChange={(e) => set('donation')(e.target.value.replace(/[^0-9.]/g, ''))} /></div>}
                </div>

                {ev.fourWs.length > 0 && (
                  <fieldset className="stack" style={{ border: 0, padding: 0, gap: 6 }}>
                    <legend className="small" style={{ fontWeight: 600, marginBottom: 6 }}>I’m interested in (optional)</legend>
                    {ev.fourWs.map((w) => (
                      <label key={w.id} className="check-row"><input type="checkbox" checked={f.fourWInterest.includes(w.id)} onChange={(e) => set('fourWInterest')(e.target.checked ? [...f.fourWInterest, w.id] : f.fourWInterest.filter((x) => x !== w.id))} />{w.name}</label>
                    ))}
                  </fieldset>
                )}

                <label className="check-row"><input type="checkbox" checked={!f.isAdult} onChange={(e) => set('isAdult')(!e.target.checked)} />This participant is under 18</label>
                {!f.isAdult && <div className="field"><label htmlFor="r-guard">Parent or guardian full name</label><input id="r-guard" className="input" value={f.guardianName} onChange={(e) => set('guardianName')(e.target.value)} /></div>}

                <div className="stack" style={{ gap: 8 }}>
                  <label className="check-row"><input type="checkbox" checked={f.waiver} onChange={(e) => set('waiver')(e.target.checked)} /><span>I accept the participant waiver and assume the risks of taking part{!f.isAdult ? ' (signed by the parent or guardian named above)' : ''}.</span></label>
                  <label className="check-row"><input type="checkbox" checked={f.consentAnalytics} onChange={(e) => set('consentAnalytics')(e.target.checked)} /><span>Count my participation in anonymous community impact reports.</span></label>
                  <label className="check-row"><input type="checkbox" checked={f.consentMarketing} onChange={(e) => set('consentMarketing')(e.target.checked)} /><span>Email me about future events from {ev.organization || 'the organizer'}.</span></label>
                  {ev.sponsors.length > 0 && <label className="check-row"><input type="checkbox" checked={f.consentPartners} onChange={(e) => set('consentPartners')(e.target.checked)} /><span>Share my contact details with event partners.</span></label>}
                </div>

                {error && <div className="warn-box small" role="alert">{error}</div>}
                <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Working…' : total > 0 ? `Continue to payment · ${money(total)}` : 'Register'}</button>
                <p className="small muted">Payments are processed securely by Stripe. EventOS never sees your card number.</p>
              </form>
            )}
          </>
        )}
        <p className="small muted" style={{ textAlign: 'center' }}>EventOS — Developed and Distributed by We Run These Streetz LLC</p>
      </div>
    </div>
  );
}
