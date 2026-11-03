import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store.jsx';
import { api } from '../../api.js';
import { formatMoney } from '../../domain/metrics.js';
import { Card, Stat, NoAccess } from '../../components/ui.jsx';

const PAY_TONE = { free: 'neutral', paid: 'good', pending: 'warn', failed: 'bad', refunded: 'neutral' };

export default function Participants({ event }) {
  const { isLive, can, toast, loadRows } = useStore();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [rs, setRs] = useState({ raceId: '', eventId: '' });
  const [busy, setBusy] = useState('');
  const canView = can('participants.view');
  const canEdit = can('event.edit');
  const canCheckIn = canEdit || can('workforce.edit');

  const load = useCallback(async () => {
    try {
      const { registrations } = await api(`/events/${event.id}/registrations`);
      setList(registrations);
    } catch (e) {
      setError(e.message);
    }
  }, [event.id]);

  useEffect(() => {
    if (isLive && canView) load();
  }, [isLive, canView, load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!list) return [];
    if (!s) return list;
    return list.filter((r) => `${r.firstName} ${r.lastName} ${r.email} ${r.team ?? ''}`.toLowerCase().includes(s));
  }, [list, q]);

  if (!isLive) {
    return <div className="empty">Participant lists come from real registrations. Sign in to a live organization and publish the event page to start taking registrations.</div>;
  }
  if (!canView) return <NoAccess what="the participant list" />;

  const counted = (list ?? []).filter((r) => r.paymentStatus === 'free' || r.paymentStatus === 'paid');
  const checkedIn = counted.filter((r) => r.checkedInAt).length;
  const revenue = counted.reduce((a, r) => a + r.amountCents + r.donationCents, 0) / 100;

  const toggle = async (r, key) => {
    const body = key === 'checkedIn' ? { checkedIn: !r.checkedInAt } : { finished: !r.finished };
    setList((l) => l.map((x) => (x.id === r.id ? { ...x, ...(key === 'checkedIn' ? { checkedInAt: body.checkedIn ? new Date().toISOString() : null } : { finished: body.finished }) } : x)));
    try {
      await api(`/registrations/${r.id}`, { method: 'PATCH', body });
      loadRows(event.id, true);
    } catch (e) {
      toast(e.message);
      load();
    }
  };

  const runImport = async () => {
    setBusy('runsignup');
    try {
      const r = await api(`/events/${event.id}/import/runsignup`, { method: 'POST', body: rs });
      toast(`RunSignup: ${r.imported} new of ${r.fetched} registrations imported`);
      await load();
      loadRows(event.id, true);
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy('');
    }
  };
  const runSync = async () => {
    setBusy('hubspot');
    try {
      const r = await api(`/events/${event.id}/sync/hubspot`, { method: 'POST', body: {} });
      toast(`HubSpot: ${r.sent} contacts synced${r.withheld ? `, ${r.withheld} withheld (no marketing consent)` : ''}`);
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="stack-lg">
      <div className="spread">
        <div>
          <div className="eyebrow">Registrations</div>
          <h2 className="display" style={{ fontSize: 32 }}>Participants</h2>
        </div>
        <span className="row" style={{ gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={load}>Refresh</button>
          <a className="btn btn-secondary btn-sm" href={`/api/events/${event.id}/registrations.csv`} download>Export CSV</a>
        </span>
      </div>

      {error && <div className="warn-box small">{error}</div>}

      <div className="grid-stats">
        <Stat label="Registered" value={counted.length} sub={event.cap ? `of ${event.cap} cap` : 'Confirmed'} />
        <Stat label="Checked in" value={checkedIn} sub={counted.length ? `${Math.round((checkedIn / counted.length) * 100)}%` : '—'} />
        <Stat label="Collected" value={formatMoney(revenue)} sub="Fees and donations" />
        <Stat label="Awaiting payment" value={(list ?? []).filter((r) => r.paymentStatus === 'pending').length} sub="Started checkout" />
      </div>

      <Card title="Everyone registered" aside={<input className="input" style={{ maxWidth: 220 }} placeholder="Search name, email, team" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search participants" />}>
        {list === null ? <p className="muted">Loading…</p> : !list.length ? (
          <p className="muted">No registrations yet. Publish the event page (Reports → Event page) and share the link, or import from RunSignup below.</p>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Name</th><th>Email</th><th>Team</th><th>Payment</th><th className="r">Paid</th><th>Source</th><th>Checked in</th><th>Finished</th></tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.firstName} {r.lastName}{!r.isAdult && <span className="small muted"> · minor</span>}</td>
                    <td className="small">{r.email}</td>
                    <td className="small">{r.team || '—'}</td>
                    <td><span className={`pill ${PAY_TONE[r.paymentStatus] ?? 'neutral'}`}>{r.paymentStatus}</span></td>
                    <td className="r">{formatMoney((r.amountCents + r.donationCents) / 100)}</td>
                    <td className="small">{r.source}</td>
                    <td>{canCheckIn ? <input type="checkbox" aria-label={`Checked in ${r.firstName}`} checked={Boolean(r.checkedInAt)} onChange={() => toggle(r, 'checkedIn')} /> : r.checkedInAt ? 'Yes' : '—'}</td>
                    <td>{canCheckIn ? <input type="checkbox" aria-label={`Finished ${r.firstName}`} checked={Boolean(r.finished)} onChange={() => toggle(r, 'finished')} /> : r.finished ? 'Yes' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {canEdit && (
        <div className="grid-2">
          <Card title="Import from RunSignup">
            <p className="small muted">Already selling on RunSignup? Pull those registrations in. Re-running only adds new people.</p>
            <div className="row" style={{ alignItems: 'flex-end', marginTop: 10 }}>
              <div className="field" style={{ flex: 1, minWidth: 110 }}><label htmlFor="rs-race">Race ID</label><input id="rs-race" className="input" inputMode="numeric" value={rs.raceId} onChange={(e) => setRs((x) => ({ ...x, raceId: e.target.value.trim() }))} /></div>
              <div className="field" style={{ flex: 1, minWidth: 110 }}><label htmlFor="rs-ev">Event ID</label><input id="rs-ev" className="input" inputMode="numeric" value={rs.eventId} onChange={(e) => setRs((x) => ({ ...x, eventId: e.target.value.trim() }))} /></div>
              <button className="btn btn-secondary btn-sm" disabled={busy === 'runsignup' || !rs.raceId || !rs.eventId} onClick={runImport}>{busy === 'runsignup' ? 'Importing…' : 'Import'}</button>
            </div>
          </Card>
          <Card title="Sync to HubSpot">
            <p className="small muted">Sends participants who agreed to marketing email to your HubSpot contacts, with event, ZIP and 4W interests. Others are never sent.</p>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} disabled={busy === 'hubspot'} onClick={runSync}>{busy === 'hubspot' ? 'Syncing…' : 'Sync consented contacts'}</button>
          </Card>
        </div>
      )}
    </div>
  );
}
