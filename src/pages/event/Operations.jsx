import { readiness, isPhysical } from '../../domain/blueprint.js';
import { rng } from '../../domain/simulate.js';
import { Card, Progress, SafetyNote } from '../../components/ui.jsx';
import { Checklist } from './Checklist.jsx';

function volunteerRoles(event, sim) {
  const need = sim.impact.volunteersNeeded;
  const physical = isPhysical(event);
  const base = physical
    ? [
        ['Check-in and packet pickup', 0.22],
        ['Course marshals', 0.24],
        ['Water stations', 0.14],
        ['Finish line and medals', 0.12],
        ['Resource village guides', 0.12],
        ['Setup and cleanup', 0.1],
        ['Cause ambassadors', 0.06],
      ]
    : [['Challenge hosts', 0.5], ['Community check-in callers', 0.3], ['Cause ambassadors', 0.2]];
  const r = rng(event.id + ':vol');
  const fillRate = event.phase === 'planning' ? 0 : event.phase === 'live' ? 0.72 : 1;
  return base.map(([role, share]) => {
    const needed = Math.max(1, Math.round(need * share));
    const filled = Math.min(needed, Math.round(needed * fillRate * (0.8 + r() * 0.4)));
    return { role, needed, filled };
  });
}

const VENDORS = [
  { what: 'Tents, tables and chairs', vendor: 'Local rental company', physical: true },
  { what: 'Portable restrooms', vendor: 'Sanitation vendor', physical: true },
  { what: 'Sound and DJ', vendor: 'Community DJ', physical: true },
  { what: 'Race timing', vendor: 'Timing provider', timed: true },
  { what: 'Shirts', vendor: 'Screen printer', feature: 'shirts' },
  { what: 'Medals', vendor: 'Medal supplier', feature: 'medals' },
  { what: 'Water and ice', vendor: 'Grocery partner', physical: true },
];

export default function Operations({ event, sim }) {
  const r = readiness(event);
  const roles = volunteerRoles(event, sim);
  const totalNeeded = roles.reduce((a, x) => a + x.needed, 0);
  const totalFilled = roles.reduce((a, x) => a + x.filled, 0);
  const physical = isPhysical(event);
  const vendors = VENDORS.filter((v) => (v.physical ? physical : true) && (v.feature ? event.features?.includes(v.feature) : true) && (v.timed ? r.items.some((i) => i.id === 'timing') : true));
  const vendorStatus = (i) => (event.phase === 'complete' ? 'done' : event.phase === 'live' ? (i % 3 === 2 ? 'attention' : 'done') : i % 2 ? 'attention' : 'blocking');

  return (
    <div className="stack-lg">
      <div className="info small">EventOS keeps race-day coordination lightweight. Timing, registration and volunteer platforms connect through the Integration Gateway instead of being rebuilt here.</div>
      <Card title="Volunteer assignments" aside={<span className="small muted num">{totalFilled} of {totalNeeded} filled</span>}>
        <Progress value={totalFilled / totalNeeded} />
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="t">
            <thead><tr><th>Role</th><th className="r">Needed</th><th className="r">Filled</th><th>Status</th></tr></thead>
            <tbody>
              {roles.map((x) => (
                <tr key={x.role}>
                  <td>{x.role}</td>
                  <td className="r">{x.needed}</td>
                  <td className="r">{x.filled}</td>
                  <td><span className={`pill ${x.filled >= x.needed ? 'good' : x.filled > 0 ? 'warn' : 'bad'}`}>{x.filled >= x.needed ? 'Filled' : x.filled > 0 ? 'Recruiting' : 'Open'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Race day and logistics">
          <Checklist event={event} items={r.items.filter((i) => ['Race day', 'People'].includes(i.category))} />
        </Card>
        <Card title="Safety and approvals">
          <div className="stack">
            <SafetyNote />
            <Checklist event={event} items={r.items.filter((i) => i.category === 'Safety and approvals')} />
          </div>
        </Card>
      </div>

      {vendors.length > 0 && (
        <Card title="Vendors">
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Need</th><th>Vendor</th><th>Status</th></tr></thead>
              <tbody>
                {vendors.map((v, i) => {
                  const s = vendorStatus(i);
                  return (
                    <tr key={v.what}>
                      <td>{v.what}</td>
                      <td className="muted">{v.vendor}</td>
                      <td><span className={`pill ${s === 'done' ? 'good' : s === 'attention' ? 'warn' : 'bad'}`}>{s === 'done' ? 'Confirmed' : s === 'attention' ? 'Quote received' : 'Not booked'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
