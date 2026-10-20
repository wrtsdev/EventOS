import { FOUR_WS } from '../domain/fourW.js';
import { STATUS } from '../domain/blueprint.js';
import { SAFETY_NOTE } from '../copilot/engine.js';
import Icon from './Icon.jsx';

export function Ring({ value, max = 100, size = 112, stroke = 11, label, caption, tone }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, value / max));
  const color = tone === 'good' ? 'var(--good)' : tone === 'warn' ? 'var(--warn)' : tone === 'bad' ? 'var(--bad)' : 'var(--accent)';
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`${caption ?? ''} ${label ?? value}`}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * frac} ${c}`} />
      </svg>
      <div className="ring-label">
        <div>
          <div className="ring-value" style={{ fontSize: size * 0.3 }}>{label ?? value}</div>
          {caption && <div className="ring-cap">{caption}</div>}
        </div>
      </div>
    </div>
  );
}

export function readinessTone(score) {
  return score >= 85 ? 'good' : score >= 60 ? 'warn' : 'bad';
}

export function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

export function StatusPill({ status }) {
  const s = STATUS[status] ?? STATUS.attention;
  return <span className={`pill ${s.tone}`}>{s.label}</span>;
}

export function WChip({ id }) {
  const w = FOUR_WS[id];
  if (!w) return null;
  return <span className={`wchip ${id}`}>{w.name}</span>;
}

export function Bars({ rows, format = (v) => v, max }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <span className="bl" title={r.label}>{r.label}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${(r.value / top) * 100}%`, background: r.color }} /></span>
          <span className="bv">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function Columns({ values, labels, ghost = [] }) {
  const all = [...values, ...ghost];
  const top = Math.max(1, ...all);
  return (
    <div>
      <div className="cols">
        {values.map((v, i) => (
          <div className="col" key={'v' + i}>
            <span className="v">{v}</span>
            <span className="b" style={{ height: `${(v / top) * 82}%` }} />
          </div>
        ))}
        {ghost.map((v, i) => (
          <div className="col" key={'g' + i}>
            <span className="v muted">{v}</span>
            <span className="b ghost" style={{ height: `${(v / top) * 82}%` }} />
          </div>
        ))}
      </div>
      <div className="col-labels">{labels.map((l) => <span key={l}>{l}</span>)}</div>
    </div>
  );
}

export function Progress({ value }) {
  return <div className="progress"><span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} /></div>;
}

export function SafetyNote({ text = SAFETY_NOTE }) {
  return (
    <div className="note" role="note">
      <Icon name="alert" size={18} style={{ color: 'var(--warn)', flex: 'none' }} />
      <span><strong>Verify locally.</strong> {text.replace(/^Informational only\. /, '')}</span>
    </div>
  );
}

export function Card({ title, aside, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || aside) && (
        <div className="card-head">
          {title && <h3>{title}</h3>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function SectionTitle({ eyebrow, title, aside }) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
      </div>
      {aside}
    </div>
  );
}

export function formatDate(iso, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!iso) return 'Date to be set';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', opts);
}

export function daysUntil(iso, today = new Date()) {
  if (!iso) return null;
  const d = new Date(iso + 'T12:00:00');
  return Math.round((d - today) / 86400000);
}

export const PHASES = [
  { id: 'planning', label: 'Plan', sub: 'Blueprint and readiness' },
  { id: 'live', label: 'Registration open', sub: 'Promote and prepare' },
  { id: 'complete', label: 'Event day done', sub: 'Results are in' },
  { id: 'impact', label: 'Impact', sub: 'Report and next steps' },
];

export function phaseTone(phase) {
  return phase === 'complete' ? 'good' : phase === 'live' ? 'warn' : 'neutral';
}
export function phaseLabel(phase) {
  return phase === 'complete' ? 'Completed' : phase === 'live' ? 'Registration open' : 'Planning';
}
