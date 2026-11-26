// WRTS Master Administration Center (platform administrators only).
// Every number here comes from the database; nothing is estimated or sample data.
// Proprietary and confidential. © We Run These Streetz LLC.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { api } from '../api.js';
import { ROLES } from '../domain/access.js';
import { Card, Stat, formatDate } from '../components/ui.jsx';
import Organizations from './admin/Organizations.jsx';

const STATE_LABELS = {
  unverified: 'Unverified', pending_approval: 'Pending approval', info_required: 'Info requested', approved: 'Approved',
  active: 'Active', suspended: 'Suspended', denied: 'Denied', deactivated: 'Deactivated', archived: 'Archived',
};
const STATE_TONE = { active: 'good', approved: 'good', pending_approval: 'warn', info_required: 'warn', unverified: 'neutral', suspended: 'bad', denied: 'bad', deactivated: 'neutral', archived: 'neutral' };
const SOURCE_LABEL = { request: 'Access request', invite: 'Organization invite', legacy: 'Existing account (review)' };
const ROLE_REQ = { org_admin: 'Organization owner or administrator', coordinator: 'Event or program coordinator', partner: 'Partner or sponsor', employer: 'Employer', educator: 'Educator or facilitator', other: 'Other' };
const when = (d) => (d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const StatusPill = ({ s }) => <span className={`pill ${STATE_TONE[s] ?? 'neutral'}`}>{STATE_LABELS[s] ?? s}</span>;

// ---------------------------------------------------------------------------
// Two-step verification setup (required before the admin center opens)
// ---------------------------------------------------------------------------

function MfaSetup({ onDone }) {
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setError('');
    try {
      setSetup(await api('/auth/mfa/setup', { method: 'POST', body: {} }));
    } catch (e) {
      setError(e.message);
    }
  };
  const enable = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api('/auth/mfa/enable', { method: 'POST', body: { code: code.trim() } });
      setCodes(r.recoveryCodes);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const download = () => {
    const blob = new Blob([`EventOS recovery codes\nEach code works once. Keep them somewhere safe.\n\n${codes.join('\n')}\n`], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'eventos-recovery-codes.txt';
    a.click();
  };

  if (codes) {
    return (
      <Card title="Save your recovery codes">
        <div className="stack">
          <p style={{ margin: 0 }}>If you lose your phone, each of these codes signs you in once instead of an authenticator code. <strong>This is the only time they’re shown.</strong></p>
          <ul className="recovery-codes">{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
          <div className="row">
            <button type="button" className="btn btn-secondary" onClick={download}>Download codes</button>
            <button type="button" className="btn btn-primary" onClick={onDone}>I’ve saved them, open the admin center</button>
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card title="Turn on two-step verification">
      <div className="stack">
        <p style={{ margin: 0 }}>The admin center needs two-step verification. You’ll enter a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy) each time you sign in.</p>
        {!setup ? (
          <div><button type="button" className="btn btn-primary" onClick={start}>Set it up</button></div>
        ) : (
          <form className="mfa-setup" onSubmit={enable}>
            <img className="mfa-qr" alt="QR code to add EventOS to your authenticator app" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(setup.qrSvg)}`} width={180} height={180} />
            <div className="stack" style={{ gap: 10 }}>
              <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
                <li>In your authenticator app, add an account and scan this code.</li>
                <li>On this phone? <a href={setup.otpauthUrl}>Open in authenticator app</a>, or enter the key: <code className="mfa-key">{setup.secret.match(/.{1,4}/g).join(' ')}</code></li>
                <li>Enter the 6-digit code the app shows.</li>
              </ol>
              <div className="field" style={{ maxWidth: 220 }}>
                <label htmlFor="mfa-code">6-digit code</label>
                <input id="mfa-code" className="input otp-input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
              <div><button className="btn btn-primary" disabled={busy || code.trim().length < 6}>{busy ? 'Checking…' : 'Turn on'}</button></div>
            </div>
          </form>
        )}
        {error && <div className="warn-box small" role="alert">{error}</div>}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function Overview({ summary, go }) {
  if (!summary) return <p className="muted">Loading…</p>;
  const attention = [
    summary.pendingRequests > 0 && [`${summary.pendingRequests} account request${summary.pendingRequests === 1 ? '' : 's'} waiting for review`, 'requests'],
    summary.infoRequired > 0 && [`${summary.infoRequired} request${summary.infoRequired === 1 ? '' : 's'} waiting on the applicant’s answer`, 'requests'],
    !summary.emailConfigured && ['Email isn’t configured on the server, so notifications are queued but not sent (add the SMTP settings in hPanel)', 'emails'],
    summary.emailFailed > 0 && [`${summary.emailFailed} email${summary.emailFailed === 1 ? '' : 's'} failed after all retries`, 'emails'],
    summary.failedSignIns24h > 0 && [`${summary.failedSignIns24h} failed sign-in attempt${summary.failedSignIns24h === 1 ? '' : 's'} in the last 24 hours`, 'activity'],
    summary.demoEnabled && ['The sample-data demo is turned on for this server (DEMO_ENABLED)', null],
  ].filter(Boolean);
  return (
    <div className="stack-lg">
      <div className="grid-stats">
        <Stat label="Pending requests" value={summary.pendingRequests} sub={summary.infoRequired ? `${summary.infoRequired} awaiting applicant` : 'Account requests'} />
        <Stat label="Active accounts" value={summary.activeAccounts} sub={`${summary.suspendedAccounts} suspended · ${summary.users} total`} />
        <Stat label="Organizations" value={summary.orgs} sub={`${summary.newOrgs30d} new in 30 days`} />
        <Stat label="Events" value={summary.events} sub={`${summary.publishedEvents} published`} />
        <Stat label="Registrations" value={summary.registrations} />
        <Stat label="Email queue" value={summary.emailQueued} sub={`${summary.emailFailed} failed`} />
      </div>
      <Card title="Needs attention">
        {!attention.length ? <p className="muted" style={{ margin: 0 }}>Nothing needs attention right now.</p> : (
          <ul className="list-plain admin-attention">
            {attention.map(([text, tab]) => (
              <li key={text}>
                <span>{text}</span>
                {tab && <button type="button" className="btn btn-ghost btn-sm" onClick={() => go(tab)}>Open</button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Account requests
// ---------------------------------------------------------------------------

function RequestDetail({ id, isMaster, orgs, onChanged, onClose }) {
  const { toast } = useStore();
  const [d, setD] = useState(null);
  const [orgMode, setOrgMode] = useState('new');
  const [orgId, setOrgId] = useState('');
  const [orgName, setOrgName] = useState('');
  const [role, setRole] = useState('owner');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api(`/platform/requests/${id}`).then((r) => {
    setD(r);
    setOrgName(r.request.organizationName || '');
    if (r.request.inviteOrganization) {
      setOrgMode('existing');
      setOrgId(r.request.inviteOrganization.id);
      setRole(r.request.inviteRole || 'coordinator');
    }
  }).catch((e) => setD({ error: e.message })), [id]);
  useEffect(() => { load(); }, [load]);

  const act = async (path, body, done) => {
    setBusy(true);
    try {
      await api(`/platform/requests/${id}/${path}`, { method: 'POST', body });
      toast(done);
      onChanged();
      load();
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!d) return <p className="muted">Loading…</p>;
  if (d.error) return <p className="muted">{d.error}</p>;
  const r = d.request;
  const open = ['pending_approval', 'info_required'].includes(r.status);
  const legacy = r.source === 'legacy';
  return (
    <div className="stack admin-request">
      <div className="spread">
        <div>
          <h3 style={{ margin: 0 }}>{[r.firstName, r.lastName].filter(Boolean).join(' ') || r.email}</h3>
          <div className="small muted">{r.email} · {SOURCE_LABEL[r.source]} · submitted {when(r.submittedAt)}</div>
        </div>
        <span className="row" style={{ gap: 8 }}><StatusPill s={r.status} /><button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Close</button></span>
      </div>
      <dl className="admin-dl">
        <dt>Organization</dt><dd>{r.organizationName || '—'}{r.organizationType ? ` · ${r.organizationType}` : ''}</dd>
        <dt>Account needed</dt><dd>{ROLE_REQ[r.requestedRole] ?? r.requestedRole ?? '—'}</dd>
        <dt>Pillar of interest</dt><dd style={{ textTransform: 'capitalize' }}>{r.primaryPillar || '—'}</dd>
        <dt>Intended use</dt><dd>{r.intendedUse || '—'}</dd>
        {(r.phone || r.website) && <><dt>Contact</dt><dd>{[r.phone, r.website].filter(Boolean).join(' · ')}</dd></>}
        {r.inviteOrganization && <><dt>Invited to</dt><dd>{r.inviteOrganization.name} as {ROLES[r.inviteRole]?.label}</dd></>}
        <dt>Email confirmed</dt><dd>{d.user?.emailVerifiedAt ? when(d.user.emailVerifiedAt) : 'No'}</dd>
        <dt>Terms accepted</dt><dd>{r.termsAcceptedAt ? `${when(r.termsAcceptedAt)} (${r.termsVersion})` : legacy ? 'Before account approvals' : '—'}</dd>
        {d.memberships.length > 0 && <><dt>Current organizations</dt><dd>{d.memberships.map((m) => `${m.name} (${ROLES[m.role]?.label ?? m.role})`).join(', ')}</dd></>}
        {r.infoRequestNote && <><dt>Your question</dt><dd>{r.infoRequestNote}</dd></>}
        {r.applicantResponse && <><dt>Their answer</dt><dd>{r.applicantResponse}</dd></>}
        {r.decisionNote && <><dt>Decision note</dt><dd>{r.decisionNote}</dd></>}
      </dl>

      {open && !isMaster && <p className="small muted">Only the master administrator can approve or deny requests.</p>}
      {open && isMaster && (
        <div className="admin-decide stack">
          {!legacy && (
            <div className="admin-form">
              <div className="field"><label htmlFor="ap-mode">Organization</label>
                <select id="ap-mode" className="select" value={orgMode} onChange={(e) => setOrgMode(e.target.value)}>
                  <option value="new">Create a new organization</option>
                  <option value="existing">Add to an existing organization</option>
                </select>
              </div>
              {orgMode === 'new'
                ? <div className="field"><label htmlFor="ap-name">New organization name</label><input id="ap-name" className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} /></div>
                : <div className="field"><label htmlFor="ap-org">Existing organization</label>
                    <select id="ap-org" className="select" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
                      <option value="">Choose one</option>
                      {(orgs || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>}
              <div className="field"><label htmlFor="ap-role">Role</label>
                <select id="ap-role" className="select" value={role} onChange={(e) => setRole(e.target.value)}>
                  {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
          )}
          <div className="field"><label htmlFor="ap-note">Note <span className="muted small">(optional for approval; sent with a denial or question)</span></label>
            <textarea id="ap-note" className="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-primary" disabled={busy || (!legacy && orgMode === 'new' && !orgName.trim()) || (!legacy && orgMode === 'existing' && !orgId)}
              onClick={() => act('approve', legacy ? { note } : { organization: orgMode === 'new' ? { mode: 'new', name: orgName } : { mode: 'existing', id: orgId }, role, note }, 'Approved. The applicant was emailed.')}>
              {legacy ? 'Restore access' : 'Approve'}
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy || !note.trim()} onClick={() => act('request-info', { note }, 'Question sent')}>Ask for more information</button>
            <button type="button" className="btn btn-ghost danger" disabled={busy} onClick={() => { if (window.confirm(`Deny ${r.email}? They won’t be able to sign in.`)) act('deny', { note }, 'Request denied'); }}>Deny</button>
          </div>
          <p className="small muted" style={{ margin: 0 }}>Approving never grants WRTS administrator rights. {legacy ? 'This account keeps its existing organizations and roles.' : 'The applicant signs in with the password they chose.'}</p>
        </div>
      )}

      <details className="small">
        <summary>History ({d.history.length})</summary>
        <ul className="list-plain">{d.history.map((h, i) => <li key={i}>{when(h.at)} · {h.action}</li>)}</ul>
      </details>
    </div>
  );
}

function Requests({ isMaster, initialId, onChanged }) {
  const [filter, setFilter] = useState('open');
  const [rows, setRows] = useState(null);
  const [orgs, setOrgs] = useState(null);
  const [sel, setSel] = useState(initialId || null);
  const load = useCallback(() => api(`/platform/requests?status=${filter}`).then((r) => setRows(r.requests)).catch((e) => setRows({ error: e.message })), [filter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api('/platform/orgs').then((r) => setOrgs(r.orgs)).catch(() => setOrgs([])); }, []);
  const changed = () => { load(); onChanged(); };

  return (
    <div className="stack-lg">
      {sel && <Card><RequestDetail id={sel} isMaster={isMaster} orgs={orgs} onChanged={changed} onClose={() => setSel(null)} /></Card>}
      <Card title="Account requests" aside={
        <select className="inline-input" aria-label="Show requests" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="open">Waiting for review</option><option value="approved">Approved</option><option value="denied">Denied</option><option value="unverified">Email not confirmed</option><option value="all">All</option>
        </select>}>
        {!rows ? <p className="muted">Loading…</p> : rows.error ? <p className="muted">{rows.error}</p> : !rows.length ? <p className="muted" style={{ margin: 0 }}>No requests here.</p> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Applicant</th><th>Organization</th><th>Pillar</th><th>Submitted</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((q) => (
                  <tr key={q.id} className={`clickable${sel === q.id ? ' selected' : ''}`} onClick={() => setSel(q.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setSel(q.id); }}>
                    <td><strong>{[q.firstName, q.lastName].filter(Boolean).join(' ') || q.email}</strong><div className="small muted">{q.email}{q.source !== 'request' ? ` · ${SOURCE_LABEL[q.source]}` : ''}</div></td>
                    <td>{q.organizationName || '—'}<div className="small muted">{q.organizationType}</div></td>
                    <td style={{ textTransform: 'capitalize' }}>{q.primaryPillar || '—'}</td>
                    <td className="small">{when(q.submittedAt || q.createdAt)}</td>
                    <td><StatusPill s={q.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

function Accounts({ isMaster, meId }) {
  const { toast } = useStore();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState(null);
  const load = useCallback(() => api(`/platform/accounts?q=${encodeURIComponent(q)}&status=${status}`).then((r) => setRows(r.accounts)).catch((e) => setRows({ error: e.message })), [q, status]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const call = async (a, path, body, done, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    try {
      await api(`/platform/accounts/${a.id}/${path}`, { method: 'POST', body });
      toast(done);
      load();
    } catch (e) {
      toast(e.message);
    }
  };
  const changeStatus = (a, s) => {
    const reason = s === 'active' ? '' : window.prompt(`Reason for ${s === 'suspended' ? 'suspending' : s === 'deactivated' ? 'deactivating' : 'archiving'} ${a.email} (kept in the audit log):`);
    if (reason === null) return;
    call(a, 'status', { status: s, reason }, `Account ${STATE_LABELS[s].toLowerCase()}`);
  };

  return (
    <Card title="Accounts" aside={
      <span className="row" style={{ gap: 8 }}>
        <input className="input admin-search" type="search" placeholder="Search name or email" aria-label="Search accounts" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="inline-input" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>{Object.entries(STATE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </span>}>
      {!rows ? <p className="muted">Loading…</p> : rows.error ? <p className="muted">{rows.error}</p> : !rows.length ? <p className="muted" style={{ margin: 0 }}>No accounts match.</p> : (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Person</th><th>Status</th><th>Organizations</th><th>Last sign-in</th><th /></tr></thead>
            <tbody>
              {rows.map((a) => {
                const locked = a.isMaster || (a.isPlatformAdmin && !isMaster) || a.id === meId;
                return (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.name || a.email}</strong>{a.isMaster && <span className="pill good" style={{ marginLeft: 6 }}>Master</span>}{!a.isMaster && a.isPlatformAdmin && <span className="pill neutral" style={{ marginLeft: 6 }}>WRTS admin</span>}
                      <div className="small muted">{a.email}{a.mfaEnabled ? ' · two-step on' : ''}</div>
                    </td>
                    <td><StatusPill s={a.status} />{a.statusReason && <div className="small muted">{a.statusReason}</div>}</td>
                    <td className="small">{a.organizations || '—'}</td>
                    <td className="small">{when(a.lastLoginAt)}{a.activeSessions ? <div className="muted">{a.activeSessions} active session{a.activeSessions === 1 ? '' : 's'}</div> : null}</td>
                    <td className="r">
                      {!locked && (
                        <span className="row admin-actions">
                          {a.status === 'active' && <button className="btn btn-ghost btn-sm" onClick={() => changeStatus(a, 'suspended')}>Suspend</button>}
                          {['suspended', 'deactivated', 'archived'].includes(a.status) && <button className="btn btn-ghost btn-sm" onClick={() => changeStatus(a, 'active')}>Reactivate</button>}
                          {['active', 'suspended'].includes(a.status) && <button className="btn btn-ghost btn-sm" onClick={() => changeStatus(a, 'deactivated')}>Deactivate</button>}
                          {a.activeSessions > 0 && <button className="btn btn-ghost btn-sm" onClick={() => call(a, 'sessions/revoke', {}, 'Signed out everywhere')}>Sign out</button>}
                          {isMaster && a.status === 'active' && (
                            <button className="btn btn-ghost btn-sm" onClick={() => call(a, 'platform-admin', { enabled: !a.isPlatformAdmin }, a.isPlatformAdmin ? 'Administrator rights removed' : 'Administrator rights granted', a.isPlatformAdmin ? `Remove WRTS administrator rights from ${a.email}?` : `Make ${a.email} a WRTS administrator? They’ll see every organization and must use two-step verification.`)}>
                              {a.isPlatformAdmin ? 'Remove admin' : 'Make admin'}
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Email delivery, activity, data inventory
// ---------------------------------------------------------------------------

function Emails() {
  const { toast } = useStore();
  const [status, setStatus] = useState('');
  const [d, setD] = useState(null);
  const load = useCallback(() => api(`/platform/emails?status=${status}`).then(setD).catch((e) => setD({ error: e.message })), [status]);
  useEffect(() => { load(); }, [load]);
  const retry = (id) => api(`/platform/emails/${id}/retry`, { method: 'POST', body: {} }).then(() => { toast('Sending again'); setTimeout(load, 1500); }).catch((e) => toast(e.message));
  return (
    <Card title="Email delivery" aside={
      <select className="inline-input" aria-label="Filter emails" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">All</option><option value="queued">Queued</option><option value="sent">Sent</option><option value="failed">Failed</option>
      </select>}>
      {!d ? <p className="muted">Loading…</p> : d.error ? <p className="muted">{d.error}</p> : (
        <div className="stack">
          {!d.emailConfigured && <div className="warn-box small">Email isn’t configured on the server. Messages wait in this queue and are sent automatically once the SMTP settings are added in hPanel.</div>}
          {!d.emails.length ? <p className="muted" style={{ margin: 0 }}>No email yet.</p> : (
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Email</th><th>To</th><th>Status</th><th>Created</th><th /></tr></thead>
                <tbody>
                  {d.emails.map((m) => (
                    <tr key={m.id}>
                      <td><strong>{m.subject}</strong><div className="small muted">{m.kind}</div></td>
                      <td className="small">{m.to}</td>
                      <td><span className={`pill ${m.status === 'sent' ? 'good' : m.status === 'failed' ? 'bad' : 'warn'}`}>{m.status}</span>{m.attempts > 0 && <div className="small muted">{m.attempts} attempt{m.attempts === 1 ? '' : 's'}</div>}{m.lastError && <div className="small muted">{m.lastError}</div>}</td>
                      <td className="small">{when(m.createdAt)}{m.sentAt && <div className="muted">sent {when(m.sentAt)}</div>}</td>
                      <td className="r">{m.status !== 'sent' && <button className="btn btn-ghost btn-sm" onClick={() => retry(m.id)}>Retry now</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Activity() {
  const [prefix, setPrefix] = useState('');
  const [rows, setRows] = useState(null);
  useEffect(() => { api(`/platform/audit?prefix=${prefix}`).then((r) => setRows(r.entries)).catch((e) => setRows({ error: e.message })); }, [prefix]);
  return (
    <Card title="Platform activity" aside={
      <select className="inline-input" aria-label="Filter activity" value={prefix} onChange={(e) => setPrefix(e.target.value)}>
        <option value="">Everything</option><option value="account.">Accounts</option><option value="auth.">Sign-ins and security</option><option value="platform.">Administration</option><option value="member.">Team changes</option><option value="event.">Events</option>
      </select>}>
      {!rows ? <p className="muted">Loading…</p> : rows.error ? <p className="muted">{rows.error}</p> : !rows.length ? <p className="muted" style={{ margin: 0 }}>No activity yet.</p> : (
        <div className="table-wrap" style={{ maxHeight: 560, overflow: 'auto' }}>
          <table className="t">
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>Organization</th></tr></thead>
            <tbody>{rows.map((e) => <tr key={e.id}><td className="small">{when(e.at)}</td><td className="small">{e.actor ?? 'System'}</td><td className="small">{e.action}{e.entityId ? ` · ${e.entityId}` : ''}{e.detail ? <div className="muted">{Object.entries(e.detail).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')}</div> : null}</td><td className="small">{e.organization ?? '—'}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <p className="small muted" style={{ marginBottom: 0 }}>Activity records can’t be edited or deleted from EventOS.</p>
    </Card>
  );
}

function Inventory() {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = () => { setBusy(true); api('/platform/data-inventory').then(setD).catch((e) => setD({ error: e.message })).finally(() => setBusy(false)); };
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }));
    a.download = `eventos-data-inventory-${d.generatedAt.slice(0, 10)}.json`;
    a.click();
  };
  const flagged = (list) => (list || []).filter((x) => x.classification === 'likely synthetic');
  return (
    <Card title="Production data inventory">
      <div className="stack">
        <p style={{ margin: 0 }}>A read-only report of everything in the production database, with records that look like test or demo data flagged for your review. <strong>Running it changes nothing and deletes nothing.</strong> Cleanup happens only after you approve a specific list.</p>
        <div className="row"><button type="button" className="btn btn-primary" onClick={run} disabled={busy}>{busy ? 'Building…' : d ? 'Run again' : 'Build the inventory'}</button>{d && !d.error && <button type="button" className="btn btn-secondary" onClick={download}>Download report (JSON)</button>}</div>
        {d?.error && <p className="muted">{d.error}</p>}
        {d && !d.error && (
          <>
            <div className="grid-stats">{Object.entries(d.counts).map(([k, v]) => <Stat key={k} label={k.replace(/([A-Z])/g, ' $1').toLowerCase()} value={v} />)}</div>
            {[['Accounts', d.users, (u) => `${u.email} · ${STATE_LABELS[u.status] ?? u.status}`], ['Organizations', d.organizations, (o) => `${o.name} · ${o.members} people, ${o.events} events`], ['Events', d.events, (e) => `${e.name}${e.isPublic ? ' · published' : ''} · ${e.registrations} registrations`]].map(([label, list, fmt]) => (
              <details key={label} open={flagged(list).length > 0}>
                <summary><strong>{label}</strong>: {list.length} total, {flagged(list).length} flagged as likely synthetic</summary>
                <ul className="list-plain small">
                  {list.map((x) => <li key={x.id}>{fmt(x)} · <em>{x.classification}</em>{x.reasons.length ? ` (${x.reasons.join(', ')})` : ''}</li>)}
                </ul>
              </details>
            ))}
            {d.registrationsWithTestEmails.length > 0 && <p className="small">{d.registrationsWithTestEmails.length} registrations use test-style email addresses.</p>}
            <p className="small muted" style={{ margin: 0 }}>{d.policy}</p>
          </>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

const TABS = [
  ['overview', 'Overview'],
  ['requests', 'Requests'],
  ['accounts', 'Accounts'],
  ['orgs', 'Organizations'],
  ['emails', 'Email delivery'],
  ['activity', 'Activity'],
  ['inventory', 'Data inventory', true],
];

export default function Admin() {
  const { me } = useStore();
  const isMaster = Boolean(me?.user?.isMaster);
  const reviewId = useMemo(() => {
    try {
      return new URLSearchParams(location.search).get('review');
    } catch {
      return null;
    }
  }, []);
  const [tab, setTab] = useState(reviewId ? 'requests' : 'overview');
  const [summary, setSummary] = useState(null);
  const [gate, setGate] = useState(null); // null | 'enroll' | 'reauth' | 'ok'

  const load = useCallback(() => api('/platform/summary').then((s) => { setSummary(s); setGate('ok'); }).catch((e) => {
    if (e.body?.code === 'mfa_enrollment_required') setGate('enroll');
    else if (e.body?.code === 'mfa_required') setGate('reauth');
    else setGate({ error: e.message });
  }), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (reviewId) try { history.replaceState(null, '', location.pathname); } catch { /* ignore */ }
  }, [reviewId]);

  return (
    <div className="stack-lg fade-in">
      <header className="page-head">
        <div className="eyebrow">We Run These Streetz · {isMaster ? 'Master administrator' : 'Administrator'}</div>
        <h1>Admin center</h1>
        <p className="lede">Account approvals, organizations, email delivery and platform activity. Every figure comes from live records.</p>
      </header>

      {gate === null && <p className="muted">Loading…</p>}
      {gate?.error && <p className="muted">{gate.error}</p>}
      {gate === 'enroll' && <MfaSetup onDone={load} />}
      {gate === 'reauth' && <Card title="Sign in again"><p style={{ margin: 0 }}>Your current session started before two-step verification. Sign out and sign in again with your authenticator code to open the admin center.</p></Card>}
      {gate === 'ok' && (
        <>
          <div className="tabs" role="tablist" aria-label="Admin center sections">
            {TABS.filter(([, , masterOnly]) => !masterOnly || isMaster).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
                {label}{id === 'requests' && summary?.pendingRequests ? <span className="tab-count">{summary.pendingRequests}</span> : null}
              </button>
            ))}
          </div>
          {tab === 'overview' && <Overview summary={summary} go={setTab} />}
          {tab === 'requests' && <Requests isMaster={isMaster} initialId={reviewId} onChanged={load} />}
          {tab === 'accounts' && <Accounts isMaster={isMaster} meId={me?.user?.id} />}
          {tab === 'orgs' && <Organizations />}
          {tab === 'emails' && <Emails />}
          {tab === 'activity' && <Activity />}
          {tab === 'inventory' && isMaster && <Inventory />}
        </>
      )}
    </div>
  );
}
