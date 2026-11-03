# Deploying EventOS (production)

EventOS production is one Node.js process (`server/index.js`) that serves the API and the built front end, backed by MySQL/MariaDB. It runs on Hostinger Business/Cloud Node.js hosting or any Node 20+ host.

## Hostinger (eventos.werunthesestreetz.com)

- App type: Node.js, Express. Entry file `server/index.js`. Build command `npm run build`. Node 22.
- Deployed from GitHub `wrtsdev/EventOS`; pushes to the deployed branch redeploy automatically.
- Leave the output directory empty: the whole project is the app, and the server serves `dist/` itself.
- Hostinger's runner loads `server/index.js` with `require()`, so the entry file must not use top-level `await`.
- Don't ship an `.htaccess` in `public/`: it would replace Hostinger's routing to the Node app (403/404).
- Database: created with Hostinger's website database setup, which writes `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` and `DATABASE_URL`. The app connects to `127.0.0.1`. Tables are created and upgraded automatically on start (`server/migrations`).

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | yes | `production` |
| `APP_SECRET` | yes | 32+ random characters. Encrypts stored integration keys. **Changing it makes saved Stripe/RunSignup/HubSpot keys unreadable** (reconnect them). |
| `PUBLIC_URL` | yes | `https://eventos.werunthesestreetz.com` — used for links, Stripe return URLs and the CSRF origin check |
| `DATABASE_URL` or `DB_*` | yes | Set by Hostinger's database setup |
| `SIGNUP_OPEN` | no | `false` to make new organizations invitation-only (default open) |
| `PLATFORM_ADMIN_EMAILS` | no | Comma-separated emails that can manage all organizations' plans |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | no | Outgoing email for invitations and password resets (Hostinger mail: `smtp.hostinger.com`, port 465). Without it, invite links are shown to the owner to share, and password reset emails cannot be sent. |
| `SESSION_DAYS` | no | Sign-in lifetime, default 14 |

Secrets live only in the host's environment settings — never in the repository.

## Per-organization integrations

Each organization connects its own services in **Settings → Connected services** (owner only). Keys are verified with the service, stored encrypted, and never shown again.

- **Stripe**: secret key, then add a webhook in Stripe to the URL shown in Settings for `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed`, and paste its signing secret.
- **RunSignup**: API key and secret; import per event from the Participants tab.
- **HubSpot**: private app token with `crm.objects.contacts.read/write` and `crm.schemas.contacts.write`.

## Going live checklist

1. Sign up the WRTS owner account at the site, then set `SIGNUP_OPEN=false` if new organizations should be invitation-only.
2. Configure SMTP so invitations and password resets are emailed.
3. Connect Stripe in test mode (`sk_test_…`), publish a test event, register, pay with a Stripe test card, and confirm the registration turns **paid**. Then switch to live keys.
4. Back up the database from hPanel on a schedule.

## Rollback

Redeploy the previous commit (Hostinger → Node.js → Deployments, or push a revert). Migrations only add tables and columns, so older code keeps working with a newer schema.
