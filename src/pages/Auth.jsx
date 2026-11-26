// Sign-in, account requests, email confirmation and two-step sign-in.
// Proprietary and confidential. © We Run These Streetz LLC.

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
/** /signup (and /request-access) is the shareable address of the account request page. */
export function isSignupPath() {
  try {
    return /^\/(signup|request-access)\/?$/.test(location.pathname);
  } catch {
    return false;
  }
}
function setPath(path) {
  try {
    if (location.pathname !== path) history.replaceState(null, '', path + location.search + location.hash);
  } catch {
    /* ignore */
  }
}

const ORG_TYPES = ['Nonprofit or community group', 'Running or walking club', 'City, county or public agency', 'School or school district', 'College or university', 'Employer or business', 'Health system or clinic', 'Faith community', 'Government entity', 'WRTS-operated program', 'Individual (no organization)', 'Other'];
const REQUESTED_ROLES = [
  ['org_admin', 'Organization owner or administrator'],
  ['coordinator', 'Event or program coordinator'],
  ['partner', 'Partner or sponsor'],
  ['employer', 'Employer'],
  ['educator', 'Educator or facilitator'],
  ['other', 'Other'],
];
const PILLARS = [['wealth', 'Wealth'], ['wellness', 'Wellness'], ['wisdom', 'Wisdom'], ['work', 'Work']];

const PITCH = [
  ['Plan with purpose', 'Design community experiences across the 4Ws: Wealth, Wellness, Wisdom and Work.'],
  ['Open registration', 'Publish event pages, take sign-ups and payments through your own Stripe account, and check people in.'],
  ['Show your impact', 'EPIC readiness and impact scorecards built from your real event records.'],
  ['Approved accounts', 'Every EventOS account is reviewed by We Run These Streetz before first sign-in.'],
];

