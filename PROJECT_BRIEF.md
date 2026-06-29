# Momentum
### An AI Executive Assistant

**Google AI Hackathon — Project Brief**

*Tagline:* **Momentum doesn't remind you. It finishes the job with you.**

---

> **How to use this file:** This is written to be pasted into Google Docs section by section (or exported as a polished PDF). Each `[INSERT: ...]` marker shows exactly where to drop a screenshot, your logo, or a diagram image. Heading styles map directly onto Google Docs' Heading 1 / Heading 2 — select the text and apply the matching style as you paste each section in, and the doc will get a working table of contents automatically (Insert → Table of contents).

---

## Cover Page

`[INSERT: Momentum logo / wordmark, centered]`

# Momentum
### An AI Executive Assistant That Finishes Your Work — Not Just Reminds You About It

**Google AI Hackathon Submission**

Livana Datta
2026

`[INSERT: one clean hero screenshot of the Dashboard behind/below the title, slightly faded — gives the cover visual weight without competing with the text]`

---

## Table of Contents

*(Auto-generated in Google Docs via Insert → Table of contents, once headings are styled)*

1. Problem Statement
2. Executive Summary
3. The Problem
4. Our Solution — Momentum
5. How Momentum Works
6. System Architecture
7. Core Features
8. AI Pipeline
9. Behavioral Learning
10. Demo Workspace
11. Google Technologies Used
12. Technology Stack
13. Innovation & Differentiation
14. Future Scope
15. Conclusion

---

## 1. Problem Statement

> **The Last-Minute Life Saver**
> An AI Executive Assistant that helps people complete work before deadlines — instead of simply reminding them.

This matters because the gap between *knowing what to do* and *actually doing it on time* is where almost all real-world productivity failure happens. Nobody misses a deadline because they forgot it existed — calendars and reminders already solve that problem completely. People miss deadlines because they misjudge how long work takes, don't notice that one task blocks another until it's too late, get derailed by a long meeting and never recover the afternoon, or simply have no system that adjusts when the day stops going to plan. Solving *that* problem requires something fundamentally different from a notification — it requires a system that understands the work itself, not just the date it's due.

---

## 2. Executive Summary

Productivity tools have spent two decades getting extremely good at one thing: **telling you what you should be doing.** Calendars show you when things are due. To-do lists show you what's outstanding. Reminder apps interrupt you to say a deadline is close. None of them do the harder, more valuable thing — **figure out how the work actually gets done, in what order, around your real schedule, accounting for how you personally work.**

**Momentum is built to solve execution, not organization.**

It treats a day's workload the way a project manager would: it figures out which tasks depend on which other tasks finishing first, predicts which commitments are genuinely at risk of being missed *today*, builds an execution plan that anchors preparation work directly before the real deadlines it serves, and — critically — **learns from what actually happens**. Every task you complete, skip, or run over time on teaches Momentum something about how you work: when you're sharpest, which categories of work you systematically underestimate, how much recovery time you need after a long meeting. Tomorrow's plan is measurably different because of what happened today.

When the day inevitably doesn't go to plan, Momentum doesn't just flag the problem — it **replans automatically**, rebuilding only the work that's still outstanding, and explains in plain language exactly what changed and why. This is the difference between a tool that organizes information and an assistant that actually executes alongside you.

---

## 3. The Problem

### Reminders don't fail loudly — they fail quietly

A reminder app does exactly what it promises: it reminds you. The problem is that being reminded of something you already know about, three hours before it's due, doesn't change whether you have time left to do it. By the point most reminders fire, the real decision — *when should I have started this* — has already been made, and made wrong.

### Calendars store time. They don't understand work.

A calendar event for "Submit report — 5 PM" tells you when something is due. It says nothing about how long the report actually takes, what has to happen before you can write it, or whether today's schedule leaves you any realistic window to do it. Calendars are a ledger of commitments, not a plan for meeting them.

### Task managers treat every item as independent

Flat to-do lists have no concept of sequence. They can't express that "record the demo video" is blocked until "finish the implementation" is done, or that "write documentation" needs both the code *and* the demo recording to exist first. Without that relationship, prep work gets scheduled in whatever slot happens to be free — not in the slot that actually serves the commitment it's for.

