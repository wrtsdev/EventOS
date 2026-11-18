import { useEffect, useState } from 'react';
import { useStore } from '../store.jsx';
import { api } from '../api.js';
import { BrandHero } from '../components/Brand.jsx';

function hashParam(name) {
  try {
    const m = (location.hash || '').match(new RegExp(`${name}=([A-Za-z0-9_-]+)`));
    return m ? m[1] : null;
  } catch {
    return null;
  }
}
function clearHash() {
  try {
    history.replaceState(null, '', location.pathname + location.search);
  } catch {
    /* ignore */
  }
}
/** /signup is the shareable address of the create-account page; everything else is sign-in. */
export function isSignupPath() {
  try {
    return /^\/signup\/?$/.test(location.pathname);
  } catch {
    return false;
  }
}
function setPath(path) {
  try {
    if (location.pathname !== path) history.replaceState(null, '', path + location.hash);
  } catch {
    /* ignore */
  }
}

const ORG_TYPES = ['Nonprofit or community group', 'Running or walking club', 'City, parks or public agency', 'School or university', 'Health system or clinic', 'Business or employer', 'Faith community', 'Other'];
const EVENTS_PER_YEAR = [['1', 'One event'], ['4', '2–5 events'], ['9', '6–12 events'], ['15', 'More than 12']];

const PITCH = [
  ['Plan with purpose', 'The Event Builder walks you through the 4Ws (Wellness, Wealth, Wisdom and Work), budget, safety and partners.'],
  ['Open registration', 'Publish an event page, take sign-ups and payments through your own Stripe account, and check people in on race day.'],
  ['Show your impact', 'EPIC readiness and impact scorecards turn every event into a story funders and partners understand.'],
  ['Bring your team', 'Invite coordinators, volunteers and partners with the right access for each role.'],
];

function Field({ id, label, type = 'text', value, onChange, autoComplete, hint, children, required = true }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children ?? <input id={id} className="input" type={type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required={required} />}
      {hint && <span className="small muted">{hint}</span>}
    </div>
  );
}

function PasswordField({ id, label, value, onChange, autoComplete, hint }) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-affix">
        <input id={id} className="input" type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required />
        <button type="button" className="affix-btn" onClick={() => setShow((s) => !s)} aria-pressed={show} aria-controls={id}>{show ? 'Hide' : 'Show'}</button>
      </div>
      {hint && <span className="small muted">{hint}</span>}
    </div>
  );
}

