# Momentum

An **AI Executive Assistant** — not a calendar, not a task manager, not a reminder app.

Momentum observes your calendar and workload, predicts risk, builds a
dependency-aware execution strategy around your real commitments, learns
from how you actually work, and adapts the plan as the day unfolds. The
loop: **Observe → Predict → Plan → Execute → Reflect → Learn → Adapt.**

## Evaluate it in under a minute

Open the deployed app and click **Try Demo Workspace** on the landing page —
a realistic, already-learned-from workspace (several weeks of execution
history, behavioural memory, and reflections) with **no Google sign-in
required**. Every feature works identically to the production path; only the
data source differs. **Connect Google Calendar** is the production path for
a user's own real schedule.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in real Firebase + Gemini values
npm run dev
```

## Build

```bash
npm run build
```

## Deploy

See [DEPLOY.md](./DEPLOY.md) for the full Cloud Run runbook (Dockerfile +
Cloud Build, no local Docker required).

## Stack

- React 18 + TypeScript + Vite, Tailwind CSS, Framer Motion
- Firebase Auth (Google OAuth) + Cloud Firestore
- Google Calendar API
- Gemini API, with a fully deterministic local fallback for every AI agent
  (the product never goes blank if Gemini is unavailable)
- Docker + nginx, deployed on Google Cloud Run

## Architecture

Behavioural memory, risk assessment, the dependency-aware task graph,
execution tracking, reflection, and recovery all run through **one
orchestrator pipeline** — every page (Dashboard, Day, Calendar, Recovery,
Why, Reflection) renders the same planner output rather than deriving its
own logic. Demo Workspace and Google Calendar are two interchangeable data
providers feeding that same pipeline — see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Project description

See [PROJECT_DESCRIPTION.md](./PROJECT_DESCRIPTION.md) for the problem
statement, solution overview, key features, and technologies used (same
content submitted as the Google Doc).
