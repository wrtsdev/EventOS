import { useState } from 'react';
import { useStore, useSim } from '../store.jsx';
import { ADAPTERS, importRegistrations, genericTiming } from '../integrations/registry.js';
import { HUBSPOT_PROPERTIES, syncPreview } from '../integrations/hubspot.js';
import { splitRecord } from '../integrations/adapter.js';
import { Card } from '../components/ui.jsx';

const CATEGORY_LABELS = {
  registration: 'Registration',
  timing: 'Timing',
  fundraising: 'Fundraising',
  crm: 'CRM',
  'participant-app': 'Participant apps',
};
const STATUS_PILL = { live: ['good', 'Live'], mock: ['warn', 'Demo adapter · sample data'], 'not-connected': ['neutral', 'Not connected'], planned: ['neutral', 'Planned'] };

const BUILD_BUY = [
  ['Registration and payments', 'Integrate', 'Transactions are mature and commoditized.'],
  ['Chip timing and results', 'Integrate', 'Specialized hardware and race-day operations.'],
  ['Insurance, permits, EMS', 'Integrate / partner', 'Local, regulated, and liability-bearing.'],
  ['CRM and email automation', 'Integrate (HubSpot)', 'WRTS already runs lifecycle in HubSpot.'],
  ['Participant Passport', 'Own', 'Persistent community identity across events.'],
  ['4W programming and Blueprint', 'Own', 'The WRTS method, expressed as product.'],
  ['Community Intelligence, CVI, PLV', 'Own', 'Impact intelligence and relationship value.'],
  ['CauseOS and SponsorOS reporting', 'Own', 'Measurable community and sponsor value.'],
];

