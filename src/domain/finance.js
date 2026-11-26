// Economic Vitality engine: budget lines, planned vs actual, break-even,
// scenarios, cash flow, local economic contribution and financial risk flags.
// Cause donations pass through to the beneficiary and are never event revenue.

import { isPhysical, isTimed, expectedCount, volunteerNeed, seeded, roundTo } from './eventBasics.js';
import { sponsorsFor, commitmentFor } from './sponsors.js';

const line = (o) => ({ actual: null, local: false, essential: false, perHead: false, payment: 'unpaid', ...o });

/** Starting budget derived from the event plan. Organizers edit from here. */
export function defaultBudget(event) {
  const n = expectedCount(event);
  const price = Number(event.price ?? 0);
  const physical = isPhysical(event);
  const timed = isTimed(event);
  const f = (id) => event.features?.includes(id);
  const sponsors = sponsorsFor(event);
  const ws = event.fourWs ?? [];
  const lines = [];

  // Revenue
  lines.push(line({ id: 'rev-registration', kind: 'revenue', category: 'Registration', label: 'Registration fees', planned: roundTo(n * price), perHead: true, unit: price }));
  if (sponsors.length) lines.push(line({ id: 'rev-sponsorship', kind: 'revenue', category: 'Sponsorship', label: 'Sponsorships', planned: sponsors.reduce((a, s) => a + (Number(s.amount) || 0), 0) }));
  if (f('shirts')) lines.push(line({ id: 'rev-merch', kind: 'revenue', category: 'Merchandise', label: 'Merchandise sales', planned: roundTo(n * 0.16 * 25), perHead: true, unit: 0.16 * 25 }));
  if (physical && n >= 150) lines.push(line({ id: 'rev-vendor-fees', kind: 'revenue', category: 'Vendor fees', label: 'Vendor and exhibitor fees', planned: 450 }));

  // Expenses
  if (physical) {
    lines.push(line({ id: 'exp-permits', kind: 'expense', category: 'Safety and approvals', label: 'Permits and city fees', planned: 350, local: true, essential: true, minimum: 350, vendor: 'City special events office', dueWeeks: 10 }));
    lines.push(line({ id: 'exp-insurance', kind: 'expense', category: 'Safety and approvals', label: 'Event insurance', planned: n > 500 ? 900 : 600, essential: true, minimum: 600, vendor: 'Event insurer', dueWeeks: 8 }));
    const ems = timed || n > 300 ? 1200 : 450;
    lines.push(line({ id: 'exp-ems', kind: 'expense', category: 'Safety and approvals', label: 'EMS and first aid', planned: ems, local: true, essential: true, minimum: ems, vendor: 'County EMS standby', dueWeeks: 4 }));
    if (timed || n >= 300) lines.push(line({ id: 'exp-police', kind: 'expense', category: 'Safety and approvals', label: 'Police and traffic control', planned: 1500, local: true, essential: true, minimum: 1200, vendor: 'Police special-duty detail', dueWeeks: 4 }));
    lines.push(line({ id: 'exp-venue', kind: 'expense', category: 'Site and logistics', label: 'Tents, tables and rentals', planned: 1200, local: true, vendor: 'Main Street Rentals', dueWeeks: 6 }));
    lines.push(line({ id: 'exp-restrooms', kind: 'expense', category: 'Site and logistics', label: 'Portable restrooms', planned: Math.max(1, Math.ceil(n / 150)) * 175, local: true, vendor: 'Tri-County Sanitation', dueWeeks: 3 }));
    lines.push(line({ id: 'exp-sound', kind: 'expense', category: 'Site and logistics', label: 'Sound and DJ', planned: 500, local: true, vendor: 'DJ Reese Sound', dueWeeks: 3 }));
    lines.push(line({ id: 'exp-water', kind: 'expense', category: 'Site and logistics', label: 'Water and ice', planned: roundTo(n * 0.6), local: true, perHead: true, unit: 0.6, vendor: 'Corner Market Grocery', dueWeeks: 1 }));
  }
  if (timed) lines.push(line({ id: 'exp-timing', kind: 'expense', category: 'Race operations', label: 'Race timing', planned: roundTo(900 + n * 1.5), vendor: 'Timing provider', dueWeeks: 6 }));
  if (f('shirts')) lines.push(line({ id: 'exp-shirts', kind: 'expense', category: 'Participant experience', label: 'Event shirts', planned: roundTo(n * 7.5), local: true, perHead: true, unit: 7.5, vendor: 'Eastside Screen Print', dueWeeks: 4 }));
  if (f('shirts')) lines.push(line({ id: 'exp-merch', kind: 'expense', category: 'Participant experience', label: 'Merchandise inventory', planned: roundTo(n * 0.16 * 25 * 0.55), perHead: true, unit: 0.16 * 25 * 0.55, vendor: 'Eastside Screen Print', local: true, dueWeeks: 4 }));
  if (f('medals')) lines.push(line({ id: 'exp-medals', kind: 'expense', category: 'Participant experience', label: 'Finisher medals', planned: roundTo(n * 4.5), perHead: true, unit: 4.5, vendor: 'Medal supplier', dueWeeks: 6 }));
  if (!physical) lines.push(line({ id: 'exp-shipping', kind: 'expense', category: 'Participant experience', label: 'Shipping swag to participants', planned: roundTo(n * 6), perHead: true, unit: 6, dueWeeks: 1 }));
  lines.push(line({ id: 'exp-volunteers', kind: 'expense', category: 'People', label: 'Volunteer meals and supplies', planned: volunteerNeed(event) * 12, local: true, vendor: 'Neighborhood caterer', dueWeeks: 1 }));
  if (ws.includes('work')) lines.push(line({ id: 'exp-youth-wages', kind: 'expense', category: 'People', label: 'Youth event-crew wages', planned: 4 * 6 * 15, local: true, essential: false, vendor: 'Payroll (paid youth crew)', dueWeeks: 0 }));
  if (ws.length) lines.push(line({ id: 'exp-4w', kind: 'expense', category: '4W programming', label: '4W programming materials', planned: 300 * ws.length, local: true, vendor: 'Local partners', dueWeeks: 2 }));
  lines.push(line({ id: 'exp-marketing', kind: 'expense', category: 'Promotion', label: 'Marketing and printing', planned: 400, vendor: 'Print and digital ads', dueWeeks: 8 }));
  if (price > 0) lines.push(line({ id: 'exp-processing', kind: 'expense', category: 'Registration', label: 'Registration and payment processing', planned: roundTo(n * price * 0.06), perHead: true, unit: price * 0.06, vendor: 'Registration provider', dueWeeks: 0 }));

  return { lines, contingencyPct: 10, revenueGoal: event.revenueGoal ?? null };
}

