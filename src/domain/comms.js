// Information & Culture engine: communication plan by audience, human
// approval before anything is sent, open questions, handoff notes,
// documents, and language / accessibility support.

import { FOUR_WS } from './fourW.js';
import { getPurpose } from './catalog.js';
import { isPhysical } from './eventBasics.js';
import { sponsorsFor } from './sponsors.js';

export const AUDIENCES = {
  participants: 'Participants',
  volunteers: 'Volunteers and crew',
  sponsors: 'Sponsors',
  partners: 'Partners and beneficiary',
  community: 'Neighbors and the wider community',
};

export function commsTimeline(event) {
  const ws = (event.fourWs ?? []).map((w) => FOUR_WS[w].name).join(' + ') || 'community';
  return [
    { when: '8 weeks before', weeks: 8, title: 'Announce the event', channel: 'Email, social, partner newsletters', detail: `Lead with why: ${getPurpose(event.purpose).label.toLowerCase()} and your ${ws} focus.` },
    { when: '6 weeks before', weeks: 6, title: 'Early registration deadline', channel: 'Email + text', detail: 'Reward early sign-ups; invite returning Passport members first.' },
    { when: '4 weeks before', weeks: 4, title: 'Team and referral push', channel: 'Email + team captains', detail: 'Share team links. Referral codes track who brought whom.' },
    { when: '2 weeks before', weeks: 2, title: 'Cause story', channel: 'Email + social', detail: event.cause ? `Show what ${event.cause} will do with the support.` : 'Share why this event matters to the community.' },
    { when: '3 days before', weeks: 0.5, title: 'Know before you go', channel: 'Email + text', detail: 'Packet pickup, parking, start times, weather plan, what to bring.' },
    { when: 'Event day', weeks: 0, title: 'Welcome and live updates', channel: 'Text', detail: 'Start reminders, course updates, resource village map.' },
    { when: '1 day after', weeks: -0.2, title: 'Thank you + survey', channel: 'Email', detail: 'Photos, results, a 3-minute survey, and the cause total.' },
    { when: '2 weeks after', weeks: -2, title: 'What happens next', channel: 'Email + Passport', detail: 'Invite participants into the next experience based on what they told you.' },
  ];
}

const PHASE_WEEK = { planning: 9, live: 2.5, eventday: 0, complete: -3 };

export function defaultMessages(event) {
  const msgs = commsTimeline(event).map((c, i) => ({ id: 'p' + i, audience: 'participants', title: c.title, channel: c.channel, weeks: c.weeks, when: c.when, detail: c.detail }));
  msgs.push(
    { id: 'v1', audience: 'volunteers', title: 'Volunteer recruitment', channel: 'Email + partner groups', weeks: 7, when: '7 weeks before', detail: 'Roles, shifts, what volunteers gain.' },
    { id: 'v2', audience: 'volunteers', title: 'Role confirmation and training invite', channel: 'Email + text', weeks: 2, when: '2 weeks before', detail: 'Assignment, training time, parking.' },
    { id: 'v3', audience: 'volunteers', title: 'Briefing pack and run of show', channel: 'Email', weeks: 0.5, when: '3 days before', detail: 'Map, radio channels, emergency protocol, lost-child protocol.' },
    { id: 'v4', audience: 'volunteers', title: 'Thank you and hours confirmation', channel: 'Email', weeks: -0.3, when: '2 days after', detail: 'Hours served, recognition, next opportunities.' },
  );
  if (sponsorsFor(event).length) {
    msgs.push(
      { id: 's1', audience: 'sponsors', title: 'Welcome and deliverables timeline', channel: 'Email', weeks: 7, when: '7 weeks before', detail: 'What sponsors receive and when.' },
      { id: 's2', audience: 'sponsors', title: 'Activation details', channel: 'Email', weeks: 1, when: '1 week before', detail: 'Booth location, load-in time, staffing.' },
      { id: 's3', audience: 'sponsors', title: 'Results report', channel: 'Email', weeks: -2, when: '2 weeks after', detail: 'Measured activation results.' },
    );
  }
  if (event.cause || (event.partners ?? []).length || (event.fourWs ?? []).length) {
    msgs.push(
      { id: 'b1', audience: 'partners', title: 'Intended outcomes agreement', channel: 'Meeting + email', weeks: 6, when: '6 weeks before', detail: 'Agree what success looks like and what evidence each partner will share.' },
      { id: 'b2', audience: 'partners', title: 'Partner impact report', channel: 'Email', weeks: -3, when: '3 weeks after', detail: 'Results against intended outcomes.' },
    );
  }
  if (isPhysical(event)) {
    msgs.push({ id: 'c1', audience: 'community', title: 'Neighbor and business notice of road closures', channel: 'Flyers + neighborhood association', weeks: 2, when: '2 weeks before', detail: 'Times, detours, a number to call.' });
  }
  const now = PHASE_WEEK[event.phase] ?? 9;
  return msgs.map((m) => {
    let status = 'draft';
    if (m.weeks >= now + 0.01) status = 'sent';
    else if (m.weeks >= now - 3) status = event.phase === 'planning' ? 'approved' : 'scheduled';
    return { ...m, status, author: 'template', approvedBy: status === 'draft' ? '' : 'Dana Whitfield' };
  });
}

