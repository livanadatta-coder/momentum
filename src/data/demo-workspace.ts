// ============================================================================
// Momentum — Demo Workspace
//
// A first-class data source, not placeholder data. This is what Google
// Calendar mode already does mechanically: pass an empty Mission[] and let
// buildUnifiedWorkload() (src/ai/workload.ts) derive pseudo-missions from
// calendar events automatically. Demo Workspace reuses that exact mechanism
// with a richer, multi-day calendar instead of forking any planning logic —
// the planner, risk engine, task graph, and execution/learning engines never
// know this data didn't come from Google.
//
// The story: someone who has been using Momentum for several weeks. Their
// BehavioralMemory already shows real learned patterns, their execution
// history already has the full mix of outcomes, and their past reflections
// already shaped today's plan — so a first-time visitor immediately sees
// "this AI actually understands how I work" instead of an empty workspace.
// ============================================================================

import type { BehavioralMemory, CalendarEvent, ExecutionRecord, ExecutionState } from "@/types/domain";
import {
  DEMO_USER_ID,
  saveMemory,
  appendExecutionRecord,
  saveReflection,
  resetDemoWorkspaceStorage,
} from "@/services/firestore.service";
import { nowISO } from "@/lib/utils";

export { DEMO_USER_ID };

const SEEDED_FLAG_KEY = "momentum_demo_seeded";

// ── Date helpers — everything is relative to "today" so the demo always
// looks current no matter when it's opened. ─────────────────────────────────