### Nothing learns from you

Every productivity tool treats every user identically and every day as a fresh start. None of them notice that you habitually underestimate documentation by 30%, that your sharpest hours are mid-morning, or that you need real recovery time after back-to-back meetings. Two people with an identical calendar get an identical plan — even though, in reality, they would and should work through that day completely differently.

---

## 4. Our Solution — Momentum

Momentum is an **AI Executive Assistant** — software that behaves less like a calendar and more like a competent human chief of staff who actually understands your workload.

It is explicitly **not**:

| ❌ Not this | Why |
|---|---|
| A calendar | Calendars store time; they don't reason about work |
| A reminder app | Reminders don't change whether you have time left |
| A task manager | Flat lists can't express dependency or sequence |

It **is**:

| ✅ This | What it actually does |
|---|---|
| A dependency-aware planner | Understands which tasks block which others |
| A behavioral learning system | Gets measurably better at scheduling *you*, specifically |
| A continuously adapting engine | Replans automatically when reality diverges from the plan |
| An explainable AI assistant | Every decision answers *why this, why now, why not later* |

Momentum runs one continuous loop, every day:

```
Observe → Predict → Plan → Execute → Reflect → Learn → Adapt
```

---

## 5. How Momentum Works

**Observe** — Momentum reads your real Google Calendar and active workload, building a single unified picture of everything you're committed to today.

**Predict** — Every commitment gets a risk score based on deadline pressure *and* your own historical completion behavior — not a generic countdown timer.

**Plan** — A dependency-aware execution strategy is built: a task graph that understands, for example, that "record demo video" needs "finish coding" done first, and anchors each supporting block of work immediately before the real event it prepares you for.

**Execute** — You work through a live timeline with Start / Pause / Complete / Partial / Skip controls. Every action updates the plan and your behavioral profile in real time.

**Reflect** — A guided daily reflection — structured prompts, not a blank text box — extracts genuine behavioral insight from how the day actually went.

**Learn** — Every completion, skip, and reflection updates a persistent Behavioral Memory: estimation bias per category of work, peak productivity hour, post-meeting recovery needs, burnout signals.

**Adapt** — Tomorrow's plan is measurably different because of what happened today — and Momentum explains exactly what changed and why, every time.

`[INSERT: the Observe → Predict → Plan → Execute → Reflect → Learn → Adapt loop as a circular flow diagram]`

---

## 6. System Architecture

`[INSERT: architecture diagram image — see ARCHITECTURE.md / README.md Mermaid diagram in the repo, exported as PNG/SVG]`

```
Google Calendar + Firestore
        ↓
   Workload Builder
        ↓
   Dependency Graph
        ↓
    Risk Engine
        ↓
 Behavioural Memory
        ↓
 Execution Strategy
        ↓
     Timeline
        ↓
 Execution Tracking
        ↓
    Reflection
        ↓
 Behavioural Learning
        ↓
 Adaptive Replanning  →  (feeds back into Execution Strategy)
```

**The single most important architectural decision in Momentum**: there is exactly **one** orchestrator pipeline. Every page — Dashboard, Day, Calendar, Recovery, Why, Reflection — renders the *same* planner output. No page computes its own schedule independently, and no feature duplicates logic that already exists upstream. This is what makes the system trustworthy: what you see on the Dashboard is never out of sync with what you see on the Day timeline, because they're reading the same object.

**Demo Workspace and Google Calendar are two interchangeable data providers feeding that identical pipeline.** The planner, risk engine, task graph, execution tracking, and behavioral learning code have no branch checking which one is active — switching data sources never means running different logic.

---

## 7. Core Features

### Dashboard
`[INSERT: Dashboard screenshot]`
Your single operating picture for the day — what Momentum has already planned, what's at risk, and what it learned recently. *Why it matters:* judges and users should be able to open the app and understand their entire day's situation in one glance, without hunting through separate views.

