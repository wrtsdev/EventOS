import { useState } from 'react';
import { useStore } from '../store.jsx';
import { ROLES, PERMISSIONS, hasFeature } from '../domain/access.js';
import { TIERS } from '../domain/catalog.js';
import { EPIC_ORDER, EPIC_DOMAINS, DEFAULT_WEIGHTS, weightsFor } from '../domain/epic.js';
import { Card, EpicChip, Gate } from '../components/ui.jsx';

export default function Settings() {
  const { org, role, dispatch, can, state } = useStore();
  const [weights, setWeights] = useState(() => weightsFor(org).weights);
  const check = weightsFor({ epicWeights: weights });
  const isDemo = Boolean(org?.isSample) || org?.trial;

  return (
    <div className="stack-lg fade-in">
      <header className="page-head">
        <div className="eyebrow">{org?.name}</div>
        <h1>Settings and roles</h1>
      </header>

      <Card title="Who you are in this demo">
        <div className="stack" style={{ gap: 10 }}>
          <p className="small">Switch roles to see how EventOS limits what each person can see and change. In production, roles are assigned by the organization owner and enforced by the server.</p>
          <div className="field" style={{ maxWidth: 360 }}>
            <label htmlFor="role">View as</label>
            <select id="role" className="select" value={role} onChange={(e) => dispatch({ type: 'setRole', role: e.target.value })}>
              {Object.entries(ROLES).map(([id, r]) => <option key={id} value={id}>{r.label}</option>)}
            </select>
          </div>
          <div className="table-wrap">
            <table className="t" style={{ minWidth: 520 }}>
              <thead><tr><th>Permission</th>{Object.keys(ROLES).map((r) => <th key={r} className="r" style={r === role ? { color: 'var(--accent)' } : undefined}>{ROLES[r].label.split(' ')[0]}</th>)}</tr></thead>
              <tbody>
                {Object.entries(PERMISSIONS).map(([p, label]) => (
                  <tr key={p}><td className="small">{label}</td>{Object.keys(ROLES).map((r) => <td key={r} className="r">{ROLES[r].perms.includes(p) ? '✓' : ''}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <span className="small muted">Organization:</span>
            {state.orgs.filter((o) => o.isSample || o.id === org?.id).map((o) => (
              <button key={o.id} className={`btn btn-sm ${o.id === org?.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => dispatch({ type: 'setSession', session: { orgId: o.id, role: 'owner' } })}>{o.name}</button>
            ))}
          </div>
          <p className="small muted">Each organization sees only its own events, reports and history.</p>
        </div>
      </Card>

      <Card title="Plan">
        <div className="stack" style={{ gap: 10 }}>
          <p className="small">Current plan: <strong>{TIERS.find((t) => t.id === org?.tier)?.name ?? 'EventOS Community'}</strong>{org?.trial ? ' (trial)' : ''}. Plans are proposed configurations, not final prices.</p>
          {isDemo && can('org.admin') && (
            <div className="row">
              <span className="small muted">Preview:</span>
              {TIERS.map((t) => <button key={t.id} className={`btn btn-sm ${org.tier === t.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => dispatch({ type: 'updateOrg', patch: { tier: t.id } })}>{t.name.replace('EventOS ', '')}</button>)}
            </div>
          )}
          <ul className="bullets small">
            {['financeAdvanced', 'sponsorOS', 'workforce', 'epicScorecard', 'aar', 'seriesTrends', 'epicConfig'].map((f) => <li key={f}>{f.replace(/([A-Z])/g, ' $1').toLowerCase()}: {hasFeature(org?.tier, f) ? 'included' : 'not included'}</li>)}
          </ul>
        </div>
      </Card>

      <Card title="Planning assistant">
        <label className="toggle-row" htmlFor="assistant">
          <input id="assistant" type="checkbox" checked={org?.assistantEnabled !== false} disabled={!can('org.admin')} onChange={(e) => dispatch({ type: 'updateOrg', patch: { assistantEnabled: e.target.checked } })} />
          <span className="min0"><span className="tt">Turn on the planning assistant</span><span className="why" style={{ display: 'block' }}>Optional. It only reads this organization’s records and cannot approve, send, pay or change anything. EventOS works fully with it off.</span></span>
        </label>
      </Card>

      <Card title="EPIC score weights">
        <Gate feature="epicConfig" tier={org?.tier}>
          <div className="stack" style={{ gap: 10 }}>
            <p className="small">Starting model: Economic Vitality 40%, the other three 20% each. Changes apply to every event in this organization and are recorded with your name.</p>
            <div className="grid-stats">
              {EPIC_ORDER.map((d) => (
                <div key={d} className="field">
                  <label htmlFor={'w-' + d}><EpicChip id={d} /> {EPIC_DOMAINS[d].short}</label>
                  <input id={'w-' + d} className="input" type="number" min="0" max="100" value={weights[d]} disabled={!can('epic.configure')} onChange={(e) => setWeights({ ...weights, [d]: Number(e.target.value) || 0 })} />
                </div>
              ))}
            </div>
            <p className="small" style={{ color: check.valid ? 'var(--good)' : 'var(--bad)' }}>Total {check.sum}%{check.valid ? '' : ' · must equal 100'}</p>
            {can('epic.configure') ? (
              <div className="row">
                <button className="btn btn-primary btn-sm" disabled={!check.valid} onClick={() => dispatch({ type: 'updateOrg', perm: 'epic.configure', patch: { epicWeights: weights, epicWeightsChangedBy: org?.coordinator || role, epicWeightsChangedAt: new Date().toISOString() } })}>Save weights</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setWeights(DEFAULT_WEIGHTS)}>Reset to 40/20/20/20</button>
              </div>
            ) : <p className="small muted">Only the organization owner can change weights.</p>}
            {org?.epicWeightsChangedBy && <p className="small muted">Last changed by {org.epicWeightsChangedBy} on {new Date(org.epicWeightsChangedAt).toLocaleDateString()}.</p>}
          </div>
        </Gate>
      </Card>
    </div>
  );
}
