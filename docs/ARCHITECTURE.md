# EventOS Architecture

## Principles

1. **Vendor-neutral.** EventOS does not build chip timing or try to replace registration platforms. Every external system is reached through an adapter.
2. **Build vs. buy.** If a capability is primarily a transaction, payment, timing, insurance, commodity logistics or mature race operation, integrate it. If it creates persistent community identity, learning, engagement, impact intelligence or relationship value, WRTS owns it.
3. **Two stores.** Transactional data (contact, payment, waiver) is kept apart from community-intelligence data (counts, ZIP, interests, consented feedback). Intelligence never needs direct identifiers.
4. **Consent at the gateway.** Analytics, marketing and partner sharing are separate consents, checked before data reaches intelligence views or HubSpot.
5. **Plain language.** The UI names things the way a first-time coordinator would ("What should happen next?", not "workflow automation").

## System view

```
Registration   Timing   Fundraising   CRM (HubSpot)   Participant apps
     │            │          │              ▲                 │
     └────────────┴──────────┼──────────────┼─────────────────┘
                             ▼              │
                 EventOS Integration Gateway (adapters, normalize, consent)
                             │
                             ▼
              Canonical participant + event data
          ┌──────────────────┴───────────────────┐
   Transactional store                 Community intelligence store
          │                                      │
          └──────────────┬───────────────────────┘
                         ▼
   Passport · CauseOS · SponsorOS · Community Intelligence · PLV / CLV / CVI
                         │
                         ▼
        Organizer recommendations · Impact Report · Copilot
                         │
                         ▼
                HubSpot lists and workflows
```

## Prototype mapping

| Layer | Prototype | Production direction |
|---|---|---|
| UI | React 18 + Vite, mobile-first, organizer sidebar at ≥960px | Same app as a PWA; participant app shares components |
| State | `store.jsx` reducer + localStorage | Multi-tenant API (org-scoped), Postgres |
| Domain | `src/domain/*` pure functions | Same modules, server-side and client-side |
| Gateway | `src/integrations/registry.js` mock adapters | Adapter services with webhooks, queues, retries, idempotency |
| CRM | `src/integrations/hubspot.js` property mapping + sync preview | HubSpot private app, batch contacts upsert, list and workflow enrollment |
| Copilot | `src/copilot/engine.js` local rules provider | Hosted model with tool access to the same domain functions; MCP server exposing EventOS tools |
| Simulation | `src/domain/simulate.js` deterministic generator | Removed; replaced by real gateway data |

## Adapter contract

`src/integrations/adapter.js` defines the shape every connector implements:

- `id`, `name`, `category` (`registration | timing | fundraising | crm | participant-app`), `status`, `capabilities`
- `fetchRaw()` — pull vendor-shaped records
- `normalize(raw)` — return a canonical participant or result
- `toExternal(canonical)` — export direction (CRM, apps)

Screens and metrics only read canonical records, so adding haku, ACTIVE, UltraSignup, Movemint or a CSV upload is an adapter change, not a UI change.

## Multi-tenancy (target)

- Every record carries `organizationId`. Passport is the exception: it belongs to the participant and is shared across organizations by consent.
- Roles: organization owner, coordinator, volunteer lead, sponsor viewer (read-only SponsorOS), beneficiary viewer (read-only CauseOS), participant.
- Tiers (Community, Growth, Partner, Managed) gate modules, not data shape.

## AI and agents

The Copilot provider interface (`answer(question) → { title, blocks, disclaimer, link }`) is model-agnostic. A production provider would pass the same context (event, simulation or live metrics, org) and expose domain functions as tools. The same functions can be published through an MCP server so external agents can ask "Is my event ready?" against real data, with the same consent rules. Legal, permit, insurance, medical and safety answers always carry the local-verification note.

## CI

`.github/workflows/ci.yml` runs `npm ci` then `npm run check` (node:test suites + `vite build`) on every push to `main` and every pull request.