### Day Timeline
`[INSERT: Day Timeline screenshot]`
A live, hour-by-hour view of real calendar events interleaved with AI-generated execution blocks, each one labeled with what kind of work it is (Deep Work, Testing, Documentation, Deployment) and live Start/Pause/Complete/Partial/Skip controls. *Why it matters:* this is where planning becomes doing — the timeline is the actual interface for getting work done, not just a visualization of a plan.

### Recovery
`[INSERT: Recovery screenshot]`
When the day's risk crosses a threshold — too much falling behind, too little time left — Momentum doesn't just warn you, it rebuilds a realistic path through what's left, replanning only the remaining work and never touching what's already done. *Why it matters:* a plan that breaks and stays broken is worse than no plan; recovery is what makes the system resilient to real life.

### Reflection
`[INSERT: Reflection screenshot]`
A short guided reflection at the end of the day — structured prompts on outcome, productivity window, interruptions, and estimation accuracy, plus free text — parsed into concrete behavioral insight rather than stored as an unread journal entry. *Why it matters:* this is the input side of learning; without genuine reflection, "learns how you work" would just be a marketing claim.

### Why This?
`[INSERT: "Why" page screenshot]`
Every scheduled block can answer, in plain language, why it was placed there, why now rather than another time, and why not later. *Why it matters:* explainable AI builds trust — users (and judges) shouldn't have to take a black-box scheduler's word for it.

### Demo Workspace
`[INSERT: Demo Workspace badge / landing page screenshot]`
A first-class, no-OAuth data source with several weeks of realistic execution history, behavioral memory, and reflections already populated — running through the exact same pipeline as a live Google Calendar connection. *Why it matters:* judges shouldn't need to grant calendar permissions to a stranger's app just to evaluate it.

### Execution Tracking
`[INSERT: execution tracking controls screenshot]`
Start, pause, complete, partially complete, skip, or cancel any block, with running timers and an append-only execution history. *Why it matters:* this is the ground truth the entire learning loop depends on — without honest execution data, behavioral memory has nothing real to learn from.

### Behavioral Learning
`[INSERT: "Momentum Learning" dashboard card screenshot]`
Per-category estimation bias, completion rate, peak productivity hour, burnout indicators, and post-meeting recovery time — all derived from real history and fed back into scheduling decisions. *Why it matters:* this is the feature that proves Momentum is not a static rules engine — it visibly gets better at planning *you*, specifically, over time.

---

## 8. AI Pipeline

```
Google Calendar
      ↓
  Task Graph        — dependency resolution via produces/requires artifacts
      ↓
  Risk Engine        — risk propagates through dependency chains, not computed in isolation
      ↓
Behavioral Memory     — estimation bias, completion rate, peak hours, burnout signals
      ↓
   Planner            — builds the execution strategy, anchored to real commitments
      ↓
   Timeline            — merges real calendar events + planner output into one view
      ↓
Execution Tracking    — live Start/Pause/Complete/Partial/Skip, append-only history
      ↓
   Reflection          — structured prompts extract behavioral insight
      ↓
   Learning            — behavioral memory updates from execution history + reflection
      ↓
  Replanning           — tomorrow's plan changes because of what happened today
```

Every AI agent in this pipeline (Risk, Focus/Scheduling, Planner, Recovery, Memory update) calls **Gemini first** and falls back to a **fully deterministic local implementation** on failure — both paths produce the exact same output schema, so nothing downstream ever knows or cares which one ran. This means the product never goes blank, even if the Gemini API is unavailable, rate-limited, or slow — a meaningful reliability guarantee for a system meant to be depended on daily.

---

## 9. Behavioral Learning

This is the section that separates Momentum from a conventional rules-based scheduler. Behavioral Memory is a persistent, per-user profile that captures:

| Signal | What it captures | How it changes planning |
|---|---|---|
| Estimation bias (per work type) | How much longer tasks actually take vs. estimated | Future blocks for that category are sized realistically, not optimistically |
| Completion rate (per work type) | How often a category of task gets finished vs. skipped | Raises risk for categories with a history of being abandoned |
| Peak productivity hour | When you're demonstrably sharpest | High-risk tasks compete for that slot first |
| Burnout indicators | Patterns suggesting sustained overload | Triggers the recovery engine earlier, protects against back-to-back overscheduling |
| Meeting recovery minutes | How much buffer you genuinely need after a long meeting | Inserts real recovery blocks after meetings instead of assuming you're immediately available |

