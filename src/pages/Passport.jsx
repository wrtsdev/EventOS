import { useStore } from '../store.jsx';
import { FOUR_W_LIST } from '../domain/fourW.js';
import { Card, Bars, WChip, Progress, formatDate } from '../components/ui.jsx';

export default function Passport() {
  const { state, navigate } = useStore();
  const pp = state.passport;
  const miles = pp.events.reduce((a, e) => a + e.miles, 0);
  const wCounts = FOUR_W_LIST.map((w) => ({ label: w.name, value: pp.events.filter((e) => e.fourWs.includes(w.id)).length, color: `var(--w-${w.id})` }));

  return (
    <div className="stack-lg fade-in">
      <header className="page-head">
        <div className="eyebrow">Participant view · Sample member</div>
        <h1>WRTS Passport</h1>
        <p className="lede">Registration platforms see one transaction. EventOS sees one community member over time, across every organization and event.</p>
      </header>

      <section className="passport">
        <div className="eyebrow">Member since {formatDate(pp.memberSince, { month: 'long', year: 'numeric' })}</div>
        <h2>{pp.name}</h2>
        <div className="pstats">
          <div><div className="v num">{pp.events.length}</div><div className="l">Events completed</div></div>
          <div><div className="v num">{miles.toFixed(1)}</div><div className="l">Miles together</div></div>
          <div><div className="v num">{pp.causes.length}</div><div className="l">Causes supported</div></div>
          <div><div className="v num">{pp.streakMonths} mo</div><div className="l">Community streak</div></div>
        </div>
      </section>

      <div className="grid-2">
        <Card title="Upcoming for you">
          <ul className="list-plain">
            {pp.upcoming.map((u) => (
              <li key={u.eventId} className="stack" style={{ gap: 4 }}>
                <div className="spread">
                  <strong>{u.name}</strong>
                  <WChip id={u.fourW} />
                </div>
                <span className="small muted">{formatDate(u.date)} · {u.why}</span>
                <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => navigate({ name: 'event', eventId: u.eventId, tab: 'page' })}>See event</button>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="4W participation">
          <Bars rows={wCounts} format={(v) => `${v} event${v === 1 ? '' : 's'}`} />
        </Card>
      </div>

      <Card title="Badges">
        <div className="stamps">
          {pp.badges.map((b) => (
            <div key={b.id} className="stamp">
              <div><b>{b.name}</b><small>{formatDate(b.earned, { month: 'short', year: 'numeric' })}</small></div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Event history">
          <ul className="timeline">
            {[...pp.events].reverse().map((e) => (
              <li key={e.id}>
                <div className="spread"><strong>{e.name}</strong><span className="small muted">{formatDate(e.date, { month: 'short', year: 'numeric' })}</span></div>
                <div className="small muted">{e.org} · {e.miles} mi{e.result ? ` · ${e.result}` : ''}{e.role === 'volunteer' ? ' · Volunteered' : ''}</div>
                <div className="row" style={{ gap: 4, marginTop: 4 }}>{e.fourWs.map((w) => <WChip key={w} id={w} />)}</div>
              </li>
            ))}
          </ul>
        </Card>
        <div className="stack">
          <Card title="Challenges">
            <ul className="list-plain">
              {pp.challenges.map((c) => (
                <li key={c.name} className="stack" style={{ gap: 6 }}>
                  <div className="spread small"><strong>{c.name}</strong><span className="muted">{c.detail}</span></div>
                  <Progress value={c.progress} />
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Causes and community">
            <ul className="list-plain small">
              {pp.causes.map((c) => <li key={c.name}><strong>{c.name}</strong><div className="muted">{c.actions.join(' · ')}</div></li>)}
              {pp.volunteerActions.map((v) => <li key={v.what}><strong>Volunteer: {v.what}</strong><div className="muted">{v.event} · {v.hours} hours</div></li>)}
              <li><strong>Teams</strong><div className="muted">{pp.teams.join(', ')}</div></li>
              <li><strong>Referrals</strong><div className="muted">Brought {pp.referrals} people to their first event</div></li>
            </ul>
          </Card>
          <button className="btn btn-secondary" onClick={() => navigate('privacy')}>Manage my privacy choices</button>
        </div>
      </div>
    </div>
  );
}
