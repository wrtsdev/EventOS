// EventOS Copilot. The prototype ships a local rules provider that answers
// from the event's own data. The provider interface lets a hosted language
// model (or an MCP-connected agent) replace it later with the same context.

import { readiness, commsTimeline, buildBlueprint, volunteerNeed, isPhysical } from '../domain/blueprint.js';
import { epicScore, EPIC_ORDER, EPIC_DOMAINS } from '../domain/epic.js';
import { applicableChecklist } from '../domain/controls.js';
import { financeView } from '../domain/finance.js';
import { workforceSummary } from '../domain/workforce.js';
import { commsSummary } from '../domain/comms.js';
import { outcomesView } from '../domain/civic.js';
import { SPONSOR_PACKAGES, fulfillment } from '../domain/sponsors.js';
import { draftAAR } from '../domain/aar.js';
import { FOUR_WS } from '../domain/fourW.js';
import { getEventType } from '../domain/catalog.js';
import { formatMoney, pct } from '../domain/metrics.js';

export const SAFETY_NOTE =
  'Informational only. Permit, legal, insurance, medical and safety requirements vary by city, county and venue. Confirm with your local permitting office, insurer, and EMS provider.';

export const SUGGESTED_QUESTIONS = [
  'Is my event ready?',
  'What do I still need to complete?',
  'What is hurting registration?',
  'Which participants should I invite back?',
  'Which sponsor performed best?',
  'What should I charge next year?',
  'What community interest appeared in surveys?',
  'What should our next event be?',
  'Build my 5K event plan',
  'Create my participant communication timeline',
  'What permits might I need?',
  'Which EPIC controls apply to this event?',
  'Where are the bottlenecks?',
  'Summarize this event',
  'Draft a sponsor package',
  'Draft my after-action review',
];

/** Answers built only from records vs. recommendations a person must judge. */
const BASIS = {
  ready: 'data', todo: 'data', registration: 'data', invite: 'data', sponsor: 'data', interest: 'data', value: 'data',
  epic: 'data', bottleneck: 'data', summary: 'data',
  plan: 'suggestion', comms: 'suggestion', permits: 'suggestion', price: 'suggestion', next: 'suggestion', sponsorPackage: 'suggestion', aar: 'suggestion', help: 'data',
};

export const GUARDRAILS = 'The assistant can suggest and summarize. It cannot approve safety plans, send messages, make payments or change your event. A person with the right role does those.';

const has = (q, ...words) => words.some((w) => q.includes(w));

const INTENTS = [
  { id: 'aar', test: (q) => has(q, 'after-action', 'after action', 'aar', 'debrief', 'lessons') },
  { id: 'sponsorPackage', test: (q) => has(q, 'package', 'sponsor deck', 'sponsor proposal') },
  { id: 'epic', test: (q) => has(q, 'epic', 'control') },
  { id: 'bottleneck', test: (q) => has(q, 'bottleneck', 'stuck', 'slowing', 'behind') },
  { id: 'summary', test: (q) => has(q, 'summar', 'overview', 'how is', 'how are we doing') },
  { id: 'permits', test: (q) => has(q, 'permit', 'insurance', 'ems', 'legal', 'safety', 'police', 'medical', 'waiver') },
  { id: 'comms', test: (q) => has(q, 'communication', 'timeline', 'email', 'emails', 'message') },
  { id: 'plan', test: (q) => has(q, 'plan', 'build my', 'schedule') && !has(q, 'next event') },
  { id: 'todo', test: (q) => has(q, 'still need', 'missing', 'to do', 'todo', 'left', 'complete') },
  { id: 'ready', test: (q) => has(q, 'ready', 'readiness', 'on track') },
  { id: 'registration', test: (q) => has(q, 'registration', 'signup', 'sign-up', 'sign up', 'funnel', 'hurting') },
  { id: 'invite', test: (q) => has(q, 'invite', 'come back', 'return', 'retention', 'loyal') },
  { id: 'sponsor', test: (q) => has(q, 'sponsor') },
  { id: 'price', test: (q) => has(q, 'charge', 'price', 'pricing', 'fee', 'cost') },
  { id: 'interest', test: (q) => has(q, 'survey', 'interest', 'feedback', 'dislike', 'said', 'need') },
  { id: 'next', test: (q) => has(q, 'next event', 'next year', 'what should we do next', 'what next') },
  { id: 'value', test: (q) => has(q, 'plv', 'lifetime', 'value', 'worth', 'economic') },
];

