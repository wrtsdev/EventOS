// EventOS production server entry point (Hostinger Node.js: entry file server/index.js).
import { loadConfig } from './config.js';
import { createPool, makeDb, migrate } from './db.js';
import { createApp } from './app.js';
import { createMailer } from './mailer.js';
import { log } from './log.js';
import { createOutbox, bootstrapMaster } from './governance.js';

process.on('unhandledRejection', (e) => log.error('unhandled rejection', { error: String(e?.stack || e) }));

// No top-level await: Hostinger's LiteSpeed runner loads this file with require().
async function main() {
  const cfg = loadConfig();
  const pool = createPool(cfg.db);
  const db = makeDb(pool);
  await migrate(pool);
  await db.query('DELETE FROM sessions WHERE expires_at < UTC_TIMESTAMP()');
  const master = await bootstrapMaster(db, cfg);
  if (master === 'not configured') log.error('MASTER_ADMIN_EMAIL is not set: no one can approve accounts until it is');
  const mailer = createMailer(cfg);
  const outbox = createOutbox(db, mailer);
  outbox.start(); // sends queued email and retries failures every 30 seconds
  const app = createApp({ db, cfg, mailer, outbox });
  app.listen(cfg.port, () => log.info('EventOS started', { port: cfg.port, mode: cfg.isProd ? 'production' : 'development', mail: mailer.configured ? 'configured' : 'not configured', master, publicUrl: cfg.publicUrl }));
}

main().catch((e) => {
  log.error('EventOS failed to start', { error: String(e?.stack || e?.message || e) });
  process.exit(1);
});
