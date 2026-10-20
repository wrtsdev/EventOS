# WRTS EventOS

**The community operating system for walks, runs, and movement-powered experiences.**
A product of We Run These Streetz LLC (WRTS). *Move Forward Together.*

> From idea to impact — build your community event in one guided system.
> You bring the community. EventOS helps you build the experience.

This repository is a functional, clickable prototype. A WRTS stakeholder can walk an event through its whole lifecycle: set up an organization, build an event with the guided wizard, get a Smart Event Blueprint and readiness score, open registration, run the Command Center, simulate race day, and read the Community Impact Report with next steps that flow to HubSpot.

## Run it

```bash
npm ci
npm run dev        # http://localhost:5173
npm run check      # tests + production build (what CI runs)
```

Node 20 or newer.

## Demo walkthrough (about 10 minutes)

1. **Welcome.** Read the promise and the 4Ws. Choose *Explore the demo* (or set up your own organization).
2. **Home.** Three sample events, one per phase: *Northside Wellness 5K* (planning), *Run Your Money Walk* (registration open), *Community Legacy Walk* (complete). "What needs you today" lists blocking items.
3. **Build an event.** Purpose → 4W → experience → basics → participant experience (recommendations change with event type and 4W) → *Generate my Blueprint*.
4. **Blueprint.** Readiness score, what is missing, plain-language checklist (tap a status to change it), communication timeline, impact plan. Safety, permit, insurance and medical items are labeled *verify locally*.
5. **Open registration** (demo control in the event header). Registration, funnel, revenue, engagement and Community Value Index start working.
6. **Command Center, Volunteers + Ops, CauseOS, SponsorOS, Community Intelligence, Value.**
7. **Simulate race day.** The Community Impact Report generates: what happened, You said / We learned, PLV, Community Lifetime Value, CVI, and *What happens next* actions with a mock HubSpot send.
8. **Passport, Copilot, Integrations, Privacy, Plans** from the sidebar (desktop) or bottom bar (mobile).

*Reset demo* (sidebar footer or More) restores sample data. State is kept in the browser's localStorage only.

## What the prototype answers (Final Product Test)

| Question | Where |
|---|---|
| What am I building? Why? Who is it for? | Blueprint → Experience, Purpose; Event page |
| What do I still need? | Blueprint readiness; Home "What needs you today"; Copilot "What do I still need to complete?" |
| How is the event performing? | Command Center (registration vs goal, funnel, revenue, engagement) |
| What requires attention? | Command Center "What requires attention", ops tiles (green / yellow / red) |
| What happened? What did participants experience? | Impact Report; Community Intelligence → Listen |
| What did the community gain? | Impact Report → Community Value Index, 4W engagement, CauseOS |
| What was the economic value? | Value tab and Impact Report → PLV, Community Lifetime Value, margin |
| What should we do next? | Impact Report → What happens next; Intelligence → Improve; Copilot "What should our next event be?" |

## Project layout

```
src/
  domain/          pure logic: 4Ws, catalog, blueprint + readiness, metrics (PLV/CLV/CVI), simulation
  integrations/    adapter contract, mock connectors (RunSignup, Race Roster, timing), HubSpot mapping
  copilot/         Copilot provider interface + local rules provider
  data/            templates (3 demo scenarios) and sample org / events / Passport
  pages/           screens; pages/event/* are the event workspace tabs
  components/      UI primitives
tests/             node:test suites for domain, integrations and Copilot
docs/              ARCHITECTURE.md, DATA_MODEL.md
.github/workflows/ci.yml
```

## Important notes

- All organizations, people, sponsors and figures are fictional sample data.
- Registration, timing, payments and CRM are mocked behind adapters. Nothing is sent anywhere.
- Copilot is a rules engine over the event's own data, behind a provider interface ready for a hosted model or MCP agent.
- Permit, legal, insurance, medical and safety guidance is informational and must be verified locally.
- PLV and Community Lifetime Value are modeled economic value only. Volunteering, cause engagement and social impact are never converted to dollars; they live in the Community Value Index.

See `docs/ARCHITECTURE.md` and `docs/DATA_MODEL.md`.
