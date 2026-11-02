// EventOS production server entry point (Hostinger Node.js: entry file server/index.js).
import { loadConfig } from './config.js';
import { createPool, makeDb, migrate } from './db.js';
import { createApp } from './app.js';
import { createMailer } from './mailer.js';

const cfg = loadConfig();
const pool = createPool(cfg.db);
const db = makeDb(pool);

await migrate(pool);
await db.query('DELETE FROM sessions WHERE expires_at < UTC_TIMESTAMP()');

const app = createApp({ db, cfg, mailer: createMailer(cfg) });
app.listen(cfg.port, () => console.log(`EventOS listening on ${cfg.port} (${cfg.isProd ? 'production' : 'development'})`));
