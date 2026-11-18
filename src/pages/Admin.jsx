// WRTS admin console (platform admins only): every organization on EventOS,
// their plans and owners, and creating an organization for a customer.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { api } from '../api.js';
import { ROLES } from '../domain/access.js';
import { TIERS } from '../domain/catalog.js';
import { Card, Stat, formatDate } from '../components/ui.jsx';

const ORG_TYPES = ['Nonprofit or community group', 'Running or walking club', 'City, parks or public agency', 'School or university', 'Health system or clinic', 'Business or employer', 'Faith community', 'Other'];
const tierName = (id) => TIERS.find((t) => t.id === id)?.name.replace('EventOS ', '') ?? id;

function copy(text, toast) {
  try {
    navigator.clipboard.writeText(text);
    toast('Link copied');
  } catch {
    /* ignore */
  }
}

function SetupLink({ result, onDone }) {
  const { toast } = useStore();
  if (!result) return null;
  return (
    <div className="info stack" style={{ gap: 8 }} role="status">
      {result.emailed
        ? <span>Set-up email sent to <strong>{result.email}</strong>. They choose a password and land in {result.orgName} as the owner.</span>
        : (
          <>
            <span>Email isn’t set up on the server, so send <strong>{result.email}</strong> this one-time set-up link yourself (valid 14 days):</span>
            <code className="copy-code">{result.link}</code>
            <span className="row" style={{ gap: 6 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => copy(result.link, toast)}>Copy link</button>
              <a className="btn btn-ghost btn-sm" href={`mailto:${encodeURIComponent(result.email)}?subject=${encodeURIComponent(`Your EventOS organization is ready: ${result.orgName}`)}&body=${encodeURIComponent(`Hi,\n\nYour organization ${result.orgName} is set up on EventOS, with you as the owner. Choose your password and sign in here (the link works once and expires in 14 days):\n\n${result.link}\n\nWe Run These Streetz`)}`}>Open in email</a>
            </span>
          </>
        )}
      {onDone && <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={onDone}>Done</button>}
    </div>
  );
}

function CreateOrg({ onCreated }) {
  const [f, setF] = useState({ name: '', orgType: '', ownerName: '', ownerEmail: '', tier: 'pro' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api('/platform/orgs', { method: 'POST', body: f });
      setResult({ ...r, email: f.ownerEmail.trim().toLowerCase(), orgName: f.name.trim() });
      setF({ name: '', orgType: '', ownerName: '', ownerEmail: '', tier: f.tier });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Create an organization">
      <form className="stack" onSubmit={submit} noValidate>
        <p className="small muted" style={{ margin: 0 }}>For a customer you’re onboarding. The owner gets a one-time link to choose their password; nothing is shared in plain text.</p>
        <div className="admin-form">
          <div className="field"><label htmlFor="ad-name">Organization name</label><input id="ad-name" className="input" value={f.name} onChange={set('name')} autoComplete="off" /></div>
          <div className="field"><label htmlFor="ad-type">Type</label>
            <select id="ad-type" className="select" value={f.orgType} onChange={set('orgType')}><option value="">Choose one</option>{ORG_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          </div>
          <div className="field"><label htmlFor="ad-tier">Plan</label>
            <select id="ad-tier" className="select" value={f.tier} onChange={set('tier')}>{TIERS.map((t) => <option key={t.id} value={t.id}>{tierName(t.id)}</option>)}</select>
          </div>
          <div className="field"><label htmlFor="ad-oname">Owner’s name</label><input id="ad-oname" className="input" value={f.ownerName} onChange={set('ownerName')} autoComplete="off" /></div>
          <div className="field span-2"><label htmlFor="ad-email">Owner’s email</label><input id="ad-email" className="input" type="email" value={f.ownerEmail} onChange={set('ownerEmail')} autoComplete="off" /></div>
        </div>
        {error && <div className="warn-box small" role="alert">{error}</div>}
        <div><button className="btn btn-primary" disabled={busy || !f.name.trim() || !f.ownerEmail.trim()}>{busy ? 'Creating…' : 'Create and send set-up link'}</button></div>
        <SetupLink result={result} onDone={() => setResult(null)} />
      </form>
    </Card>
  );
}

function OrgDetail({ id, onChanged }) {
  const { toast } = useStore();
  const [data, setData] = useState(null);
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api(`/platform/orgs/${id}`).then(setData).catch((e) => setData({ error: e.message })), [id]);
  useEffect(() => { load(); }, [load]);

  const sendLink = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api(`/platform/orgs/${id}/owner-invite`, { method: 'POST', body: { email } });
      setResult({ ...r, email: email.trim().toLowerCase(), orgName: data.org.name });
      setEmail('');
      load();
      onChanged();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <p className="muted small">Loading…</p>;
  if (data.error) return <p className="muted small">{data.error}</p>;
  return (
    <div className="admin-detail stack" style={{ gap: 12 }}>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Person</th><th>Role</th><th>Since</th></tr></thead>
          <tbody>
            {data.members.map((m) => <tr key={m.id}><td><strong>{m.name || m.email}</strong>{m.name && <div className="small muted">{m.email}</div>}</td><td>{ROLES[m.role]?.label ?? m.role}</td><td className="small">{formatDate(m.joinedAt)}</td></tr>)}
            {data.invites.map((i) => <tr key={i.email + i.role}><td className="muted">{i.email}</td><td className="muted">{ROLES[i.role]?.label ?? i.role} · invited</td><td className="small muted">until {formatDate(i.expiresAt)}</td></tr>)}
            {!data.members.length && !data.invites.length && <tr><td colSpan={3} className="muted">No one yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={sendLink}>
        <div className="field" style={{ flex: 1, minWidth: 220 }}><label htmlFor={`oi-${id}`}>Send an owner set-up link</label><input id={`oi-${id}`} className="input" type="email" placeholder="owner@example.org" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <button className="btn btn-secondary btn-sm" disabled={busy || !email.trim()}>{busy ? 'Sending…' : 'Send link'}</button>
      </form>
      <SetupLink result={result} onDone={() => setResult(null)} />
    </div>
  );
}

export default function Admin() {
  const { toast } = useStore();
  const [summary, setSummary] = useState(null);
  const [orgs, setOrgs] = useState(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    api('/platform/summary').then(setSummary).catch(() => setSummary(null));
    api('/platform/orgs').then((r) => setOrgs(r.orgs)).catch((e) => setOrgs({ error: e.message }));
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    if (!Array.isArray(orgs)) return [];
    const s = q.trim().toLowerCase();
    return s ? orgs.filter((o) => [o.name, o.owners, o.pendingOwners, o.orgType].some((v) => (v || '').toLowerCase().includes(s))) : orgs;
  }, [orgs, q]);

  const setTier = (id, tier) => api(`/platform/orgs/${id}`, { method: 'PATCH', body: { tier } }).then(() => { toast('Plan updated'); load(); }).catch((e) => toast(e.message));

  return (
    <div className="stack-lg fade-in">
      <header className="page-head">
        <div className="eyebrow">We Run These Streetz · Admin</div>
        <h1>Organizations</h1>
        <p className="lede">Everyone using EventOS. Create organizations for customers, send owner set-up links and change plans.</p>
      </header>

      {summary && (
        <div className="grid-stats">
          <Stat label="Organizations" value={summary.orgs} sub={`${summary.newOrgs30d} new in 30 days`} />
          <Stat label="People with accounts" value={summary.users} />
          <Stat label="Events" value={summary.events} />
          <Stat label="Registrations" value={summary.registrations} sub={summary.signupOpen ? 'Public sign-up is open' : 'Sign-up is invitation-only'} />
        </div>
      )}

      <CreateOrg onCreated={load} />

      <Card title="All organizations" aside={<input className="input admin-search" type="search" placeholder="Search name, owner or type" aria-label="Search organizations" value={q} onChange={(e) => setQ(e.target.value)} />}>
        {!orgs ? <p className="muted">Loading…</p> : orgs.error ? <p className="muted">{orgs.error}</p> : !shown.length ? <p className="muted">No organizations match.</p> : (
          <ul className="admin-orgs">
            {shown.map((o) => (
              <li key={o.id} className={open === o.id ? 'open' : ''}>
                <div className="admin-org">
                  <button type="button" className="admin-org-main" onClick={() => setOpen(open === o.id ? null : o.id)} aria-expanded={open === o.id}>
                    <strong>{o.name}</strong>
                    <span className="small muted">
                      {o.owners || (o.pendingOwners ? `Owner invited: ${o.pendingOwners}` : 'No owner yet')}
                      {o.orgType ? ` · ${o.orgType}` : ''}
                    </span>
                  </button>
                  <span className="admin-org-nums small muted">
                    <span><b>{o.events}</b> events</span>
                    <span><b>{o.registrations}</b> registrations</span>
                    <span><b>{o.members}</b> people</span>
                    <span>since {formatDate(o.createdAt)}</span>
                  </span>
                  <select className="inline-input" aria-label={`Plan for ${o.name}`} value={o.tier} onChange={(e) => setTier(o.id, e.target.value)}>
                    {TIERS.map((t) => <option key={t.id} value={t.id}>{tierName(t.id)}</option>)}
                  </select>
                </div>
                {open === o.id && <OrgDetail id={o.id} onChanged={load} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
