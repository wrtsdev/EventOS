# WRTS EventOS

**The community operating system for walks, runs, and movement-powered experiences.**
EventOS — Developed and Distributed by We Run These Streetz LLC. *Move Forward Together.*

> The 4Ws define why an event matters. EPIC defines how the event should operate. EventOS makes both executable, measurable and repeatable.

This repository is a working, clickable prototype. A WRTS stakeholder can take an event from charter to next edition: purpose and 4Ws, EPIC readiness, budget, safety, workforce, communications, event day, results with evidence, After Action Review, and a cloned next edition that carries the lessons forward.

All organizations, people, registrations, payments and prior-edition results in the demo are **synthetic**. Integrations are demo adapters; nothing is sent to any outside service.

## Run it

```bash
npm ci
npm run dev        # http://localhost:5173
npm run check      # 39 tests + production build (what CI runs)
```

Node 20 or newer.

## Demo walkthrough (about 15 minutes)

1. **Explore the demo** as the owner of *Northside Community Alliance* (fictional).
2. **My Events** shows critical items across events and filters by Upcoming / Active / Completed / Canceled / Archived.
3. **Northside Wellness 5K 2027** is the validation scenario: Wellness primary, Wealth and Work supporting.
   - *Plan → Charter*: Event Charter, Community Purpose Statement, EPIC × 4Ws matrix, initial EPIC readiness plan.
   - *Plan → Readiness*: staged reviews (planning, 30-day, 7-day, event day, closure), controls grouped by EPIC area, critical items shown separately.
   - *Commerce → Finance*: the draft budget cut EMS below the safe minimum; EventOS flags it as critical and blocks approval until it is restored.
   - *Operations → Safety*: risk register, heatmap, emergency contacts, incident log.
4. **Run Your Money Walk** (registration open): *Start event day*, record a weather delay (a participant message is drafted and waits for approval), log an incident, then *Close event day* and open the *Scorecard*.
5. **Community Legacy Walk** (complete): *Reports → After Action Review → Draft from event records → Complete review → Create next edition*.
6. **Settings and roles**: view as Volunteer lead (finance becomes restricted), preview the Community plan (scorecard is gated), switch to the second fictional tenant *Eastgate PTA* (only its own event is visible), change EPIC weights, turn the assistant off.

*Reset demo* restores the sample data. Saved state lives only in your browser.

## What's where

```
src/
  domain/      epic, controls, finance, safety, workforce, comms, civic, sponsors, aar,
               access (roles, tenancy, plans), migrate, blueprint, simulate, metrics, fourW, catalog
  integrations/ adapter contract, demo connectors, HubSpot mapping
  copilot/     optional planning assistant (rules engine with guardrails)
  data/        templates and synthetic sample data
  pages/       screens; pages/event/* are the event workspace sections
tests/         domain, epic, access/isolation, validation scenario, integrations
docs/          EPIC_EXPANSION.md (gap analysis, scoring spec, status, backlog), schema.sql,
               ARCHITECTURE.md, DATA_MODEL.md
```

## Read next

- **`docs/EPIC_EXPANSION.md`** — audit, gap analysis, EPIC scoring spec, integration status, deployment and rollback, backlog, commercialization readiness, and exactly what is operational vs. incomplete.
- `docs/schema.sql` — production PostgreSQL schema with row-level security.

## Important limits

- No backend yet. Roles and tenant isolation are enforced in the client-side repository layer and are tested, but production must enforce them on the server.
- Safety, permit, insurance and medical guidance is planning support only and must be verified locally.
- PLV and Community Lifetime Value are economic only. Volunteering and cause engagement are never converted to dollars.
- The EPIC framework is incorporated as a methodology; confirm any required attribution or rights before commercial launch.
- The approved WRTS logo file is not in the repository yet; the product uses a text wordmark.