export function detectIntent(question) {
  const q = question.toLowerCase();
  return INTENTS.find((i) => i.test(q))?.id ?? 'help';
}

/** @param {{event:any, sim:any, org:any}} ctx */
export function localRulesProvider(ctx) {
  return {
    id: 'local-rules',
    label: 'Prototype answers from your event data',
    async answer(question) {
      const intent = detectIntent(question);
      return { intent, basis: BASIS[intent] ?? 'suggestion', ...(HANDLERS[intent] ?? HANDLERS.help)(ctx) };
    },
  };
}

const p = (text) => ({ type: 'p', text });
const list = (items) => ({ type: 'list', items });

const HANDLERS = {
  ready({ event }) {
    const r = readiness(event);
    const blocks = [p(`${event.name} is ${r.score}% ready. ${r.done} of ${r.items.length} items are complete.`)];
    if (r.blocking.length) blocks.push(p('Blocking right now:'), list(r.blocking.map((i) => `${i.label}: ${i.help}`)));
    if (r.attention.length) blocks.push(p('Needs attention:'), list(r.attention.map((i) => i.label)));
    if (!r.blocking.length && !r.attention.length) blocks.push(p('Everything on your checklist is complete. Focus on registration and your race-week messages.'));
    return { title: 'Event readiness', blocks, disclaimer: r.blocking.some((i) => i.informational) ? SAFETY_NOTE : null, link: { label: 'Open checklist', tab: 'blueprint' } };
  },
  todo({ event }) {
    const r = readiness(event);
    const sorted = [...r.missing].sort((a, b) => (a.status === 'blocking' ? -1 : 1) - (b.status === 'blocking' ? -1 : 1) || b.due - a.due);
    return {
      title: 'What is left',
      blocks: sorted.length
        ? [p(`${sorted.length} items remain, most urgent first:`), list(sorted.map((i) => `${i.label} (${i.owner}, usually ${i.due} days before). ${i.status === 'blocking' ? 'Blocking.' : ''}`))]
        : [p('Nothing left on the checklist.')],
      disclaimer: sorted.some((i) => i.informational) ? SAFETY_NOTE : null,
      link: { label: 'Open checklist', tab: 'blueprint' },
    };
  },
  registration({ sim, event }) {
    if (!sim.registered) {
      return { title: 'Registration', blocks: [p('Registration has not opened yet. When it does, EventOS will show where people drop off between viewing your page and paying.'), p('Before you open: set an early price, give team captains a link, and ask your cause partner to share the page.')] };
    }
    if (!sim.funnel.length) {
      return { title: 'Registration', blocks: [p(`${sim.registered} of ${sim.goal} registered (${pct(sim.goal ? sim.registered / sim.goal : 0)}).${sim.payments?.pending ? ` ${sim.payments.pending} people started paying but did not finish.` : ''}`), p('Page views are not tracked yet, so EventOS cannot show where visitors drop off. Share the public page with team captains and partners, and follow up on unfinished payments.')], link: { label: 'Open Command Center', tab: 'overview' } };
    }
    const f = sim.funnel;
    const step = f.findIndex((s) => s.stage === sim.leakStage);
    const rate = step > 0 ? f[step].count / f[step - 1].count : 0;
    const fixes = sim.leakStage === 'Reached payment'
      ? ['Shorten the form: ask only name, email, ZIP, shirt size and waiver up front.', 'Move optional questions (team, donation) after the required fields.', 'Show the total price and what it includes on the first screen.']
      : ['Remind people what they get before payment: shirt, cause impact, resource village.', 'Offer a family or group price.', 'Make sure the donation step is optional and skippable.'];
    return {
      title: 'What is hurting registration',
      blocks: [
        p(`${sim.registered} of ${sim.goal} registered (${pct(sim.registered / sim.goal)}). Page-to-registration conversion is ${pct(sim.conversionRate, 1)}.`),
        p(`The biggest in-form drop is from "${sim.leakFrom}" to "${sim.leakStage}": only ${pct(rate)} continue.`),
        list(fixes),
        p(`Referrals brought ${sim.referrals} registrations. ${sim.referralGroups[0] ? `${sim.referralGroups[0].group} are your strongest referrers; give them a team challenge.` : ''}`),
      ],
      link: { label: 'Open Community Intelligence', tab: 'intelligence' },
    };
  },
  invite({ sim, event }) {
    if (!sim.registered) return { title: 'Who to invite back', blocks: [p('Once people register and attend, EventOS will flag who is likely to return and who agreed to hear from you.')] };
    const consented = sim.participants.filter((x) => x.consent.marketing);
    const likely = consented.filter((x) => x.likelyReturn);
    const champions = consented.filter((x) => x.returning && x.referredBy);
    return {
      title: 'Who to invite back',
      blocks: [
        p(`${likely.length} participants are likely to return and agreed to hear from you.`),
        list([
          `${champions.length} returning participants who also brought someone. Invite them first and ask them to captain a team.`,
          `${consented.filter((x) => x.walkingClubInterest).length} asked for a regular walking group.`,
          `${consented.filter((x) => x.causeAction).length} took a cause action for ${event.cause || 'your cause'}.`,
        ]),
        p(`${sim.participants.length - consented.length} participants did not opt in to messages and are not included.`),
      ],
      link: { label: 'Open Impact Report', tab: 'impact' },
    };
  },
  sponsor({ sim }) {
    if (!sim.sponsors.length) return { title: 'Sponsors', blocks: [p('This event has no sponsors yet. Add sponsor visibility in the Event Builder to see suggested partners for your 4W focus.')] };
    if (sim.live) return { title: 'Sponsor performance', blocks: [p('Sponsor visibility (impressions, booth visits, promo codes, survey recall) is not tracked yet for live events. Track each sponsor\u2019s deliverables in Sponsors so renewals rest on what was delivered.')], link: { label: 'Open sponsors', tab: 'sponsors' } };
    const ranked = [...sim.sponsors].sort((a, b) => b.boothVisits + b.registrations * 3 - (a.boothVisits + a.registrations * 3));
    const top = ranked[0];
    return {
      title: 'Sponsor performance',
      blocks: [
        p(`${top.name} performed best.`),
        list([
          `${top.impressions.toLocaleString()} impressions and ${top.clicks} clicks`,
          `${top.registrations} registrations and ${top.promoRedemptions} promo code uses`,
          `${top.boothVisits} booth visits${top.surveyRecall != null ? `, ${pct(top.surveyRecall)} survey recall` : ''}`,
          `Reached ${top.zipsReached} of your participant ZIP codes`,
        ]),
        p('Bring these numbers to the renewal conversation rather than a logo count.'),
      ],
      link: { label: 'Open SponsorOS', tab: 'sponsors' },
    };
  },
  price({ sim, event }) {
    const price = Number(event.price ?? 0);
    const fill = sim.registered / sim.goal;
    const perHead = sim.registered ? (sim.revenue.costs / sim.registered) : null;
    const rec = fill >= 0.95 ? price + 5 : fill >= 0.8 ? price : Math.max(0, price - 5);
    return {
      title: 'Pricing next year',
      blocks: [
        p(`This year: ${formatMoney(price)} per participant. Fill rate ${sim.registered ? pct(fill) : 'not yet known'}.${perHead ? ` Cost per participant about ${formatMoney(perHead)}.` : ''}`),
        p(`Suggested standard price: ${formatMoney(rec)}.`),
        list([
          `Early registration: ${formatMoney(Math.max(0, rec - 10))} for returning Passport members`,
          `Family or group of 4: ${formatMoney(rec * 3)}`,
          'Keep a free or pay-what-you-can option sponsored by a partner so price never keeps a neighbor out.',
        ]),
      ],
    };
  },
  interest({ sim }) {
    if (!sim.needs.length) return { title: 'Community interest', blocks: [p('Survey results appear after the event. EventOS drafts survey questions from your 4W goals so you learn what people want next.')], link: { label: 'Open Blueprint', tab: 'blueprint' } };
    return {
      title: 'What the community asked for',
      blocks: [
        p(`From ${sim.impact.surveyResponses} survey responses:`),
        list(sim.needs.slice(0, 4).map((n) => `${n.need}: ${n.mentions} mentions (${FOUR_WS[n.fourW].name})`)),
        p('Top things to fix:'),
        list(sim.feedback.filter((f) => f.sentiment === 'negative').slice(0, 2).map((f) => `${f.theme} (${f.mentions} mentions)`)),
      ],
      link: { label: 'Open Community Intelligence', tab: 'intelligence' },
    };
  },
  next({ sim, event }) {
    const need = sim.needs[0];
    const w = need ? FOUR_WS[need.fourW] : FOUR_WS[event.fourWs?.[0] ?? 'wellness'];
    return {
      title: 'Your next event',
      blocks: [
        p(need ? `Your community asked for a ${need.need.toLowerCase()} (${need.mentions} mentions). That points to a ${w.name} experience.` : `Build on your ${w.name} focus.`),
        list([
          `${w.name}: ${w.prompt}`,
          `Format: a monthly 1-mile community walk followed by a short ${w.name.toLowerCase()} session`,
          `Partners: ${w.partners.slice(0, 3).join(', ')}`,
          `Invite first: the ${sim.likelyReturn || 'returning'} participants likely to return`,
        ]),
      ],
      link: { label: 'Start a new event', view: 'builder' },
    };
  },
  plan({ event }) {
    const type = getEventType(event.typeId);
    const bp = buildBlueprint(event);
    return {
      title: `Your ${type.label} plan`,
      blocks: [
        p(`${event.name}: ${bp.experience.distance}, ${bp.experience.format.toLowerCase()}, about ${bp.experience.expected} people.`),
        { type: 'steps', items: [
          { when: '12–10 weeks out', text: 'Confirm date and venue. Apply for permits. Choose a registration provider and open a draft page.' },
          { when: '10–8 weeks out', text: `Book ${type.timed ? 'a timing company, ' : ''}insurance and first aid. Confirm your beneficiary agreement.` },
          { when: '8–6 weeks out', text: 'Open registration. Announce. Recruit team captains and sponsors with a clear activation for each.' },
          { when: '6–3 weeks out', text: `Confirm vendors, shirts and medals. Recruit about ${volunteerNeed(event)} volunteers.` },
          { when: '2 weeks out', text: 'Assign volunteer roles. Walk the course. Finalize the emergency and weather plan.' },
          { when: 'Race week', text: 'Know-before-you-go message. Packet pickup. Set up the resource village.' },
          { when: 'After', text: 'Thank you + survey within 24 hours. Impact Report in two weeks. Invite people into what happens next.' },
        ] },
      ],
      disclaimer: isPhysical(event) ? SAFETY_NOTE : null,
      link: { label: 'Open Blueprint', tab: 'blueprint' },
    };
  },
  comms({ event }) {
    return {
      title: 'Participant communication timeline',
      blocks: [{ type: 'steps', items: commsTimeline(event).map((c) => ({ when: c.when, text: `${c.title}. ${c.detail} (${c.channel})` })) }],
    };
  },
  permits({ event }) {
    const physical = isPhysical(event);
    const type = getEventType(event.typeId);
    return {
      title: 'Permits and approvals you may need',
      blocks: physical
        ? [
            p('Common for an in-person walk or run:'),
            list([
              'Special event or park use permit (parks and recreation or city special events office)',
              'Certificate of liability insurance naming the venue or city as additional insured',
              'Route or road-closure approval, and police or certified traffic control at crossings',
              type.timed || Number(event.expected) > 300 ? 'EMS standby or an ambulance at the start/finish' : 'First-aid station and a plan to reach EMS',
              'Food vendor or temporary food permits if anyone serves food',
              'Amplified sound permit if you use a DJ or PA system',
              'Participant waiver reviewed by your insurer or attorney',
            ]),
          ]
        : [p('Virtual events usually do not need permits. You still need a participant waiver and clear guidance that people choose safe routes on their own.')],
      disclaimer: SAFETY_NOTE,
    };
  },
  value({ sim }) {
    return {
      title: 'Economic and community value',
      blocks: [
        p(`Participant Lifetime Value: ${formatMoney(sim.plv.value)}${sim.plv.projected ? ' (projected)' : ''}. Community Lifetime Value: ${formatMoney(sim.clv, { compact: true })}.`),
        p(sim.cvi ? `Community Value Index: ${sim.cvi.value}/100 (${sim.cvi.band}). Weakest areas: ${sim.cvi.weakest.map((w) => w.label.toLowerCase()).join(' and ')}.` : 'The Community Value Index starts measuring once people register.'),
        p('PLV counts only economic contribution. Volunteering and cause engagement are measured in the Community Value Index, never in dollars.'),
      ],
      link: { label: 'Open Value', tab: 'value' },
    };
  },
  epic({ event, sim, org }) {
    const items = applicableChecklist(event, sim, { includeAll: true });
    const sc = epicScore(event, sim, org);
    return {
      title: 'EPIC controls for this event',
      blocks: [
        p(`${items.length} controls apply, scaled to a ${event.expected}-person ${isPhysical(event) ? 'in-person' : 'virtual'} event. Current EPIC score ${sc.composite ?? '–'} with ${sc.critical.length} critical items open.`),
        list(EPIC_ORDER.map((d) => { const l = items.filter((i) => i.epic === d); return `${EPIC_DOMAINS[d].name}: ${l.length} controls, ${l.filter((i) => i.weight === 'critical').length} critical, ${l.filter((i) => i.status === 'done').length} done`; })),
        p('Most urgent:'),
        list(sc.critical.slice(0, 5).map((c) => `${c.title} (${c.detail})`)),
      ],
      link: { label: 'Open readiness', tab: 'blueprint' },
    };
  },
  bottleneck({ event, sim }) {
    const r = readiness(event, sim);
    const fin = financeView(event, sim);
    const wf = workforceSummary(event, fin);
    const c = commsSummary(event);
    const owners = {};
    for (const i of r.missing) owners[i.owner] = (owners[i.owner] ?? 0) + 1;
    const top = Object.entries(owners).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return {
      title: 'Where things are stuck',
      blocks: [
        p('Open items by owner:'),
        list(top.map(([o, n]) => `${o}: ${n} open`)),
        list([
          wf.leadsWithoutBackup.length ? `${wf.leadsWithoutBackup.length} leads have no backup` : 'Every lead has a backup',
          c.drafts.length ? `${c.drafts.length} messages waiting for approval` : 'No messages waiting for approval',
          c.openQuestions.length ? `${c.openQuestions.length} participant questions unanswered` : 'No open questions',
          fin.flags.length ? `${fin.flags.length} finance flags: ${fin.flags.map((f) => f.title.toLowerCase()).slice(0, 2).join('; ')}` : 'No finance flags',
        ]),
      ],
      link: { label: 'Open Command Center', tab: 'overview' },
    };
  },
  summary({ event, sim, org }) {
    const sc = epicScore(event, sim, org);
    const fin = financeView(event, sim);
    const o = outcomesView(event, sim);
    return {
      title: `${event.name} at a glance`,
      blocks: [
        list([
          `Phase: ${event.status === 'canceled' ? 'canceled' : event.phase}. ${sim.registered ? `${sim.registered} of ${sim.goal} registered.` : `Goal ${sim.goal} participants.`}`,
          `EPIC operational score ${sc.composite ?? '–'} (${sc.band}); ${sc.critical.length} critical items open; ${Math.round(sc.coverage * 100)}% assessed.`,
          `Planned net ${formatMoney(fin.planned.net)}${fin.actual ? `; actual so far ${formatMoney(fin.actual.net)}` : ''}. Local vendor spending ${formatMoney(fin.local.spend)}.`,
          `4W outcomes: ${o.measured} of ${o.total} measured, ${o.verified} verified.`,
        ]),
      ],
      link: { label: 'Open scorecard', tab: 'scorecard' },
    };
  },
  sponsorPackage({ event, sim }) {
    const n = event.expected;
    const ful = fulfillment(event);
    return {
      title: 'Draft sponsor package',
      blocks: [
        p(`For ${event.name}: about ${n} participants${event.fourWs?.length ? `, focused on ${event.fourWs.map((w) => FOUR_WS[w].name).join(' + ')}` : ''}${event.cause ? `, benefiting ${event.cause}` : ''}.`),
        list(SPONSOR_PACKAGES.map((pk) => `${pk.name}${pk.price ? ` · ${formatMoney(pk.price)}` : ''}: ${pk.benefits.slice(0, 4).join(', ')}`)),
        p(sim.registered ? `Proof you can offer: ${sim.registered} registered so far, ${ful.rate != null ? Math.round(ful.rate * 100) + '% of deliverables met' : 'deliverables tracked'}, measured booth and promo-code results after the event.` : 'Offer measured results (booth visits, promo codes, survey recall), not just logo placement.'),
      ],
      link: { label: 'Open sponsors', tab: 'sponsors' },
    };
  },
  aar({ event, sim, org }) {
    if (event.phase !== 'complete') return { title: 'After Action Review', blocks: [p('The review opens after the event. Until then, keep the operations log on event day; it feeds the review.')] };
    const d = draftAAR(event, sim, org);
    return {
      title: 'Draft After Action Review',
      blocks: [
        p('What went well:'), list(d.wentWell.split('\n').filter(Boolean)),
        p('What to improve:'), list(d.improve.split('\n').filter(Boolean)),
        p('Suggested corrective actions:'), list(d.actions.map((a) => `${a.action} (${a.owner})`)),
      ],
      link: { label: 'Open After Action Review', tab: 'aar' },
    };
  },
  help() {
    return {
      title: 'I can help with',
      blocks: [list(SUGGESTED_QUESTIONS)],
    };
  },
};
