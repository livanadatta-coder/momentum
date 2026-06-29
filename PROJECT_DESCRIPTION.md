# Momentum — Project Description

*(Paste each section below into your Google Doc. Headings included so you can use Doc's heading styles directly.)*

---

## Problem Statement Selected

People don't fail to get things done because they lack a calendar or a to-do
list — they fail because no tool actually reasons about **how a specific
person works**: when they're actually productive, how badly they
underestimate certain kinds of work, what happens to their focus after a
long meeting, or which commitments are quietly at risk of being missed
*today*, not in some abstract future. Calendars store time. Task managers
store lists. Neither one observes behaviour, predicts risk, or adapts a plan
when reality diverges from it.

## Solution Overview

Momentum is an **AI Executive Assistant** — not a calendar, not a task
manager, not a reminder app. It runs a continuous loop:

**Observe → Predict → Plan → Execute → Reflect → Learn → Adapt**

Every morning (and after every meaningful event during the day) Momentum:

1. **Observes** the user's real Google Calendar and active workload.
2. **Predicts risk** per commitment — using both deadline pressure and the
   user's own historical completion behaviour, not a generic deadline countdown.
3. **Builds a dependency-aware execution strategy** — a task graph that
   understands, for example, that "record demo video" needs "finish coding"
   to be done first, and schedules deep work, testing, documentation, and
   deployment blocks in the right order, anchored directly before the real
   calendar commitments they support.
4. **Executes** with a live timeline — Start / Pause / Complete / Partial /
   Skip — that updates the plan and the user's behavioural profile instantly.
5. **Reflects** through a guided daily reflection (not a blank text box) that
   extracts structured behavioural insights from free text.
6. **Learns** — every completion, skip, and reflection updates a persistent
   Behavioural Memory: estimation bias per work type, peak productivity
   hours, post-meeting recovery needs, burnout signals.
7. **Adapts** — the next plan it generates measurably changes because of
   what actually happened, and Momentum explains *why* it changed, every time.

Anyone can experience the full loop immediately via **Demo Workspace** — a
realistic, already-learned-from sample dataset — with zero OAuth friction.
**Connect Google Calendar** is the production path for a user's real schedule.

## Key Features

- **Dependency-aware execution strategy** — a typed task graph (produces/requires
  artifacts) replaces a flat priority list, so prep work is anchored directly
  before the real event it supports, and risk propagates through dependency chains.
- **Behavioural Memory that actually drives planning** — estimation bias,
  completion rate, and peak-productivity hour are learned per work type from
  real execution history and change future scheduling decisions, not just
  displayed on a dashboard.
- **Live execution tracking** — Start/Pause/Complete/Partial/Skip/Cancel with
  running timers, optimistic UI updates, and an append-only execution history.
- **Automatic replanning with visible reasoning** — every task completion,
  skip, reflection, or calendar change triggers an immediate replan, and the
  UI explains concretely what changed and why ("Documentation moved 25
  minutes later because...").
- **Guided daily reflection** — structured prompts (outcome, productivity
  window, interruptions, estimation accuracy) plus free text, parsed into
  structured behavioural insights rather than stored as an unread note.
- **Recovery engine** — detects overload risk and rebuilds only the
  remaining day, never replanning completed work.
- **Demo Workspace** — a first-class, no-OAuth data source with several
  weeks of realistic execution history and reflections, running through the
  exact same planner pipeline as live Google Calendar mode.
- **Deterministic local fallback for every AI agent** — if Gemini is
  unavailable, every agent (risk, focus/scheduling, planning, recovery,
  memory update) has a fully deterministic equivalent, so the product never
  goes blank.

## Technologies Used

- React 18 + TypeScript + Vite
- Tailwind CSS, Framer Motion, Lucide icons
- React Router
- Docker + nginx (Cloud Run deployment image)

## Google Technologies Utilized

- **Gemini API** (`@google/generative-ai`) — powers the Risk, Focus/Scheduling,
  Planner, Recovery, and Memory-update agents, each with a deterministic
  local fallback.
- **Firebase Authentication** — Google OAuth sign-in and Calendar-scoped
  access token handling.
- **Cloud Firestore** — persists Behavioural Memory, daily session cache,
  append-only execution history, and reflections per user.
- **Google Calendar API** — reads the user's real events and writes
  AI-generated execution blocks back as protected calendar events.
- **Google Cloud Run** — hosts the deployed application.
- **Google Cloud Build** — builds the container image from source.