export function budgetFor(event) {
  return event.budget ?? defaultBudget(event);
}

/** Planned expense total including contingency, used by simulations. */
export function plannedExpense(event) {
  const b = budgetFor(event);
  const sum = b.lines.filter((l) => l.kind === 'expense').reduce((a, l) => a + l.planned, 0);
  return Math.round(sum * (1 + (b.contingencyPct ?? 0) / 100));
}

/** Actual for a line: entered value, else derived from event data where it exists. */
function deriveActual(event, l, sim) {
  if (l.actual != null) return { value: l.actual, source: 'entered' };
  if (!sim || event.phase === 'planning') return { value: null, source: null };
  if (l.id === 'rev-registration') return { value: sim.revenue.registration, source: 'registration provider (demo data)' };
  if (l.id === 'rev-merch') return { value: sim.revenue.merchandise, source: 'store sales (demo data)' };
  if (l.id === 'rev-sponsorship') {
    const paid = sponsorsFor(event).filter((s) => commitmentFor(event, s) === 'paid').reduce((a, s) => a + (Number(s.amount) || 0), 0);
    return { value: paid, source: 'sponsor payments received' };
  }
  if (event.phase === 'complete') {
    const n = sim.registered || 1;
    const scale = l.perHead ? n / Math.max(1, expectedCount(event)) : 1;
    const drift = 0.92 + seeded(event.id + l.id) * 0.2;
    return { value: roundTo(l.planned * scale * drift), source: 'demo actuals' };
  }
  if (l.kind === 'expense' && (l.payment === 'paid' || l.payment === 'deposit')) {
    return { value: l.payment === 'paid' ? l.planned : roundTo(l.planned / 2), source: l.payment === 'paid' ? 'paid in full' : 'deposit paid' };
  }
  return { value: null, source: null };
}

function paymentFor(event, l) {
  if (l.kind !== 'expense') return null;
  if (l.paymentSet) return l.payment;
  if (event.phase === 'complete') return 'paid';
  if (event.phase === 'live' || event.phase === 'eventday') return (l.dueWeeks ?? 0) >= 4 ? 'paid' : (l.dueWeeks ?? 0) >= 2 ? 'deposit' : 'unpaid';
  return (l.dueWeeks ?? 0) >= 8 ? 'deposit' : 'unpaid';
}