export function messagesFor(event) {
  return event.messages ?? defaultMessages(event);
}

export function defaultQuestions(event) {
  const all = [
    { id: 'q1', from: 'Participant', text: 'Is the route stroller- and wheelchair-friendly?' },
    { id: 'q2', from: 'Team captain', text: 'Can teams add members after the early deadline?' },
    { id: 'q3', from: 'Volunteer', text: 'Where do volunteers park on event morning?' },
    { id: 'q4', from: 'Sponsor', text: 'What time is booth load-in?' },
  ];
  const openCount = { planning: 3, live: 2, eventday: 1, complete: 0 }[event.phase] ?? 3;
  return all.map((q, i) => ({ ...q, status: i < openCount ? 'open' : 'answered', answer: i < openCount ? '' : 'Answered in the FAQ and know-before-you-go email.' }));
}

export function questionsFor(event) {
  return event.questions ?? defaultQuestions(event);
}

export function defaultDocuments(event) {
  const docs = [
    { id: 'd-route', name: 'Route map', kind: 'Map', required: isPhysical(event) },
    { id: 'd-insurance', name: 'Insurance certificate', kind: 'Certificate', required: isPhysical(event) },
    { id: 'd-ems', name: 'EMS agreement', kind: 'Agreement', required: isPhysical(event) },
    { id: 'd-run', name: 'Run of show', kind: 'Plan', required: true },
    { id: 'd-vol', name: 'Volunteer handbook', kind: 'Guide', required: true },
    { id: 'd-sponsor', name: 'Sponsor agreements', kind: 'Agreement', required: sponsorsFor(event).length > 0 },
  ].filter((d) => d.required);
  const done = event.phase === 'planning' ? 2 : docs.length;
  return docs.map((d, i) => ({ ...d, status: i < done ? 'current' : 'missing' }));
}

export function documentsFor(event) {
  return event.documents ?? defaultDocuments(event);
}

export function accessFor(event) {
  return event.access ?? { languages: ['English', 'Spanish'], features: ['Accessible route option', 'Large-print maps', 'ASL interpreter on request'] };
}

export function commsSummary(event) {
  const messages = messagesFor(event);
  const required = Object.keys(AUDIENCES).filter((a) => messages.some((m) => m.audience === a));
  const covered = required.filter((a) => messages.some((m) => m.audience === a && m.status !== 'draft'));
  const questions = questionsFor(event);
  const docs = documentsFor(event);
  const handoff = (event.handoff ?? '').trim();
  const ktParts = [docs.every((d) => d.status === 'current'), handoff.length > 0, event.aar?.status === 'complete'];
  return {
    messages,
    audiences: required.map((a) => ({ id: a, label: AUDIENCES[a], total: messages.filter((m) => m.audience === a).length, ready: messages.filter((m) => m.audience === a && m.status !== 'draft').length })),
    coverage: required.length ? covered.length / required.length : 0,
    drafts: messages.filter((m) => m.status === 'draft'),
    awaitingApproval: messages.filter((m) => m.status === 'draft' && m.author === 'assistant'),
    openQuestions: questions.filter((q) => q.status === 'open'),
    questions,
    documents: docs,
    missingDocs: docs.filter((d) => d.status !== 'current'),
    handoff,
    knowledgeTransfer: ktParts.filter(Boolean).length / ktParts.length,
    access: accessFor(event),
  };
}