function Field({ id, label, type = 'text', value, onChange, autoComplete, hint, children, optional = false }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}{optional && <span className="muted small"> (optional)</span>}</label>
      {children ?? <input id={id} className="input" type={type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required={!optional} />}
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

const EMPTY = { email: '', password: '', name: '', firstName: '', lastName: '', organizationName: '', organizationType: '', requestedRole: '', intendedUse: '', primaryPillar: '', phone: '', website: '', acceptTerms: false, code: '', response: '' };

export default function Auth() {
  const { state, refresh, startDemo } = useStore();
  const demoEnabled = state.server?.demo === true;
  const resetToken = hashParam('reset');
  const inviteToken = hashParam('invite');
  const verifyToken = hashParam('verify');
  const infoToken = hashParam('info');
  const initial = verifyToken ? 'verify' : infoToken ? 'info' : resetToken ? 'reset' : inviteToken ? 'invite' : isSignupPath() ? 'request' : 'signin';
  const [mode, setModeRaw] = useState(initial);
  const [f, setF] = useState(EMPTY);
  const [invite, setInvite] = useState(null);
  const [question, setQuestion] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const setMode = (m) => {
    setError('');
    setNotice('');
    setModeRaw(m);
    if (m === 'request') setPath('/signup');
    else if (m === 'signin') setPath('/');
  };

  useEffect(() => {
    if (inviteToken) api(`/auth/invite/${inviteToken}`).then(setInvite).catch((e) => setError(e.message));
    if (infoToken) api(`/auth/request-info/${infoToken}`).then(setQuestion).catch((e) => setError(e.message));
    if (verifyToken) {
      setBusy(true);
      api('/auth/verify', { method: 'POST', body: { token: verifyToken } })
        .then((r) => {
          clearHash();
          setModeRaw(r.status === 'master' ? 'verified-master' : r.status === 'active' ? 'signin' : 'verified');
        })
        .catch((e) => setError(e.message))
        .finally(() => setBusy(false));
    }
  }, [inviteToken, infoToken, verifyToken]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'signin') {
        const r = await api('/auth/login', { method: 'POST', body: { email: f.email, password: f.password } });
        if (r.mfaRequired) {
          setTicket(r.ticket);
          setModeRaw('mfa');
          setF((x) => ({ ...x, code: '' }));
          return;
        }
        await refresh(false);
      } else if (mode === 'mfa') {
        await api('/auth/mfa/verify', { method: 'POST', body: { ticket, code: f.code.trim() } });
        await refresh(false);
      } else if (mode === 'request') {
        if (f.password.length < 12) throw new Error('Choose a password of at least 12 characters.');
        if (!f.acceptTerms) throw new Error('Accept the terms of use and privacy notice to continue.');
        await api('/auth/request', { method: 'POST', body: { ...f, email: f.email.trim() } });
        setModeRaw('requested');
      } else if (mode === 'info') {
        await api('/auth/request-info', { method: 'POST', body: { token: infoToken, response: f.response } });
        clearHash();
        setModeRaw('info-sent');
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
        const r = await api('/auth/invite/accept', { method: 'POST', body: { token: inviteToken, password: f.password, name: f.name } });
        clearHash();
        if (r.pending) setModeRaw('invite-pending');
        else await refresh(false);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const titles = {
    signin: ['Welcome back', 'Sign in to EventOS'],
    mfa: ['Two-step verification', 'Enter the code from your authenticator app'],
    request: ['Request access', 'Accounts are approved by We Run These Streetz'],
    requested: ['Check your email', 'One more step'],
    verify: ['Confirming your email', 'One moment'],
    verified: ['Request received', 'Email confirmed'],
    'verified-master': ['You’re the master administrator', 'Email confirmed'],
    info: ['Answer a question', 'About your account request'],
    'info-sent': ['Thanks, we got it', 'Your request is back in review'],
    forgot: ['Reset your password', 'We’ll email you a link'],
    reset: ['Choose a new password', 'At least 12 characters'],
    invite: ['Join your team', invite ? `${invite.organization} invited ${invite.email} as ${invite.roleLabel}` : 'Checking your invitation…'],
    'invite-pending': ['Almost there', 'Your account is waiting for approval'],
  };
  const [title, sub] = titles[mode];
  const submitLabel = { signin: 'Sign in', mfa: 'Verify', request: 'Submit request', info: 'Send answer', forgot: 'Send reset link', reset: 'Save new password', invite: 'Accept invitation' }[mode];
  const message = {
    requested: <>We sent a confirmation link to <strong>{f.email}</strong>. Open it to send your request for review. The link works for 24 hours.</>,
    verified: <>Thanks for confirming your email. We Run These Streetz will review your request, and we’ll email you when you can sign in. You can close this page.</>,
    'verified-master': <>Your email is confirmed and your account is the EventOS master administrator. Sign in, then set up two-step verification to open the admin center.</>,
    'info-sent': <>Your answer was added to your request. We’ll email you when it’s reviewed.</>,
    'invite-pending': <>Your account was created. New EventOS accounts are approved by We Run These Streetz; we’ll email you when you can sign in.</>,
    verify: busy ? <>Checking your link…</> : null,
  }[mode];

  return (
    <div className={`auth-wrap fade-in${mode === 'request' ? ' is-signup' : ''}`}>
      <section className="hero auth-hero">
        <BrandHero />
        <div className="eyebrow">EventOS · by We Run These Streetz</div>
        {mode === 'request' ? (
          <>
            <h1>Activate <em>your community</em></h1>
            <ul className="auth-pitch">
              {PITCH.map(([h, d]) => <li key={h}><strong>{h}</strong><span>{d}</span></li>)}
            </ul>
          </>
        ) : (
          <>
            <h1>From idea <em>to impact</em></h1>
            <p>Plan, run, measure and repeat community experiences across Wealth, Wellness, Wisdom and Work.</p>
          </>
        )}
      </section>

      <div className="auth-side">
        <form className="card stack auth-card" onSubmit={submit} noValidate>
          <div>
            <div className="eyebrow">{sub}</div>
            <h2 className="display auth-title">{title}</h2>
          </div>

          {message ? (
            <p style={{ margin: 0 }}>{message}</p>
          ) : (
            <>
              {mode === 'request' && (
                <>
                  <div className="field-row">
                    <Field id="r-first" label="First name" value={f.firstName} onChange={set('firstName')} autoComplete="given-name" />
                    <Field id="r-last" label="Last name" value={f.lastName} onChange={set('lastName')} autoComplete="family-name" />
                  </div>
                  <Field id="a-email" label="Work email" type="email" value={f.email} onChange={set('email')} autoComplete="email" hint="We’ll send a link to confirm it." />
                  <PasswordField id="a-pass" label="Create a password" value={f.password} onChange={set('password')} autoComplete="new-password" hint="At least 12 characters. A short phrase works well." />
                  <Field id="r-org" label="Organization name" value={f.organizationName} onChange={set('organizationName')} autoComplete="organization" optional />
                  <div className="field-row">
                    <Field id="r-type" label="Organization type">
                      <select id="r-type" className="select" value={f.organizationType} onChange={(e) => set('organizationType')(e.target.value)} required>
                        <option value="">Choose one</option>
                        {ORG_TYPES.map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </Field>
                    <Field id="r-role" label="Account you need">
                      <select id="r-role" className="select" value={f.requestedRole} onChange={(e) => set('requestedRole')(e.target.value)} required>
                        <option value="">Choose one</option>
                        {REQUESTED_ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </Field>
                  </div>
                  <fieldset className="field pillar-pick">
                    <legend>WRTS pillar you’re most interested in</legend>
                    <div className="row" style={{ gap: 8 }}>
                      {PILLARS.map(([v, l]) => (
                        <label key={v} className={`chip-radio${f.primaryPillar === v ? ' on' : ''}`}>
                          <input type="radio" name="pillar" value={v} checked={f.primaryPillar === v} onChange={() => set('primaryPillar')(v)} />
                          {l}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <Field id="r-use" label="How will you use EventOS?">
                    <textarea id="r-use" className="textarea" rows={3} value={f.intendedUse} onChange={(e) => set('intendedUse')(e.target.value)} required placeholder="For example: a spring 5K, a monthly financial literacy workshop, a summer career fair." />
                  </Field>
                  <div className="field-row">
                    <Field id="r-phone" label="Phone" type="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" optional />
                    <Field id="r-web" label="Website" type="url" value={f.website} onChange={set('website')} autoComplete="url" optional />
                  </div>
                  <label className="check-row">
                    <input type="checkbox" checked={f.acceptTerms} onChange={(e) => set('acceptTerms')(e.target.checked)} />
                    <span>I agree to the EventOS terms of use and privacy notice, and to receive emails about this account request. This isn’t a marketing subscription.</span>
                  </label>
                </>
              )}
              {mode === 'info' && (
                <>
                  {question && <div className="info small"><strong>Question from We Run These Streetz:</strong><br />{question.question}</div>}
                  <Field id="i-resp" label="Your answer">
                    <textarea id="i-resp" className="textarea" rows={4} value={f.response} onChange={(e) => set('response')(e.target.value)} required />
                  </Field>
                </>
              )}
              {mode === 'invite' && invite && !invite.hasAccount && <Field id="a-name" label="Your name" value={f.name} onChange={set('name')} autoComplete="name" />}
              {['signin', 'forgot'].includes(mode) && <Field id="a-email" label="Email" type="email" value={f.email} onChange={set('email')} autoComplete="email" />}
              {(mode === 'signin' || mode === 'reset' || (mode === 'invite' && invite)) && (
                <PasswordField
                  id="a-pass"
                  label={mode === 'invite' && invite?.hasAccount ? 'Your existing password' : 'Password'}
                  value={f.password}
                  onChange={set('password')}
                  autoComplete={mode === 'signin' || invite?.hasAccount ? 'current-password' : 'new-password'}
                  hint={mode === 'reset' || (mode === 'invite' && !invite?.hasAccount) ? 'At least 12 characters. A short phrase works well.' : undefined}
                />
              )}
              {mode === 'mfa' && (
                <Field id="a-code" label="6-digit code" value={f.code} onChange={set('code')} autoComplete="one-time-code" hint="Lost your phone? Enter one of your recovery codes instead.">
                  <input id="a-code" className="input otp-input" inputMode="numeric" autoComplete="one-time-code" value={f.code} onChange={(e) => set('code')(e.target.value)} required autoFocus />
                </Field>
              )}

              {error && <div className="warn-box small" role="alert">{error}</div>}
              {notice && <div className="info small" role="status">{notice}</div>}

              <button className="btn btn-primary btn-lg" type="submit" disabled={busy || (mode === 'invite' && !invite) || (mode === 'info' && !question)}>{busy ? 'Working…' : submitLabel}</button>
            </>
          )}
          {message && error && <div className="warn-box small" role="alert">{error}</div>}

          <div className="auth-links small">
            {mode === 'signin' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode('forgot')}>Forgot password?</button>}
            {mode === 'request' && <span className="muted">Already approved? <button type="button" className="link-btn" onClick={() => setMode('signin')}>Sign in</button></span>}
            {['forgot', 'reset', 'mfa', 'requested', 'verified', 'verified-master', 'info-sent', 'invite-pending', 'verify'].includes(mode) && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { clearHash(); setMode('signin'); }}>{mode === 'verified-master' ? 'Sign in' : 'Back to sign in'}</button>}
          </div>
        </form>

        {mode === 'signin' && (
          <div className="auth-extra">
            <div className="card auth-cta">
              <div>
                <strong>New to EventOS?</strong>
                <span className="small muted">Request an account. We Run These Streetz reviews every request.</span>
              </div>
              <a className="btn btn-secondary" href="/signup" onClick={(e) => { e.preventDefault(); setMode('request'); }}>Request access</a>
            </div>
            {demoEnabled && (
              <div className="auth-demo small">
                <span><strong>Just looking?</strong> Try a sample organization. Nothing you do in the demo is saved.</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={startDemo}>Explore the demo →</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