const SCENARIO_FILLS = [
  { id: 'low', label: 'Low turnout', fill: 0.6 },
  { id: 'expected', label: 'At goal', fill: 1 },
  { id: 'high', label: 'Strong turnout', fill: 1.2 },
];

/**
 * Full financial view.
 * @param {object} event
 * @param {object} [sim] simulateEvent output (registration, payments)
 */
export function financeView(event, sim) {
  const budget = budgetFor(event);
  const n = Math.max(1, expectedCount(event));
  const cap = Number(event.cap) || Infinity;
  const lines = budget.lines.map((l) => {
    const withPay = { ...l, payment: paymentFor(event, l) ?? l.payment };
    const a = deriveActual(event, withPay, sim);
    return { ...withPay, actualValue: a.value, actualSource: a.source };
  });
  const rev = lines.filter((l) => l.kind === 'revenue');
  const exp = lines.filter((l) => l.kind === 'expense');
  const sum = (arr, k) => arr.reduce((a, l) => a + (l[k] ?? 0), 0);
  const contingency = Math.round(sum(exp, 'planned') * (budget.contingencyPct ?? 0) / 100);

  const planned = { revenue: sum(rev, 'planned'), expense: sum(exp, 'planned'), contingency };
  planned.net = planned.revenue - planned.expense - contingency;

  const hasActuals = lines.some((l) => l.actualValue != null);
  const actual = hasActuals
    ? {
        revenue: rev.reduce((a, l) => a + (l.actualValue ?? 0), 0),
        expense: exp.reduce((a, l) => a + (l.actualValue ?? 0), 0),
      }
    : null;
  if (actual) actual.net = actual.revenue - actual.expense;

  // Break-even
  const fixedExp = exp.filter((l) => !l.perHead).reduce((a, l) => a + l.planned, 0) + contingency;
  const varExpPerHead = exp.filter((l) => l.perHead).reduce((a, l) => a + (l.unit ?? l.planned / n), 0);
  const fixedRev = rev.filter((l) => !l.perHead).reduce((a, l) => a + l.planned, 0);
  const revPerHead = rev.filter((l) => l.perHead).reduce((a, l) => a + (l.unit ?? l.planned / n), 0);
  const perHeadMargin = revPerHead - varExpPerHead;
  let breakEven;
  if (fixedRev >= fixedExp && perHeadMargin >= 0) breakEven = 0;
  else if (perHeadMargin <= 0) breakEven = null; // never breaks even by adding people
  else breakEven = Math.ceil((fixedExp - fixedRev) / perHeadMargin);

  const scenarios = SCENARIO_FILLS.map((s) => {
    const people = Math.min(cap, Math.round(n * s.fill));
    const revenue = Math.round(fixedRev + revPerHead * people);
    const expense = Math.round(fixedExp + varExpPerHead * people);
    return { ...s, people, revenue, expense, net: revenue - expense };
  });

  // Cash flow checkpoints (weeks before event; negative = after)
  const checkpoints = [12, 8, 4, 1, 0, -2];
  const regShare = { 12: 0, 8: 0.1, 4: 0.45, 1: 0.85, 0: 1, '-2': 1 };
  const sponsorTotal = rev.find((l) => l.id === 'rev-sponsorship')?.planned ?? 0;
  const cashflow = checkpoints.map((w) => {
    const out = exp.filter((l) => (l.dueWeeks ?? 0) >= w).reduce((a, l) => a + l.planned, 0);
    const regRev = (rev.find((l) => l.id === 'rev-registration')?.planned ?? 0) * regShare[w];
    const spon = w <= 6 ? (w <= 0 ? sponsorTotal : sponsorTotal / 2) : 0;
    const other = w <= 0 ? rev.filter((l) => !['rev-registration', 'rev-sponsorship'].includes(l.id)).reduce((a, l) => a + l.planned, 0) : 0;
    return { week: w, label: w > 0 ? `${w} wk before` : w === 0 ? 'Event day' : `${-w} wk after`, cash: Math.round(regRev + spon + other - out) };
  });
  const lowPoint = Math.min(...cashflow.map((c) => c.cash));

  // Local economic contribution (tracked separately from total spend)
  const localLines = exp.filter((l) => l.local);
  const localValue = (l) => l.actualValue ?? l.planned;
  const localSpend = localLines.reduce((a, l) => a + localValue(l), 0);
  const totalSpend = exp.reduce((a, l) => a + localValue(l), 0);
  const localVendors = [...new Set(localLines.map((l) => l.vendor).filter(Boolean))];

  // Payments
  const payments = sim?.payments ?? null;

  // Flags
  const flags = [];
  for (const l of exp.filter((x) => x.essential)) {
    if (l.minimum != null && l.planned < l.minimum) {
      flags.push({ id: 'essential-' + l.id, severity: 'critical', epic: 'P', title: `${l.label} is below the safe minimum`, detail: `Planned ${fmt(l.planned)}; at least ${fmt(l.minimum)} is needed. Cutting essential safety or staffing spend to balance the budget puts participants at risk.` });
    }
  }
  if (planned.net < 0) flags.push({ id: 'deficit', severity: 'warn', epic: 'E', title: 'Budget runs a deficit at your registration goal', detail: `Planned net ${fmt(planned.net)}. Add sponsorship, adjust price, or trim non-essential lines.` });
  else if (scenarios[0].net < 0) flags.push({ id: 'low-scenario', severity: 'info', epic: 'E', title: 'Low turnout would lose money', detail: `At ${scenarios[0].people} people the event nets ${fmt(scenarios[0].net)}. Break-even is ${breakEven ?? 'not reachable'} people.` });
  if ((budget.contingencyPct ?? 0) < 5) flags.push({ id: 'contingency', severity: 'warn', epic: 'E', title: 'Contingency below 5%', detail: 'Keep at least 5–10% for weather, price changes and surprises.' });
  // Per-participant lines are compared with a budget flexed to actual turnout,
  // so more participants is not reported as an overrun.
  const flex = event.phase === 'complete' && sim?.registered ? sim.registered / n : 1;
  const flexed = (l) => (l.perHead ? l.planned * flex : l.planned);
  for (const l of lines.filter((x) => x.actualValue != null && x.kind === 'expense' && x.actualValue > flexed(x) * 1.1)) {
    flags.push({ id: 'overrun-' + l.id, severity: 'warn', epic: 'E', title: `${l.label} is over budget`, detail: `${fmt(l.actualValue)} actual vs ${fmt(flexed(l))} ${l.perHead ? 'budgeted for actual turnout' : 'planned'} (+${Math.round((l.actualValue / flexed(l) - 1) * 100)}%).` });
  }
  if (sim && event.phase === 'live' && sim.goal && sim.registered / sim.goal < 0.75) {
    const reg = rev.find((l) => l.id === 'rev-registration');
    flags.push({ id: 'shortfall', severity: 'warn', epic: 'E', title: 'Registration revenue is behind plan', detail: `${sim.registered} of ${sim.goal} registered. At this pace registration brings about ${fmt(Math.round((reg?.planned ?? 0) * (sim.registered / sim.goal) * 1.15))} of ${fmt(reg?.planned ?? 0)} planned.` });
  }
  if (payments?.pending > 0) flags.push({ id: 'payments', severity: event.phase === 'complete' ? 'info' : 'warn', epic: 'E', title: `${payments.pending} registrations stuck on failed payments`, detail: `${fmt(payments.pending * Number(event.price ?? 0))} is not yet collected. These people are not counted as registered until payment succeeds.` });
  if (lowPoint < 0) flags.push({ id: 'cash', severity: 'info', epic: 'E', title: `You need about ${fmt(-lowPoint)} up front`, detail: 'Deposits come due before most registration money arrives. Ask sponsors for early payment or a fiscal sponsor for a short advance.' });

  return {
    lines,
    flex,
    revenueLines: rev,
    expenseLines: exp,
    contingencyPct: budget.contingencyPct ?? 0,
    planned,
    actual,
    breakEven,
    perHeadMargin,
    scenarios,
    cashflow,
    lowPoint,
    local: { spend: localSpend, share: totalSpend ? localSpend / totalSpend : 0, vendors: localVendors, basis: actual ? 'actual where entered' : 'planned' },
    payments,
    flags,
    essentialAtRisk: flags.some((f) => f.severity === 'critical'),
    approved: event.checklist?.budget === 'done',
    edited: Boolean(event.budget),
  };
}

function fmt(n) {
  return (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
}

/** Immutable line update helper used by the UI and tests. */
export function updateLine(event, lineId, patch) {
  const b = budgetFor(event);
  return { ...b, lines: b.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) };
}
