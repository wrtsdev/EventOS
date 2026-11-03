import { useMemo } from 'react';
import { useStore } from '../../store.jsx';
import { workforceFor, workforceSummary, WORK_TYPES } from '../../domain/workforce.js';
import { financeView } from '../../domain/finance.js';
import { formatMoney } from '../../domain/metrics.js';
import { Card, Stat, Progress, Gate } from '../../components/ui.jsx';

export default function Workforce({ event, sim }) {
  const { dispatch, can, org } = useStore();
  const fin = useMemo(() => financeView(event, sim), [event, sim]);
  const wf = useMemo(() => workforceSummary(event, fin), [event, fin]);
  const editable = can('workforce.edit') && event.status !== 'canceled';
  const setRow = (id, patch) => dispatch({ type: 'updateEvent', id: event.id, perm: 'workforce.edit', patch: { workforce: workforceFor(event).map((r) => (r.id === id ? { ...r, ...patch } : r)) } });
  const num = (v, max) => Math.max(0, Math.min(max ?? Infinity, Number(v) || 0));

  return (
    <Gate feature="workforce" tier={org?.tier}>
      <div className="stack-lg">
        <div>
          <div className="eyebrow">Work · Workforce and volunteer operations</div>
          <h2 className="display" style={{ fontSize: 32 }}>Workforce contribution and capability</h2>
        </div>

        <div className="grid-stats">
          <Stat label="Volunteers" value={`${wf.volunteers.assigned}/${wf.volunteers.needed}`} sub={wf.hoursRecorded ? `${wf.volunteers.hours} hours served` : `${wf.volunteers.plannedHours} hours planned`} />
          <Stat label="Paid positions" value={wf.paid.positions} sub={`${formatMoney(wf.paid.wages)} in wages`} />
          <Stat label="Contracted services" value={wf.contracted.services} sub={`${formatMoney(wf.contracted.value)} · ${formatMoney(wf.contracted.localValue)} local`} />
          <Stat label="Training complete" value={wf.training.rate == null ? '—' : `${Math.round(wf.training.rate * 100)}%`} sub={`${wf.training.trained} of ${wf.training.required} who need it`} />
        </div>

        {wf.leadsWithoutBackup.length > 0 && (
          <div className="banner warn"><span><strong>{wf.leadsWithoutBackup.length} leads have no backup.</strong> {wf.leadsWithoutBackup.map((r) => r.role).join(', ')}. Name one so a single absence does not stop a station.</span></div>
        )}

        <Card title="Roles and assignments" aside={<span className="small muted">Volunteer, paid and contracted work are tracked separately</span>}>
          <Progress value={wf.volunteers.needed ? wf.volunteers.assigned / wf.volunteers.needed : 0} />
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="t" style={{ minWidth: 820 }}>
              <thead><tr><th>Role</th><th>Type</th><th className="r">Needed</th><th className="r">Assigned</th><th>Training</th><th>Lead</th><th>Backup</th><th>Skill gained</th></tr></thead>
              <tbody>
                {wf.rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.role}{r.wage ? <div className="small muted">${r.wage}/hr · {r.hoursEach} hrs</div> : <div className="small muted">{r.hoursEach} hrs each</div>}</td>
                    <td><span className="pill neutral plain">{WORK_TYPES[r.type].label}</span></td>
                    <td className="r">{r.needed}</td>
                    <td className="r">{editable && r.type !== 'contracted' ? <input aria-label={`Assigned ${r.role}`} className="inline-input" type="number" min="0" max={r.needed} value={r.assigned} onChange={(e) => setRow(r.id, { assigned: num(e.target.value, r.needed) })} style={{ maxWidth: 70 }} /> : r.assigned}</td>
                    <td>{r.trainingRequired ? (editable ? <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}><input aria-label={`Trained ${r.role}`} className="inline-input" type="number" min="0" max={r.assigned} value={r.trained} onChange={(e) => setRow(r.id, { trained: num(e.target.value, r.assigned) })} style={{ maxWidth: 60 }} /><span className="small muted">/{r.assigned}</span></span> : `${r.trained}/${r.assigned}`) : <span className="small muted">Not required</span>}</td>
                    <td className="small">{r.lead}</td>
                    <td>{r.type === 'contracted' ? <span className="small muted">{r.backup || 'Vendor'}</span> : editable ? <input aria-label={`Backup for ${r.role}`} className="inline-input" value={r.backup} placeholder="Name a backup" onChange={(e) => setRow(r.id, { backup: e.target.value })} style={!r.backup ? { borderColor: 'var(--warn)' } : undefined} /> : r.backup || '—'}</td>
                    <td className="small muted">{r.skill || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Workforce Contribution & Capability Report">
          {wf.hoursRecorded ? (
            <ul className="bullets">
              <li><strong>{wf.volunteers.hours}</strong> volunteer hours from {wf.volunteers.assigned} volunteers. Volunteer time is shown in hours, never converted to dollars.</li>
              <li><strong>{wf.paid.positions}</strong> paid positions, {formatMoney(wf.paid.wages)} in wages, {wf.paid.hours} paid hours.</li>
              <li><strong>{formatMoney(wf.contracted.localValue)}</strong> of {formatMoney(wf.contracted.value)} in contracted services went to local providers.</li>
              <li><strong>{wf.skills}</strong> people gained a documented skill or credential.</li>
            </ul>
          ) : <p className="small muted">The report fills in after event day, from assignments, attendance and training records.</p>}
        </Card>
      </div>
    </Gate>
  );
}
