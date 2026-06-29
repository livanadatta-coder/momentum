# Momentum — Architecture

## Product positioning

Momentum is not a to-do list. The interface is built around a continuous
operating loop:

**Observe → Predict → Plan → Execute → Reflect → Learn → Adapt**

This keeps the product closer to a Chief of Staff than a chatbot or a
calendar app.

## Single pipeline, one source of truth

There is exactly one orchestrator pipeline (`src/ai/orchestrator/orchestrator.ts`),
and every page reads its output rather than deriving independent logic:

```
Data Provider (Demo Workspace  |  Google Calendar)
                    ↓
          Unified Workload Builder
                    ↓
            Task Graph (dependency
         resolution via produces/requires)
                    ↓
             Risk Assessment
        (propagated through the graph)
                    ↓
        Behavioural-Memory-weighted
          Execution Strategy / Scheduling
                    ↓
              Merged Timeline
       (calendar events + execution blocks)
                    ↓
   Dashboard · Day · Calendar · Why · Recovery · Reflection
                    ↓
          Execution Tracking (live)
                    ↓
              Reflection
                    ↓
        Behavioural Memory updates
                    ↓
          Tomorrow's plan changes
```

The **only** thing that changes between Demo Workspace and a live Google
Calendar connection is the data provider — missions, calendar events, and
persistence backend. The task graph, risk engine, scheduler, execution
tracking, and behavioural learning code have no branch checking which one
is active.

### Demo Workspace

`src/data/demo-workspace.ts` supplies a believable multi-day calendar and is
fed through `buildUnifiedWorkload()` (`src/ai/workload.ts`) the exact same
way Google Calendar events are — pseudo-missions are derived automatically,
not hand-authored. Persistence for the demo user is branched inside
`firestore.service.ts` (a localStorage mirror instead of a real Firestore
write) so every hook (`useNexus`, `useExecutionTracking`, `ReflectionPage`)
calls the identical functions regardless of mode.

### Gemini + deterministic fallback

Every agent (Risk, Focus/Scheduling, Planner, Recovery, Memory update) calls
Gemini first and falls back to a fully deterministic local implementation
(`src/ai/local-fallback.ts`) on failure — same output schema either way, so
downstream code never knows which one ran.

## Folder structure

```txt
src/
  ai/
    agents/            Gemini-backed agents (risk, focus, planner, recovery, memory).
    hooks/             useNexus (pipeline runner), useExecutionTracking.
    learning/          Behavioural learning engine, schedule-diff explanations.
    orchestrator/       The single orchestrator that merges every agent's output.
    local-fallback.ts   Deterministic equivalent of every Gemini agent.
    task-graph.ts       Dependency resolution (produces/requires artifacts).
    work-types.ts       Declarative work-type table (labels, dependencies).
    workload.ts         Merges Firestore/demo missions with calendar events.
  app/                  Routing, top-level App composition.
  auth/                 Firebase Auth + Calendar OAuth token handling.
  components/           UI primitives, layout chrome, domain components.
  data/                 Mock data + Demo Workspace dataset.
  providers/            NexusDataProvider — the single context every page reads.
  pages/                Route-level page compositions (Dashboard, Day, Calendar, ...).
  services/             Firestore + Google Calendar API clients.
  types/                Shared domain types (Mission, Task, BehavioralMemory, ...).
```

## Key architectural decisions

- **One merged timeline.** `orchestrator.ts`'s `buildTimeline()` is the only
  place real calendar events and planner-generated blocks are merged and
  sorted. No page re-derives or re-merges this itself.
- **Task graph over flat priority lists.** Work types declare what artifact
  they produce/require (`work-types.ts`); dependencies are resolved by
  matching those artifacts, not by a hardcoded ordering. Risk propagates
  through the graph — a late coding task visibly raises the risk of the
  demo/docs/deploy tasks chained after it.
- **Behavioural Memory genuinely drives scheduling.** Per-work-type
  completion rate, estimation bias, peak productivity hour, burnout signals,
  and post-meeting recovery time are derived from real execution history and
  consumed by the scheduler and risk engine — not just displayed.
- **Append-only execution history.** Every Start/Pause/Complete/Partial/Skip
  action writes a new record; current state is a client-side reduction, never
  a mutated document.
- **Explainability everywhere.** Every scheduled block answers why-this /
  why-now / why-not-later, and every replan names the concrete trigger and
  diff (`schedule-diff.ts`).

## Deployment

Static Vite/React SPA — no backend service. Built and served via Docker +
nginx on Google Cloud Run; see [DEPLOY.md](./DEPLOY.md).
