import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../store.jsx';
import { api } from '../api.js';
import { ROLES } from '../domain/access.js';
import { Card } from '../components/ui.jsx';

const FIELD_LABELS = {
  secretKey: ['Secret key', 'Starts with sk_live_ (or sk_test_ while testing). Stripe Dashboard → Developers → API keys.'],
  webhookSecret: ['Webhook signing secret', 'Starts with whsec_. Create the webhook below first, then paste its secret here.'],
  apiKey: ['API key', 'RunSignup → Partner/Affiliate → API keys.'],
  apiSecret: ['API secret', ''],
  accessToken: ['Private app access token', 'HubSpot → Settings → Integrations → Private apps. Scopes: crm.objects.contacts read/write, crm.schemas.contacts write.'],
};
const PROVIDER_FIELDS = { stripe: ['secretKey', 'webhookSecret'], runsignup: ['apiKey', 'apiSecret'], hubspot: ['accessToken'] };
const PROVIDER_BLURB = {
  stripe: 'Collects registration fees and donations through Stripe Checkout. Money goes straight to your Stripe account.',
  runsignup: 'Import registrations from races you already sell on RunSignup.',
  hubspot: 'Send participants who opted in to marketing email to your HubSpot contacts.',
};

function copyText(t, toast) {
  try {
    navigator.clipboard.writeText(t);
    toast('Copied');
  } catch {
    /* ignore */
  }
}

