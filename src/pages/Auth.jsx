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

function Field({ id, label, type = 'text', value, onChange, autoComplete, hint }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input" type={type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required />
      {hint && <span className="small muted">{hint}</span>}
    </div>
  );
}

export default function Auth() {
  const { state, refresh, startDemo } = useStore();
  const signupOpen = state.server?.signupOpen !== false;
  const resetToken = hashParam('reset');
  const inviteToken = hashParam('invite');
  const [mode, setMode] = useState(resetToken ? 'reset' : inviteToken ? 'invite' : 'signin');
  const [f, setF] = useState({ email: '', password: '', name: '', organization: '' });
  const [invite, setInvite] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

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
        await api('/auth/signup', { method: 'POST', body: { email: f.email, password: f.password, name: f.name, organization: f.organization } });
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
    signup: ['Start your organization', 'Create the owner account'],
    forgot: ['Reset your password', 'We’ll email you a link'],
    reset: ['Choose a new password', 'At least 12 characters'],
    invite: ['Join your team', invite ? `${invite.organization} invited ${invite.email} as ${invite.roleLabel}` : 'Checking your invitation…'],
  };
  const [title, sub] = titles[mode];
  const submitLabel = { signin: 'Sign in', signup: 'Create organization', forgot: 'Send reset link', reset: 'Save new password', invite: 'Accept invitation' }[mode];

  return (
    <div className="auth-wrap fade-in">
      <section className="hero auth-hero">
        <BrandHero />
        <div className="eyebrow">EventOS · Developed and distributed by We Run These Streetz LLC</div>
        <h1>From idea <em>to impact</em></h1>
        <p>Plan, run, measure and repeat community events with the 4Ws and EPIC built in.</p>
      </section>

      <form className="card stack auth-card" onSubmit={submit} noValidate>
        <div>
          <div className="eyebrow">{sub}</div>
          <h2 className="display" style={{ fontSize: 30, marginTop: 4 }}>{title}</h2>
        </div>

        {mode === 'signup' && <Field id="a-org" label="Organization name" value={f.organization} onChange={set('organization')} autoComplete="organization" />}
        {(mode === 'signup' || (mode === 'invite' && invite && !invite.hasAccount)) && <Field id="a-name" label="Your name" value={f.name} onChange={set('name')} autoComplete="name" />}
        {['signin', 'signup', 'forgot'].includes(mode) && <Field id="a-email" label="Email" type="email" value={f.email} onChange={set('email')} autoComplete="email" />}
        {mode !== 'forgot' && (mode !== 'invite' || invite) && (
          <Field
            id="a-pass"
            label={mode === 'invite' && invite?.hasAccount ? 'Your existing password' : 'Password'}
            type="password"
            value={f.password}
            onChange={set('password')}
            autoComplete={mode === 'signin' || invite?.hasAccount ? 'current-password' : 'new-password'}
            hint={mode === 'signup' || mode === 'reset' || (mode === 'invite' && !invite?.hasAccount) ? 'At least 12 characters. A short phrase works well.' : undefined}
          />
        )}

        {error && <div className="warn-box small" role="alert">{error}</div>}
        {notice && <div className="info small" role="status">{notice}</div>}

        <button className="btn btn-primary" type="submit" disabled={busy || (mode === 'invite' && !invite)}>{busy ? 'Working…' : submitLabel}</button>

        <div className="row small" style={{ justifyContent: 'space-between' }}>
          {mode === 'signin' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode('forgot')}>Forgot password?</button>}
          {mode === 'signin' && signupOpen && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode('signup')}>New organization? Create one</button>}
          {mode !== 'signin' && mode !== 'invite' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { clearHash(); setMode('signin'); }}>Back to sign in</button>}
        </div>
        {mode === 'signin' && !signupOpen && <p className="small muted">New organizations join by invitation. Contact We Run These Streetz to get set up.</p>}
        {mode === 'signin' && (
          <div className="info small stack" style={{ gap: 8 }}>
            <span><strong>Just looking?</strong> Try EventOS with a sample organization and events. Nothing you do in the demo is saved to an account.</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={startDemo}>Explore the demo</button>
          </div>
        )}
      </form>
    </div>
  );
}