**Two users with an identical calendar get different schedules from Momentum** — because their behavioral memory differs. This is the concrete, demonstrable proof that the system has actually learned something, not just executed a fixed rule set with their name attached.

---

## 10. Demo Workspace

Evaluating an AI productivity assistant normally means handing it OAuth access to your real Google Calendar — a real barrier for a judge evaluating a hackathon submission in a few minutes. Momentum's **Demo Workspace** removes that barrier entirely while keeping the evaluation completely honest: it is not a stripped-down "lite" mode or a set of staged screenshots. It is a real, first-class data source — several weeks of realistic calendar events, execution history, and reflections — that runs through **the exact same planner, risk engine, task graph, execution tracking, and behavioral learning code as a live Google Calendar connection.** The only thing that differs between Demo Workspace and a live connection is where the data comes from; every line of AI reasoning is identical.

`[INSERT: landing page screenshot showing both "Connect Google Calendar" and "Try Interactive Demo Workspace" options]`

---

## 11. Google Technologies Used

| Technology | Role in Momentum |
|---|---|
| **Gemini API** | Powers the Risk, Focus/Scheduling, Planner, Recovery, and Memory-update agents — the reasoning core of the product |
| **Firebase Authentication** | Google OAuth sign-in and Calendar-scoped access token handling |
| **Cloud Firestore** | Persists Behavioral Memory, daily session cache, append-only execution history, and reflections per user |
| **Google Calendar API** | Reads the user's real events and writes AI-generated execution blocks back as protected calendar entries |
| **Firebase Hosting** | Hosts the live deployed application |
| **Google Cloud Run** | Container-based deployment path (Dockerfile + Cloud Build included in the repo) |
| **Docker** | Packages the app for Cloud Run deployment |

---

## 12. Technology Stack

**Frontend**
- React 18 + TypeScript
- Vite
- Tailwind CSS
- Framer Motion

**Backend & Infrastructure**
- Firebase Authentication
- Cloud Firestore
- Google Calendar API
- Gemini API
- Docker + Nginx
- Google Cloud Run / Firebase Hosting

---

## 13. Innovation & Differentiation

| ❌ What Momentum is not | ✅ What Momentum actually is |
|---|---|
| A calendar | A dependency-aware execution planner |
| A reminder app | A behavioral learning system |
| A static to-do list | A continuously replanning engine |
| A black-box scheduler | An explainable AI assistant — every decision answers *why* |
| A passive tracker | An active execution-tracking system that drives the next plan |

What makes this genuinely different from the conventional productivity-app playbook is that **none of these capabilities are bolted-on features competing for attention** — they're stages of one pipeline. The dependency graph feeds the risk engine; the risk engine's output shapes the schedule; the schedule generates real execution data; that data trains behavioral memory; behavioral memory reshapes tomorrow's schedule. Removing any one stage breaks the loop. That's the difference between a feature list and a system.

---

## 14. Future Scope

- **Gmail integration** — surface action items and deadlines buried in email directly into the workload
- **Slack integration** — capture commitments made in conversation, not just calendar invites
- **Android notifications / Wear OS** — bring the live timeline and recovery alerts to the wrist and lock screen
- **Voice conversations** — natural-language check-ins ("how's today looking?") instead of opening the app
- **Email prioritization** — apply the same risk/dependency reasoning to inbox triage
- **Team planning** — extend dependency-aware scheduling beyond one person to shared deliverables
- **Multi-agent collaboration** — specialized agents negotiating shared deadlines across a team's individual Momentum instances

---

## 15. Conclusion

Momentum is designed to become an AI Executive Assistant that doesn't simply tell users what to do — it helps them successfully complete their work. By combining behavioral learning, dependency-aware planning, explainable AI, and continuous adaptation, Momentum transforms productivity from passive reminders into intelligent execution.

---

*Built for the Google AI Hackathon.*