function atHour(daysOffset: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function dateKey(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Calendar — today + tomorrow, matching the spec's example scenario ───────
// Mix of meetings, coding, documentation, personal events, and deadlines so
// the dependency graph (coding → demo prep → docs → deploy) has real work
// to chain together, exactly like a live Google Calendar would.

export const demoCalendarEvents: CalendarEvent[] = [
  // ── Today ──
  { id: "demo-ev-standup",    title: "Team Standup",                start: atHour(0, 9, 0),  end: atHour(0, 9, 15),  isBlocked: false, source: "google" },
  { id: "demo-ev-mentor",     title: "Mentor Session",              start: atHour(0, 11, 0), end: atHour(0, 11, 30), isBlocked: false, source: "google" },
  { id: "demo-ev-coding",     title: "Complete Momentum Planner",   start: atHour(0, 13, 0), end: atHour(0, 13, 30), isBlocked: false, source: "google" },
  { id: "demo-ev-demo",       title: "Record Product Demo",         start: atHour(0, 15, 0), end: atHour(0, 15, 30), isBlocked: false, source: "google" },
  { id: "demo-ev-docs",       title: "Final Documentation",         start: atHour(0, 17, 0), end: atHour(0, 17, 30), isBlocked: false, source: "google" },
  { id: "demo-ev-release",    title: "Push Release",                start: atHour(0, 19, 0), end: atHour(0, 19, 15), isBlocked: false, source: "google" },
  // ── Tomorrow ──
  { id: "demo-ev-sprint",     title: "Sprint Planning",             start: atHour(1, 9, 0),  end: atHour(1, 10, 0),  isBlocked: false, source: "google" },
  { id: "demo-ev-client",     title: "Client Review",               start: atHour(1, 11, 0), end: atHour(1, 12, 0),  isBlocked: false, source: "google" },
  { id: "demo-ev-research",   title: "Research Spike",              start: atHour(1, 14, 0), end: atHour(1, 14, 45), isBlocked: false, source: "google" },
  { id: "demo-ev-gym",        title: "Gym",                         start: atHour(1, 18, 0), end: atHour(1, 19, 0),  isBlocked: false, source: "google" },
  { id: "demo-ev-assignment", title: "Assignment Submission",       start: atHour(1, 21, 0), end: atHour(1, 21, 30), isBlocked: false, source: "google" },
];

// ── Behavioral Memory — already learned, matching the spec's examples ──────

export const demoMemory: BehavioralMemory = {
  userId: DEMO_USER_ID,
  updatedAt: nowISO(),
  preferredWorkHours: [
    { start: "09:00", end: "13:00" },
    { start: "16:00", end: "20:00" },
  ],
  averageSessionMinutes: 52,
  peakProductivityHour: 10,
  estimationBias: 1.28,
  procrastinationPatterns: [
    { category: "documentation", note: "You reported underestimating documentation — future documentation blocks will be reserved with extra time." },
  ],
  burnoutIndicators: [],
  schedulingHabits: [
    { category: "execution", note: "Long, uninterrupted deep work sessions consistently outperform fragmented ones." },
    "Tends to front-load coding before lunch and defer documentation to evening.",
  ],
  missedDeadlineRate: 0.09,
  onTimeCompletionRate: 0.88,
  completionRateByWorkType: {
    execution: 0.91,
    documentation: 0.62,
    testing: 0.85,
    demo: 0.78,
    deployment: 0.73,
  },
  estimationBiasByWorkType: {
    documentation: 1.32,
    execution: 1.1,
    demo: 1.2,
  },
  completionRateByHour: {
    9: 0.7,
    10: 0.95,
    11: 0.93,
    14: 0.6,
    16: 0.55,
  },
  meetingRecoveryMinutes: 30,
  learningInsights: [
    "Documentation tasks consistently take 32% longer than estimated.",
    "Coding between 10 AM and 12 PM has your highest completion rate (91%).",
    "Long meetings reduce your productivity afterward — 30 minutes of recovery time is now protected.",
  ],
};

// ── Execution history — several weeks, full mix of outcomes ────────────────
// Builds a believable backlog: mostly-successful coding, frequently-late
// documentation, the occasional skip, a partial, and a couple of explicit
// cancellations — varied enough that the analytics it produces are genuinely
// meaningful, not a flat 100% success story.

function record(
  daysAgo: number,
  hour: number,
  workType: string,
  title: string,
  estimatedDuration: number,
  status: ExecutionState,
  actualDurationOverride?: number,
): Omit<ExecutionRecord, "id"> {
  const plannedStart = atHour(-daysAgo, hour, 0);
  const plannedEnd = new Date(new Date(plannedStart).getTime() + estimatedDuration * 60_000).toISOString();
  const isTerminal = status === "completed" || status === "partially_completed" || status === "skipped";
  const actualDuration = isTerminal && status !== "skipped"
    ? actualDurationOverride ?? Math.round(estimatedDuration * (workType === "documentation" ? 1.32 : 1.05))
    : undefined;
  const actualStart = status !== "not_started" ? plannedStart : undefined;
  const actualEnd = isTerminal && status !== "skipped"
    ? new Date(new Date(plannedStart).getTime() + (actualDuration ?? estimatedDuration) * 60_000).toISOString()
    : undefined;

  return {
    taskId: `demo-hist-${daysAgo}-${hour}-${workType}`,
    title,
    workType,
    plannedStart,
    plannedEnd,
    actualStart,
    actualEnd,
    estimatedDuration,
    actualDuration,
    status,
    completionConfidence: status === "cancelled" ? 0.1 : 1.0,
    completionSource: "manual",
    plannerVersion: "demo-seed",
    behaviourSnapshot: { peakProductivityHour: 10, estimationBias: 1.28 },
    timestamp: plannedEnd,
  };
}

export const demoExecutionHistory: Array<Omit<ExecutionRecord, "id">> = [
  // Week 3 ago
  record(21, 10, "execution", "Deep Work — API refactor", 90, "completed"),
  record(21, 17, "documentation", "Write integration guide", 45, "completed", 64),
  record(20, 10, "execution", "Deep Work — auth flow", 75, "completed"),
  record(20, 14, "demo", "Record onboarding walkthrough", 30, "partially_completed", 40),
  record(19, 17, "documentation", "Update README", 30, "skipped"),
  record(18, 10, "testing", "Write unit tests", 60, "completed"),
  // Week 2 ago
  record(15, 10, "execution", "Deep Work — dashboard redesign", 90, "completed"),
  record(15, 17, "documentation", "API reference doc", 40, "completed", 58),
  record(14, 11, "execution", "Deep Work — bugfix sprint", 60, "completed"),
  record(14, 16, "deployment", "Deploy staging build", 45, "completed"),
  record(13, 10, "testing", "Regression pass", 50, "completed"),
  record(13, 17, "documentation", "Write changelog", 25, "partially_completed", 35),
  record(12, 9, "execution", "Deep Work — perf tuning", 80, "cancelled"),
  // Week 1 ago
  record(8, 10, "execution", "Deep Work — execution tracking", 90, "completed"),
  record(8, 15, "demo", "Record feature demo", 30, "completed", 38),
  record(7, 17, "documentation", "Finish setup guide", 35, "completed", 50),
  record(7, 18, "deployment", "Deploy production hotfix", 30, "skipped"),
  record(6, 10, "execution", "Deep Work — behavioral learning engine", 100, "completed"),
  record(6, 14, "testing", "Edge-case testing", 40, "completed"),
  record(5, 17, "documentation", "Write reflection guide", 30, "completed", 41),
  record(4, 10, "execution", "Deep Work — reflection page", 75, "completed"),
  record(3, 16, "demo", "Record reflection demo", 25, "completed", 31),
  record(2, 17, "documentation", "Update API docs", 30, "partially_completed", 38),
  record(1, 10, "execution", "Deep Work — dashboard polish", 60, "completed"),
];

// ── Reflections — already shaped Behavioral Memory ──────────────────────────

export const demoReflections: Record<string, string> = {
  [dateKey(-19)]: "I underestimated documentation again — it always takes longer than I plan for.",
  [dateKey(-14)]: "Coding before lunch works much better than after. I lose focus after long meetings too.",
  [dateKey(-8)]: "Recording demos takes much longer than expected once I account for retakes.",
  [dateKey(-3)]: "I work better after lunch when the morning starts with a meeting instead of deep work.",
};

// ── Seeding ──────────────────────────────────────────────────────────────────

/** Idempotent — only writes once per browser unless explicitly reset. Every
 *  write goes through the SAME firestore.service functions production code
 *  uses; the demo-vs-Firestore branch lives entirely in that one file. */
export async function seedDemoWorkspaceIfNeeded(): Promise<void> {
  if (localStorage.getItem(SEEDED_FLAG_KEY) === "true") return;

  await saveMemory(demoMemory);

  for (const rec of demoExecutionHistory) {
    await appendExecutionRecord(DEMO_USER_ID, rec);
  }

  for (const [date, text] of Object.entries(demoReflections)) {
    await saveReflection(DEMO_USER_ID, date, text);
  }

  localStorage.setItem(SEEDED_FLAG_KEY, "true");
}

/** Wipes demo storage and the seeded flag, so the next entry re-seeds from
 *  scratch — lets a judge (or you) reset the workspace to its original
 *  story after poking at it. */
export function resetDemoWorkspace(): void {
  resetDemoWorkspaceStorage();
  localStorage.removeItem(SEEDED_FLAG_KEY);
}
