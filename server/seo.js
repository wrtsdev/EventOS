// Pages that search engines and AI assistants can read without running JavaScript.
// index.html carries a crawler-readable summary between <!--seo:start--> and
// <!--seo:end-->, and the page's title and tags between <!--head:start--> and
// <!--head:end-->. For public event pages (/e/:slug) the server swaps both for the
// event's own details and schema.org Event data. Browsers that run the app hide
// the summary (a one-line script in index.html) and React replaces it.

import { readFileSync } from 'node:fs';
import { events } from './repo.js';
import { publicEventView, COUNTED } from './participants.js';
import { log } from './log.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// JSON inside <script>: also break "</script>" and HTML comment openers.
const jsonLd = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function longDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return '';
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function eventSeo(view, url) {
  const when = longDate(view.date);
  const where = view.location || (view.format === 'virtual' ? 'Online' : '');
  const by = view.organization ? ` by ${view.organization}` : '';
  const summary = view.description || `${view.typeLabel}${by}.`;
  const desc = clip([view.name, when, where, summary].filter(Boolean).join(' · '), 300);
  const price = view.price > 0 ? `$${view.price}` : 'Free';
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: view.name,
    description: summary,
    url,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: view.format === 'virtual' ? 'https://schema.org/OnlineEventAttendanceMode' : view.format === 'hybrid' ? 'https://schema.org/MixedEventAttendanceMode' : 'https://schema.org/OfflineEventAttendanceMode',
    ...(view.date ? { startDate: view.date } : {}),
    ...(view.location ? { location: { '@type': 'Place', name: view.location, address: view.location } } : view.format === 'virtual' ? { location: { '@type': 'VirtualLocation', url } } : {}),
    ...(view.organization ? { organizer: { '@type': 'Organization', name: view.organization } } : {}),
    offers: { '@type': 'Offer', url, price: String(view.price || 0), priceCurrency: 'USD', availability: view.registrationOpen ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut' },
    ...(view.sponsors?.length ? { sponsor: view.sponsors.map((name) => ({ '@type': 'Organization', name })) } : {}),
  };
  const head = [
    `<title>${esc(view.name)}${view.organization ? ` · ${esc(view.organization)}` : ''} · EventOS</title>`,
    `<meta name="description" content="${esc(desc)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="EventOS by We Run These Streetz" />',
    `<meta property="og:title" content="${esc(view.name)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    '<meta name="twitter:card" content="summary" />',
    `<script type="application/ld+json">${jsonLd(ld)}</script>`,
  ].join('\n    ');
  const facts = [
    when && `<li><strong>When:</strong> ${esc(when)}</li>`,
    where && `<li><strong>Where:</strong> ${esc(where)}</li>`,
    `<li><strong>Type:</strong> ${esc(view.typeLabel)}</li>`,
    `<li><strong>Registration:</strong> ${esc(price)}${view.registrationOpen ? (view.spotsLeft != null ? `, ${view.spotsLeft} spots left` : ', open') : ', closed'}</li>`,
    view.cause && `<li><strong>Supports:</strong> ${esc(view.cause)}</li>`,
    view.fourWs?.length && `<li><strong>Focus:</strong> ${view.fourWs.map((w) => esc(w.name)).join(', ')}</li>`,
    view.programming?.length && `<li><strong>Program:</strong> ${view.programming.map(esc).join(', ')}</li>`,
    view.sponsors?.length && `<li><strong>Sponsors:</strong> ${view.sponsors.map(esc).join(', ')}</li>`,
  ].filter(Boolean).join('\n          ');
  const body = `<main class="prerender">
        <h1>${esc(view.name)}</h1>
        ${view.organization ? `<p>Hosted by ${esc(view.organization)}.</p>` : ''}
        ${view.description ? `<p>${esc(view.description)}</p>` : ''}
        <ul>
          ${facts}
        </ul>
        <p><a href="${esc(url)}">Register for ${esc(view.name)}</a> · Registration by <a href="/">EventOS</a> from We Run These Streetz</p>
      </main>`;
  return { head, body };
}

function swap(html, start, end, content) {
  const a = html.indexOf(start);
  const b = html.indexOf(end);
  if (a < 0 || b < a) return html;
  return html.slice(0, a + start.length) + '\n    ' + content + '\n    ' + html.slice(b);
}

/** Express handlers for the app shell, /e/:slug pages and /sitemap.xml. */
export function seoPages(db, cfg, indexPath) {
  let template = null;
  const shell = () => (template ??= readFileSync(indexPath, 'utf8'));
  const base = cfg.publicUrl.replace(/\/$/, '');

  async function eventPage(req, res, next) {
    try {
      const e = await events.publicBySlug(db, String(req.params.slug).slice(0, 120));
      res.setHeader('Cache-Control', 'no-cache');
      res.type('html');
      if (!e) {
        // Unknown or unpublished: the app shows its "not found" message; keep it out of search.
        return res.status(404).send(shell().replace('<!--head:end-->', '<meta name="robots" content="noindex" />\n    <!--head:end-->'));
      }
      const c = await db.one(`SELECT COUNT(*) AS n FROM registrations WHERE event_id = :e AND ${COUNTED}`, { e: e.id });
      const view = publicEventView(e, { registered: Number(c?.n ?? 0) });
      const { head, body } = eventSeo(view, `${base}/e/${encodeURIComponent(e.slug)}`);
      let html = swap(shell(), '<!--head:start-->', '<!--head:end-->', head);
      html = swap(html, '<!--seo:start-->', '<!--seo:end-->', body);
      res.send(html);
    } catch (err) {
      log.error('event page render failed', { slug: req.params.slug, error: String(err) });
      next();
    }
  }

  async function sitemap(req, res) {
    let rows = [];
    try {
      rows = await db.query("SELECT slug, updated_at AS updatedAt FROM events WHERE is_public = 1 AND status = 'active' ORDER BY updated_at DESC LIMIT 5000");
    } catch (err) {
      log.error('sitemap query failed', { error: String(err) });
    }
    const urls = [
      `<url><loc>${base}/</loc></url>`,
      `<url><loc>${base}/signup</loc></url>`,
      ...rows.map((r) => `<url><loc>${base}/e/${esc(encodeURIComponent(r.slug))}</loc>${r.updatedAt ? `<lastmod>${new Date(r.updatedAt).toISOString().slice(0, 10)}</lastmod>` : ''}</url>`),
    ];
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
  }

  function appShell(req, res) {
    res.setHeader('Cache-Control', 'no-cache');
    let html = shell();
    if (/^\/signup\/?$/.test(req.path)) {
      // The sign-up page is its own entry in search results.
      html = html
        .replace(/<title>[^<]*<\/title>/, '<title>Create your organization · EventOS by We Run These Streetz</title>')
        .replace('rel="canonical" href="https://eventos.werunthesestreetz.com/"', `rel="canonical" href="${base}/signup"`)
        .replace('property="og:url" content="https://eventos.werunthesestreetz.com/"', `property="og:url" content="${base}/signup"`);
    }
    res.type('html').send(html);
  }

  return { eventPage, sitemap, appShell };
}
