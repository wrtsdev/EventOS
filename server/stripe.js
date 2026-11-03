// Stripe via its REST API (no SDK). Each organization connects its own Stripe
// account, so registration money goes straight to the organizer.

import crypto from 'node:crypto';

const API = 'https://api.stripe.com/v1';

function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v == null) continue;
    if (typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export async function stripeRequest(secret, path, params, { fetchImpl = fetch, method = 'POST' } = {}) {
  const res = await fetchImpl(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' },
    body: method === 'GET' ? undefined : form(params).toString(),
  });
  const body = await res.json();
  if (!res.ok) {
    const err = new Error(body?.error?.message || `Stripe error ${res.status}`);
    err.status = 502;
    throw err;
  }
  return body;
}

export async function createCheckoutSession(secret, o, opts) {
  const items = [{ price_data: { currency: 'usd', unit_amount: o.priceCents, product_data: { name: `${o.eventName} registration` } }, quantity: 1 }];
  if (o.donationCents > 0) items.push({ price_data: { currency: 'usd', unit_amount: o.donationCents, product_data: { name: `Donation${o.cause ? ' to ' + o.cause : ''}` } }, quantity: 1 });
  const lineItems = Object.fromEntries(items.filter((i) => i.price_data.unit_amount > 0).map((it, i) => [i, it]));
  return stripeRequest(secret, '/checkout/sessions', {
    mode: 'payment',
    customer_email: o.email,
    client_reference_id: o.registrationId,
    success_url: o.successUrl,
    cancel_url: o.cancelUrl,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    metadata: { registration_id: o.registrationId },
    line_items: lineItems,
  }, opts);
}

/** Verifies a Stripe-Signature header (v1 scheme) against the raw body. */
export function verifyStripeSignature(rawBody, header, secret, toleranceSec = 300, now = Date.now()) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')).map(([k, v]) => [k, v]));
  const t = Number(parts.t);
  const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || !sigs.length) return false;
  if (Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

export function signForTest(rawBody, secret, t = Math.floor(Date.now() / 1000)) {
  const sig = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return `t=${t},v1=${sig}`;
}
