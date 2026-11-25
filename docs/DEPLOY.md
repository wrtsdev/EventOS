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
| `SIGNUP_OPEN` | no | `false` to make new organizations invitation-only (default open). The sign-up page is at `/signup`. |
| `PLATFORM_ADMIN_EMAILS` | no | Comma-separated emails that get the **WRTS admin** console: every organization, plans, and creating organizations with an owner set-up link. Takes effect on the next page load, including for accounts that already exist. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | no | Outgoing email for invitations and password resets (Hostinger mail: `smtp.hostinger.com`, port 465). Without it, invite links are shown to the owner to share, and password reset emails cannot be sent. |
| `SESSION_DAYS` | no | Sign-in lifetime, default 14 |

Secrets live only in the host's environment settings — never in the repository.

## Per-organization integrations

Each organization connects its own services in **Settings → Connected services** (owner only). Keys are verified with the service, stored encrypted, and never shown again.

- **Stripe**: secret key, then add a webhook in Stripe to the URL shown in Settings for `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed`, and paste its signing secret.
- **RunSignup**: API key and secret; import per event from the Participants tab.
- **HubSpot**: private app token with `crm.objects.contacts.read/write` and `crm.schemas.contacts.write`.

## Going live checklist

1. Sign up the WRTS owner account at `/signup`, add its email to `PLATFORM_ADMIN_EMAILS`, then set `SIGNUP_OPEN=false` if new organizations should only be created from the WRTS admin console.
2. Configure SMTP so invitations and password resets are emailed.
3. Connect Stripe in test mode (`sk_test_…`), publish a test event, register, pay with a Stripe test card, and confirm the registration turns **paid**. Then switch to live keys.
4. Back up the database from hPanel on a schedule.

## Rollback

Redeploy the previous commit (Hostinger → Node.js → Deployments, or push a revert). Migrations only add tables and columns, so older code keeps working with a newer schema.

## Search engines and AI assistants

- `robots.txt` allows everything except `/api/`. `/sitemap.xml` is generated live: home, `/signup` and every published event.
- `/llms.txt` is a plain-text summary of EventOS for AI assistants. Edit `public/llms.txt` when the product changes.
- `index.html` carries the page title, description, share-preview tags and schema.org data (Organization, SoftwareApplication), plus a short readable summary inside `#root` for crawlers that don't run JavaScript. Browsers hide that summary with a one-line inline script; the script's hash is allowed in the Content-Security-Policy in `server/security.js`. **If you change that script, update the hash** (`echo -n "<script text>" | openssl dgst -sha256 -binary | base64`).
- Public event pages (`/e/:slug`) are filled in on the server with the event's title, description and schema.org `Event` data, so links shared in chat apps and AI answers show the real event. Unpublished or unknown events return 404 with `noindex`.

## Speed

- Responses are gzip-compressed (`compression`). Vite's hashed files are cached for a year; logos, `robots.txt` and `llms.txt` for a day.
- Fonts are self-hosted (`@fontsource`), and the first-screen fonts are preloaded (see `vite.config.js`).
- Screens load on first use (`React.lazy` in `src/App.jsx`), so sign-in and public event pages don't download the whole app.