export default function Gateway() {
  const { events, isLive, navigate } = useStore();
  const event = events.find((e) => e.phase !== 'planning') ?? events[0];
  const sim = useSim(event);
  const hub = sim ? syncPreview(sim.participants, event) : { total: 0, syncable: 0, withheld: 0, byAction: {} };
  const [imported, setImported] = useState(null);

  const runImport = async () => {
    const regs = await importRegistrations();
    const timing = await genericTiming.fetchRaw();
    setImported({ regs, timing: timing.map((raw) => ({ raw, canonical: genericTiming.normalize(raw) })) });
  };

  const byCat = ADAPTERS.reduce((acc, a) => ((acc[a.category] ??= []).push(a), acc), {});

  return (
    <div className="stack-lg fade-in">
      <header className="page-head">
        <div className="eyebrow">Vendor-neutral by design</div>
        <h1>EventOS Intelligence Gateway</h1>
        <p className="lede">Keep the registration and timing tools you already use. EventOS brings their data into one community record, then turns it into Passport, impact and next steps.</p>
      </header>

      {isLive && (
        <div className="info spread">
          <span className="min0"><strong>Live connections:</strong> Stripe payments, RunSignup import and HubSpot sync work with your own accounts. Connect them in Settings; the other connectors below are on the roadmap.</span>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('settings')}>Open Settings</button>
        </div>
      )}

      <section className="flow" aria-label="Integration architecture">
        <div className="flow-tier"><div className="eyebrow">Sources</div>{['Registration', 'Timing', 'Fundraising', 'CRM', 'Participant apps'].map((x) => <span key={x} className="node">{x}</span>)}</div>
        <span className="flow-arrow" />
        <div className="flow-tier core"><div className="eyebrow">Adapters · normalize · consent check</div><span className="node">EventOS Integration Gateway</span></div>
        <span className="flow-arrow" />
        <div className="flow-tier"><div className="eyebrow">Canonical data</div><span className="node">Participant</span><span className="node">Event</span><span className="node">Registration</span><span className="node">Result</span><span className="node">Consent</span></div>
        <span className="flow-arrow" />
        <div className="flow-tier owned"><div className="eyebrow">Owned by WRTS</div>{['Passport', 'CauseOS', 'SponsorOS', 'Community Intelligence', 'PLV + CVI'].map((x) => <span key={x} className="node">{x}</span>)}</div>
        <span className="flow-arrow" />
        <div className="flow-tier core"><div className="eyebrow">Output</div><span className="node">Organizer recommendations</span><span className="node">HubSpot workflows</span></div>
      </section>

      <section className="stack">
        <h2 className="display" style={{ fontSize: 30 }}>Connectors</h2>
        <div className="grid">
          {Object.entries(byCat).map(([cat, list]) => (
            <Card key={cat} title={CATEGORY_LABELS[cat]}>
              <ul className="list-plain">
                {list.map((a) => (
                  <li key={a.id} className="stack" style={{ gap: 2 }}>
                    <div className="spread"><strong>{a.name}</strong><span className={`pill ${STATUS_PILL[a.status][0]}`}>{STATUS_PILL[a.status][1]}</span></div>
                    <span className="small muted">{a.capabilities.join(' · ')}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
        <p className="small muted">{isLive ? 'Statuses below describe the demo adapters. ' : ''}No connector in this list talks to a real service. Demo adapters return sample data in each vendor’s own format so normalization is real; replacing one with a live client does not change any screen.</p>
      </section>

      <Card title="See normalization work" aside={<button className="btn btn-primary btn-sm" onClick={runImport}>Run sample import</button>}>
        {!imported ? (
          <p className="small muted">Pull sample records from RunSignup, Race Roster and a timing provider. Each arrives in a different shape and leaves as one canonical record, split into a transactional part and an intelligence part.</p>
        ) : (
          <div className="stack">
            {imported.regs.map(({ raw, canonical, source }) => {
              const split = splitRecord(canonical);
              return (
                <div key={canonical.id} className="grid-2">
                  <div className="min0"><div className="eyebrow" style={{ marginBottom: 4 }}>{source} raw</div><pre className="code">{JSON.stringify(raw, null, 2)}</pre></div>
                  <div className="min0 stack" style={{ gap: 8 }}>
                    <div><div className="eyebrow" style={{ marginBottom: 4 }}>Transactional store</div><pre className="code">{JSON.stringify(split.transactional, null, 2)}</pre></div>
                    <div><div className="eyebrow" style={{ marginBottom: 4 }}>Community intelligence store</div><pre className="code">{JSON.stringify(split.intelligence, null, 2)}</pre></div>
                  </div>
                </div>
              );
            })}
            {imported.timing.map(({ raw, canonical }) => (
              <div key={raw.bib} className="grid-2">
                <div className="min0"><div className="eyebrow" style={{ marginBottom: 4 }}>timing raw</div><pre className="code">{JSON.stringify(raw, null, 2)}</pre></div>
                <div className="min0"><div className="eyebrow" style={{ marginBottom: 4 }}>Canonical result</div><pre className="code">{JSON.stringify(canonical, null, 2)}</pre></div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid-2">
        <Card title="HubSpot: what EventOS sends">
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>HubSpot property</th><th>From EventOS</th></tr></thead>
              <tbody>{HUBSPOT_PROPERTIES.map((p) => <tr key={p.property}><td><code>{p.property}</code></td><td className="muted">{p.from}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
        <Card title={`Sync preview${event ? ' · ' + event.name : ''}`}>
          <dl className="kv">
            <dt>Participants</dt><dd>{hub.total}</dd>
            <dt>Ready to sync (opted in)</dt><dd>{hub.syncable}</dd>
            <dt>Withheld (no consent)</dt><dd>{hub.withheld}</dd>
          </dl>
          <div className="eyebrow" style={{ margin: '14px 0 6px' }}>By next-best action</div>
          <dl className="kv">
            {Object.entries(hub.byAction).map(([k, v]) => [<dt key={k}>{k}</dt>, <dd key={k + 'v'}>{v}</dd>])}
          </dl>
          <p className="small muted" style={{ marginTop: 10 }}>EventOS does not rebuild CRM. HubSpot owns lists, emails and workflows.</p>
        </Card>
      </div>

      <Card title="Build or integrate">
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Capability</th><th>Decision</th><th>Why</th></tr></thead>
            <tbody>
              {BUILD_BUY.map(([c, d, w]) => (
                <tr key={c}><td style={{ fontWeight: 600 }}>{c}</td><td><span className={`pill ${d === 'Own' ? 'good' : 'neutral'} plain`}>{d}</span></td><td className="muted">{w}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
