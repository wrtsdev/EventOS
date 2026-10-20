import { useStore } from '../store.jsx';
import { Card } from '../components/ui.jsx';

const CHOICES = [
  { id: 'analytics', label: 'Help organizers improve events', detail: 'Your registration and survey answers are counted in Community Intelligence. Never sold.' },
  { id: 'marketing', label: 'Hear about future events and programs', detail: 'Organizers you joined can invite you to what happens next.' },
  { id: 'sharePartners', label: 'Share my contact with cause and sponsor partners', detail: 'Off by default. Partners otherwise see counts only.' },
  { id: 'showOnLeaderboards', label: 'Show my name on team and challenge leaderboards', detail: 'First name and last initial only.' },
];

const USES = [
  ['Run the event', 'Name, email, emergency contact, waiver, shirt size', 'Organizer and registration provider'],
  ['Improve the event', 'Survey answers, ZIP code, how you heard about it', 'Organizer, as counts and themes'],
  ['Passport', 'Events, miles, badges, causes, teams', 'You, and organizers of events you join'],
  ['Follow-up', 'Interests you chose, event history', 'Organizers you joined, via HubSpot, only if you opt in'],
  ['Sponsor and cause reports', 'Counts and percentages', 'Sponsors and beneficiaries, no contact details without consent'],
];

export default function Privacy() {
  const { state, dispatch } = useStore();
  const pv = state.passport.privacy;

  return (
    <div className="stack-lg fade-in">
      <header className="page-head">
        <div className="eyebrow">Privacy and consent</div>
        <h1>Community intelligence, not surveillance</h1>
        <p className="lede">EventOS learns what a community needs from what people choose to share. It never guesses at who they are.</p>
      </header>

      <div className="grid-2">
        <Card title={`Your choices · ${state.passport.name}`}>
          {CHOICES.map((c) => (
            <label key={c.id} className="toggle-row" htmlFor={'pv-' + c.id}>
              <input id={'pv-' + c.id} type="checkbox" checked={Boolean(pv[c.id])} onChange={(e) => { dispatch({ type: 'setPassportPrivacy', patch: { [c.id]: e.target.checked } }); dispatch({ type: 'toast', message: 'Privacy choice saved' }); }} />
              <span className="min0"><span className="tt">{c.label}</span><span className="why" style={{ display: 'block' }}>{c.detail}</span></span>
            </label>
          ))}
          <p className="small muted" style={{ marginTop: 10 }}>Every change is stored as a consent record with a timestamp, and takes effect on the next data sync.</p>
        </Card>
        <Card title="What EventOS never infers">
          <ul className="bullets">
            <li>Health conditions</li>
            <li>Race or ethnicity</li>
            <li>Religion</li>
            <li>Political views</li>
            <li>Sexual orientation, gender identity or other sensitive traits</li>
          </ul>
          <p className="small" style={{ marginTop: 12 }}>A health screening at a wellness village is counted (how many people were screened), but results stay with the health partner. Faith-based or Greek-letter organizations are recorded as the host or referral group they are, never as a trait of a participant.</p>
        </Card>
      </div>

      <Card title="How data is used">
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Purpose</th><th>Data</th><th>Who sees it</th></tr></thead>
            <tbody>{USES.map(([p, d, w]) => <tr key={p}><td style={{ fontWeight: 600 }}>{p}</td><td className="muted">{d}</td><td className="muted">{w}</td></tr>)}</tbody>
          </table>
        </div>
      </Card>

      <div className="grid">
        {[
          ['Consent', 'Analytics, marketing and partner sharing are separate choices.'],
          ['Transparency', 'Participants can see what is held in their Passport.'],
          ['Purpose limitation', 'Data collected to run an event is used for that event and the follow-ups people chose.'],
          ['Minimum necessary', 'Intelligence views use ZIP and counts, not names or emails.'],
          ['Clear settings', 'Choices live in the Passport, in plain language.'],
        ].map(([t, d]) => (
          <div key={t} className="card"><h3>{t}</h3><p className="small muted" style={{ marginTop: 4 }}>{d}</p></div>
        ))}
      </div>
    </div>
  );
}
