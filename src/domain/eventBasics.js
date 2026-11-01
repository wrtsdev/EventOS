// Small, dependency-free facts about an event used by every module.

import { getEventType } from './catalog.js';

export const PHASES = ['planning', 'live', 'eventday', 'complete'];

export function isPhysical(event) {
  return event.format !== 'virtual' && getEventType(event.typeId).physical;
}

export function isTimed(event) {
  return getEventType(event.typeId).timed && event.format !== 'virtual';
}

export function isCanceled(event) {
  return event.status === 'canceled';
}

/** Has the event day started (or passed)? */
export function eventDayReached(event) {
  return event.phase === 'eventday' || event.phase === 'complete';
}

export function expectedCount(event) {
  return Number(event.expected) || 0;
}

/** Recommended volunteers given size and format. */
export function volunteerNeed(event) {
  const n = expectedCount(event);
  if (!isPhysical(event)) return Math.max(2, Math.ceil(n / 150));
  return Math.max(6, Math.ceil(n / 20));
}

/** small | medium | large. Drives how many controls apply. */
export function sizeBand(event) {
  const n = expectedCount(event);
  if (n > 500) return 'large';
  if (n >= 150) return 'medium';
  return 'small';
}

export function primaryW(event) {
  return event.primaryW ?? event.fourWs?.[0] ?? null;
}

export function supportingWs(event) {
  const p = primaryW(event);
  return (event.fourWs ?? []).filter((w) => w !== p);
}

/** Deterministic pseudo-random in [0,1) from a string, for stable demo data. */
export function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h += h << 13; h ^= h >>> 7; h += h << 3; h ^= h >>> 17; h += h << 5;
  return ((h >>> 0) % 100000) / 100000;
}

export const roundTo = (n, step = 1) => Math.round(n / step) * step;
