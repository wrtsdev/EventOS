import mysql from 'mysql2/promise';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export function createPool(dbConfig) {
  const base = dbConfig.uri ? { uri: dbConfig.uri } : dbConfig;
  return mysql.createPool({
    ...base,
    connectionLimit: 8,
    waitForConnections: true,
    namedPlaceholders: true,
    timezone: 'Z',
    dateStrings: false,
    multipleStatements: false,
    charset: 'utf8mb4',
  });
}

/** Small query helper: always parameterized. */
export function makeDb(pool) {
  const db = {
    pool,
    async query(sql, params = {}) {
      const [rows] = await pool.query(sql, params);
      return rows;
    },
    async one(sql, params = {}) {
      const rows = await db.query(sql, params);
      return rows[0] ?? null;
    },
    async tx(fn) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const t = {
          query: async (sql, params = {}) => (await conn.query(sql, params))[0],
          one: async (sql, params = {}) => (await conn.query(sql, params))[0][0] ?? null,
        };
        const out = await fn(t);
        await conn.commit();
        return out;
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    },
  };
  return db;
}

/** Applies server/migrations/*.sql in order, once each. */
export async function migrate(pool, log = console.log) {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(190) PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
  const [done] = await pool.query('SELECT name FROM schema_migrations');
  const applied = new Set(done.map((r) => r.name));
  const dir = join(here, 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = readFileSync(join(dir, f), 'utf8');
    const statements = sql.split(/;\s*$/m).map((s) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').trim()).filter(Boolean);
    const conn = await pool.getConnection();
    try {
      for (const st of statements) if (st.trim()) await conn.query(st);
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [f]);
      log(`migration applied: ${f}`);
    } finally {
      conn.release();
    }
  }
}