export default function Auth() {
  const { state, refresh, startDemo } = useStore();
  const signupOpen = state.server?.signupOpen !== false;
  const resetToken = hashParam('reset');
  const inviteToken = hashParam('invite');
  const [mode, setModeRaw] = useState(resetToken ? 'reset' : inviteToken ? 'invite' : isSignupPath() ? 'signup' : 'signin');
  const [f, setF] = useState({ email: '', password: '', name: '', organization: '', orgType: '', eventsPerYear: '1' });
  const [invite, setInvite] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const setMode = (m) => {
    setError('');
    setNotice('');
    setModeRaw(m);
    if (m === 'signup') setPath('/signup');
    else if (m === 'signin') setPath('/');
  };

  useEffect(() => {
    if (!inviteToken) return;
    api(`/auth/invite/${inviteToken}`).then(setInvite).catch((e) => setError(e.message));
  }, [inviteToken]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'signin') {
        await api('/auth/login', { method: 'POST', body: { email: f.email, password: f.password } });
        await refresh(false);
      } else if (mode === 'signup') {
        if (f.password.length < 12) throw new Error('Use a password of at least 12 characters.');
        await api('/auth/signup', { method: 'POST', body: { email: f.email, password: f.password, name: f.name, organization: f.organization, orgType: f.orgType, eventsPerYear: Number(f.eventsPerYear) } });
        setPath('/');
        await refresh(false);
      } else if (mode === 'forgot') {
        const r = await api('/auth/password/forgot', { method: 'POST', body: { email: f.email } });
        setNotice(r.message);
      } else if (mode === 'reset') {
        await api('/auth/password/reset', { method: 'POST', body: { token: resetToken, password: f.password } });
        clearHash();
        setMode('signin');
        setF((x) => ({ ...x, password: '' }));
        setNotice('Password updated. Sign in with your new password.');
      } else if (mode === 'invite') {
        await api('/auth/invite/accept', { method: 'POST', body: { token: inviteToken, password: f.password, name: f.name } });
        clearHash();
        await refresh(false);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const titles = {
    signin: ['Welcome back', 'Sign in to your organization'],
    signup: ['Create your organization', 'Free to start · about a minute'],
    forgot: ['Reset your password', 'We’ll email you a link'],
    reset: ['Choose a new password', 'At least 12 characters'],
    invite: ['Join your team', invite ? `${invite.organization} invited ${invite.email} as ${invite.roleLabel}` : 'Checking your invitation…'],
  };
  const [title, sub] = titles[mode];
  const submitLabel = { signin: 'Sign in', signup: 'Create organization', forgot: 'Send reset link', reset: 'Save new password', invite: 'Accept invitation' }[mode];
  const signupClosed = mode === 'signup' && !signupOpen;

  return (
    <div className={`auth-wrap fade-in${mode === 'signup' ? ' is-signup' : ''}`}>
      <section className="hero auth-hero">
        <BrandHero />
        <div className="eyebrow">EventOS · by We Run These Streetz</div>
        {mode === 'signup' ? (
          <>
            <h1>Run events <em>that move people</em></h1>
            <ul className="auth-pitch">
              {PITCH.map(([h, d]) => <li key={h}><strong>{h}</strong><span>{d}</span></li>)}
            </ul>
          </>
        ) : (
          <>
            <h1>From idea <em>to impact</em></h1>
            <p>Plan, run, measure and repeat community events with the 4Ws and EPIC built in.</p>
          </>
        )}
      </section>

      <div className="auth-side">
        <form className="card stack auth-card" onSubmit={submit} noValidate>
          <div>
            <div className="eyebrow">{sub}</div>
            <h2 className="display auth-title">{title}</h2>
          </div>

          {signupClosed ? (
            <p className="muted">New organizations join EventOS by invitation right now. Contact We Run These Streetz and we’ll set you up.</p>
          ) : (
            <>
              {mode === 'signup' && (
                <>
                  <Field id="a-org" label="Organization name" value={f.organization} onChange={set('organization')} autoComplete="organization" />
                  <div className="field-row">
                    <Field id="a-type" label="Type" required={false}>
                      <select id="a-type" className="select" value={f.orgType} onChange={(e) => set('orgType')(e.target.value)}>
                        <option value="">Choose one</option>
                        {ORG_TYPES.map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </Field>
                    <Field id="a-epy" label="Events a year" required={false}>
                      <select id="a-epy" className="select" value={f.eventsPerYear} onChange={(e) => set('eventsPerYear')(e.target.value)}>
                        {EVENTS_PER_YEAR.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </Field>
                  </div>
                </>
              )}
              {(mode === 'signup' || (mode === 'invite' && invite && !invite.hasAccount)) && <Field id="a-name" label="Your name" value={f.name} onChange={set('name')} autoComplete="name" />}
              {['signin', 'signup', 'forgot'].includes(mode) && <Field id="a-email" label={mode === 'signup' ? 'Work email' : 'Email'} type="email" value={f.email} onChange={set('email')} autoComplete="email" />}
              {mode !== 'forgot' && (mode !== 'invite' || invite) && (
                <PasswordField
                  id="a-pass"
                  label={mode === 'invite' && invite?.hasAccount ? 'Your existing password' : mode === 'signin' ? 'Password' : 'Create a password'}
                  value={f.password}
                  onChange={set('password')}
                  autoComplete={mode === 'signin' || invite?.hasAccount ? 'current-password' : 'new-password'}
                  hint={mode === 'signup' || mode === 'reset' || (mode === 'invite' && !invite?.hasAccount) ? 'At least 12 characters. A short phrase works well.' : undefined}
                />
              )}

              {error && <div className="warn-box small" role="alert">{error}</div>}
              {notice && <div className="info small" role="status">{notice}</div>}

              <button className="btn btn-primary btn-lg" type="submit" disabled={busy || (mode === 'invite' && !invite)}>{busy ? 'Working…' : submitLabel}</button>
              {mode === 'signup' && <p className="small muted" style={{ margin: 0 }}>You’ll be the organization owner and can invite your team after.</p>}
            </>
          )}

          <div className="auth-links small">
            {mode === 'signin' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode('forgot')}>Forgot password?</button>}
            {mode === 'signup' && <span className="muted">Already have an account? <button type="button" className="link-btn" onClick={() => setMode('signin')}>Sign in</button></span>}
            {['forgot', 'reset'].includes(mode) && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { clearHash(); setMode('signin'); }}>Back to sign in</button>}
          </div>
        </form>

        {mode === 'signin' && (
          <div className="auth-extra">
            {signupOpen ? (
              <div className="card auth-cta">
                <div>
                  <strong>New to EventOS?</strong>
                  <span className="small muted">Set up your organization in about a minute.</span>
                </div>
                <a className="btn btn-secondary" href="/signup" onClick={(e) => { e.preventDefault(); setMode('signup'); }}>Create an account</a>
              </div>
            ) : (
              <p className="small muted">New organizations join by invitation. Contact We Run These Streetz to get set up.</p>
            )}
            <div className="auth-demo small">
              <span><strong>Just looking?</strong> Try a sample organization. Nothing you do in the demo is saved.</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={startDemo}>Explore the demo →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
