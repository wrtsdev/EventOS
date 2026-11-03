import { log } from './log.js';
import express from 'express';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { securityHeaders, csrfGuard } from './security.js';
import { sessionMiddleware, authRouter } from './auth.js';
import { apiRouter } from './api.js';
import { participantsRouter, publicRouter } from './participants.js';
import { integrationsRouter, webhookRouter } from './integrations.js';
import { platformRouter } from './platform.js';

const here = dirname(fileURLToPath(import.meta.url));

export function createApp({ db, cfg, mailer, fetchImpl }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Hostinger terminates TLS in front of the app

  if (cfg.isProd) {
    // Hostinger terminates TLS in front of the app; send plain-HTTP visitors to HTTPS.
    app.use((req, res, next) => (req.headers['x-forwarded-proto'] === 'http' ? res.redirect(301, `https://${req.headers.host}${req.originalUrl}`) : next()));
  }
  app.use(securityHeaders);
  // Raw body for webhook signature checks; JSON for everything else.
  app.use('/api/webhooks', express.text({ type: '*/*', limit: '1mb' }), (req, res, next) => {
    req.rawBody = typeof req.body === 'string' ? req.body : '';
    next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.use(csrfGuard(cfg.publicUrl));

  app.get('/api/health', async (req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ ok: true, db: 'up', mail: mailer.configured ? 'configured' : 'not configured', signupOpen: cfg.signupOpen });
    } catch {
      res.status(503).json({ ok: false, db: 'down' });
    }
  });

  app.use('/api/webhooks', webhookRouter(db, cfg));
  app.use('/api/public', publicRouter(db, cfg, { fetchImpl }));
  app.use('/api', sessionMiddleware(db));
  app.use('/api/auth', authRouter(db, cfg, mailer));
  app.use('/api/platform', platformRouter(db));
  app.use('/api', integrationsRouter(db, cfg, { fetchImpl: fetchImpl ?? fetch }));
  app.use('/api', participantsRouter(db, cfg));
  app.use('/api', apiRouter(db, cfg, mailer));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // Built frontend. /e/:slug and every other non-API route serve the app shell.
  const dist = join(here, '..', 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1y', immutable: true, setHeaders: (res, path) => { if (path.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(dist, 'index.html'));
    });
  }

  // Errors: log details server-side, return a plain message.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status && err.status < 600 ? err.status : 500;
    if (status >= 500) log.error('request failed', { path: req.path, error: String(err?.stack || err) });
    res.status(status).json({ error: status >= 500 && status !== 502 ? 'Something went wrong. Try again.' : err.message });
  });

  return app;
}
