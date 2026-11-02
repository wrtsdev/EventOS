// EventOS production server entry point (Hostinger Node.js: entry file server/index.js).
import { loadConfig } from './config.js';
import { createPool, makeDb, migrate } from './db.js';
import { createApp } from './app.js';
import { createMailer } from './mailer.js';
import { log } from './log.js';

process.on('unhandledRejection', (e) => log.error('unhandled rejection', { error: String(e?.stack || e) }));

try {
  const cfg = loadConfig();
  const pool = createPool(cfg.db);
  const db = makeDb(pool);
  await migrate(pool);
  await db.query('DELETE FROM sessions WHERE expires_at < UTC_TIMESTAMP()');
  const mailer = createMailer(cfg);
  const app = createApp({ db, cfg, mailer });
  app.listen(cfg.port, () => log.info('EventOS started', { port: cfg.port, mode: cfg.isProd ? 'production' : 'development', mail: mailer.configured ? 'configured' : 'not configured', publicUrl: cfg.publicUrl }));
} catch (e) {
  log.error('EventOS failed to start', { error: String(e?.message || e) });
  process.exit(1);
}