export function TeamCard() {
  const { can, toast, me } = useStore();
  const admin = can('org.admin');
  const [data, setData] = useState(null);
  const [inv, setInv] = useState({ email: '', role: 'coordinator' });
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api('/members').then(setData).catch((e) => setData({ error: e.message })), []);
  useEffect(() => { load(); }, [load]);

  const invite = async (e) => {
    e.preventDefault();
    setBusy(true);
    setLink('');
    try {
      const r = await api('/members/invite', { method: 'POST', body: inv });
      if (r.link) setLink(r.link);
      toast(r.emailed ? `Invitation emailed to ${inv.email}` : 'Invitation created. Email isn’t set up, so share the link below.');
      setInv((x) => ({ ...x, email: '' }));
      load();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };
  const setRole = (id, role) => api(`/members/${id}`, { method: 'PATCH', body: { role } }).then(load).catch((e) => toast(e.message));
  const remove = (m) => {
    if (!window.confirm(`Remove ${m.email} from this organization?`)) return;
    api(`/members/${m.id}`, { method: 'DELETE' }).then(load).catch((e) => toast(e.message));
  };

  return (
    <Card title="Team and roles">
      {!data ? <p className="muted">Loading…</p> : data.error ? <p className="muted">{data.error}</p> : (
        <div className="stack">
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Person</th><th>Role</th><th /></tr></thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.id}>
                    <td><strong>{m.name || m.email}</strong>{m.name && <div className="small muted">{m.email}</div>}</td>
                    <td>
                      {admin && m.id !== me?.user?.id
                        ? <select className="inline-input" aria-label={`Role for ${m.email}`} value={m.role} onChange={(e) => setRole(m.id, e.target.value)}>{Object.entries(ROLES).map(([id, r]) => <option key={id} value={id}>{r.label}</option>)}</select>
                        : ROLES[m.role]?.label ?? m.role}
                    </td>
                    <td className="r">{admin && m.id !== me?.user?.id && <button className="btn btn-ghost btn-sm" onClick={() => remove(m)}>Remove</button>}</td>
                  </tr>
                ))}
                {data.invites.map((i) => (
                  <tr key={i.email}><td className="muted">{i.email}</td><td className="muted">{ROLES[i.role]?.label} · invited</td><td /></tr>
                ))}
              </tbody>
            </table>
          </div>
          {admin && (
            <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={invite}>
              <div className="field" style={{ flex: 2, minWidth: 200 }}><label htmlFor="inv-email">Invite by email</label><input id="inv-email" className="input" type="email" value={inv.email} onChange={(e) => setInv((x) => ({ ...x, email: e.target.value }))} /></div>
              <div className="field" style={{ flex: 1, minWidth: 150 }}><label htmlFor="inv-role">Role</label><select id="inv-role" className="select" value={inv.role} onChange={(e) => setInv((x) => ({ ...x, role: e.target.value }))}>{Object.entries(ROLES).map(([id, r]) => <option key={id} value={id}>{r.label}</option>)}</select></div>
              <button className="btn btn-primary btn-sm" disabled={busy || !inv.email}>Send invite</button>
            </form>
          )}
          {link && (
            <div className="info small stack" style={{ gap: 6 }}>
              <span>Share this one-time link with the person you invited (valid 7 days):</span>
              <code style={{ wordBreak: 'break-all' }}>{link}</code>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => copyText(link, toast)}>Copy link</button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function IntegrationsCard() {
  const { can, toast } = useStore();
  const admin = can('org.admin');
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api('/integrations').then(setData).catch((e) => setData({ error: e.message })), []);
  useEffect(() => { load(); }, [load]);

  const save = async (id) => {
    setBusy(true);
    try {
      await api(`/integrations/${id}`, { method: 'PUT', body: vals });
      toast('Connected');
      setOpen(null);
      setVals({});
      load();
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };
  const disconnect = (id) => {
    if (!window.confirm('Disconnect this integration? Saved credentials are deleted.')) return;
    api(`/integrations/${id}`, { method: 'DELETE' }).then(load).catch((e) => toast(e.message));
  };

  return (
    <Card title="Connected services">
      {!data ? <p className="muted">Loading…</p> : data.error ? <p className="muted">{data.error}</p> : (
        <div className="stack">
          {data.integrations.map((i) => (
            <section key={i.id} className="stack" style={{ gap: 8, paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
              <div className="spread">
                <div className="min0">
                  <strong>{i.label}</strong> <span className={`pill ${i.connected ? 'good' : 'neutral'}`}>{i.connected ? 'Connected' : 'Not connected'}</span>
                  <div className="small muted">{PROVIDER_BLURB[i.id]}{i.connected && i.settings?.last4?.length ? ` Key ends ${i.settings.last4[0]}.` : ''}</div>
                </div>
                {admin && (
                  <span className="row" style={{ gap: 6 }}>
                    {i.connected && <button className="btn btn-ghost btn-sm" onClick={() => disconnect(i.id)}>Disconnect</button>}
                    <button className="btn btn-secondary btn-sm" onClick={() => { setOpen(open === i.id ? null : i.id); setVals({}); }}>{i.connected ? 'Update keys' : 'Connect'}</button>
                  </span>
                )}
              </div>
              {i.id === 'stripe' && (
                <div className="small muted">
                  Webhook endpoint (Stripe → Developers → Webhooks, event <code>checkout.session.completed</code> and <code>checkout.session.expired</code>):{' '}
                  <code style={{ wordBreak: 'break-all' }}>{data.webhookUrl}</code>{' '}
                  <button className="btn btn-ghost btn-sm" onClick={() => copyText(data.webhookUrl, toast)}>Copy</button>
                </div>
              )}
              {open === i.id && (
                <form className="stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); save(i.id); }}>
                  {PROVIDER_FIELDS[i.id].map((f) => (
                    <div key={f} className="field">
                      <label htmlFor={`${i.id}-${f}`}>{FIELD_LABELS[f][0]}</label>
                      <input id={`${i.id}-${f}`} className="input" type="password" autoComplete="off" value={vals[f] ?? ''} onChange={(e) => setVals((v) => ({ ...v, [f]: e.target.value.trim() }))} />
                      {FIELD_LABELS[f][1] && <span className="small muted">{FIELD_LABELS[f][1]}</span>}
                    </div>
                  ))}
                  <div className="row"><button className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Checking…' : 'Verify and save'}</button><span className="small muted">Keys are checked with the service, then stored encrypted. They are never shown again.</span></div>
                </form>
              )}
            </section>
          ))}
          {!admin && <p className="small muted">Only the organization owner can connect services.</p>}
        </div>
      )}
    </Card>
  );
}

export function AuditCard() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api('/audit').then((r) => setRows(r.entries)).catch(() => setRows([])); }, []);
  return (
    <Card title="Activity log">
      {!rows ? <p className="muted">Loading…</p> : !rows.length ? <p className="muted">No activity yet.</p> : (
        <div className="table-wrap" style={{ maxHeight: 320, overflow: 'auto' }}>
          <table className="t">
            <thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
            <tbody>
              {rows.map((r) => <tr key={r.id}><td className="small">{new Date(r.at).toLocaleString()}</td><td className="small">{r.email ?? 'System'}</td><td className="small">{r.action}{r.entityId ? ` · ${r.entityId}` : ''}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
