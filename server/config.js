// Server configuration from environment variables. Secrets never have defaults
// in production; the server refuses to start without them.

const env = process.env;
const isProd = env.NODE_ENV === 'production';

function required(name, devDefault) {
  const v = env[name];
  if (v) return v;
  if (isProd) throw new Error(`Missing required environment variable ${name}`);
  return devDefault;
}

export function loadConfig(overrides = {}) {
  const dbUrl = env.DATABASE_URL;
  const cfg = {
    isProd,
    port: Number(env.PORT) || 3000,
    publicUrl: (env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, ''),
    // 32+ random bytes, base64 or hex. Used for encrypting stored integration secrets.
    appSecret: required('APP_SECRET', 'dev-only-insecure-secret-change-me-0123456789'),
    db: dbUrl
      ? { uri: dbUrl }
      : {
          host: env.DB_HOST || '127.0.0.1',
          port: Number(env.DB_PORT) || 3306,
          database: env.DB_NAME || 'eventos_dev',
          user: env.DB_USER || 'eventos',
          password: env.DB_PASSWORD ?? (isProd ? undefined : 'devpass'),
        },
    sessionDays: Number(env.SESSION_DAYS) || 14,
    platformAdmins: (env.PLATFORM_ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    stripe: { secretKey: env.STRIPE_SECRET_KEY || '', webhookSecret: env.STRIPE_WEBHOOK_SECRET || '' },
    mail: {
      host: env.SMTP_HOST || '',
      port: Number(env.SMTP_PORT) || 465,
      user: env.SMTP_USER || '',
      password: env.SMTP_PASSWORD || '',
      from: env.MAIL_FROM || env.SMTP_USER || '',
    },
    signupOpen: env.SIGNUP_OPEN !== 'false',
    ...overrides,
  };
  if (isProd && cfg.appSecret.length < 32) throw new Error('APP_SECRET must be at least 32 characters');
  return cfg;
}
