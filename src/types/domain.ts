// ============================================================================
// Nexus OS — Core Domain Types
// Every agent, service, and UI component uses these types.
// Do not add UI-specific state here. Keep this pure domain.
// ============================================================================

// ── Time ────────────────────────────────────────────────────────────────────

export type ISOString = string; // ISO 8601

export interface TimeWindow {
  start: ISOString;
  end: ISOString;
}

// ── Tasks / Missions ────────────────────────────────────────────────────────

export type Priority = "critical" | "high" | "medium" | "low";
export type MissionStatus = "not_started" | "in_progress" | "completed" | "at_risk" | "missed";

export interface Mission {
  id: string;
  title: string;
  description: string;
  deadline: ISOString;
  priority: Priority;
  status: MissionStatus;
  estimatedMinutes: number;
  actualMinutesSpent?: number;
  category: "academic" | "work" | "personal" | "health" | "admin";
  dependencies: string[]; // mission ids
  tags: string[];
  createdAt: ISOString;
  updatedAt: ISOString;

  // ── Unified workload fields ──────────────────────────────────────────────
  // Set by buildUnifiedWorkload() when this mission was matched to or derived
  // from a Google Calendar event.  Agents use these to generate explanations
  // that reference the real calendar event ("prepares you for your 1 PM
  // 'complete nexus coding'") instead of generic planner copy.
  calendarEventId?:    string;    // ID of the matched CalendarEvent
  calendarEventTitle?: string;    // display title of that event
  calendarEventStart?: ISOString; // start time of that event
  calendarScheduled?:  boolean;   // true → already on calendar, plan prep time around it

  // ── Legacy display fallback ──────────────────────────────────────────────
  // Set by workload.ts from the WorkTypeProfile block label. The Task Graph
  // (task-graph.ts) now drives the real block title/reasoning; this field is
  // only a fallback for any code path that hasn't been migrated.
  prepFocusTitle?: string;  // e.g. "🎥 Demo Preparation"
}

// ── Task Graph ────────────────────────────────────────────────────────────────
// The shared schema both Gemini and the deterministic local resolver populate.
// Everything downstream (risk propagation, scheduling, explanations) consumes
// ONLY this shape — it never knows which engine produced it.

import type { WorkType } from "@/ai/work-types";

export interface Task {
  missionId: string;
  workType: WorkType;
  goal: string;                 // one-line human description, e.g. "Finish Nexus implementation"
  requiredInputs: string[];     // artifact names this task needs
  produces: string[];           // artifact names this task yields once done
  calendarAnchor?: { eventId: string; start: ISOString; title: string };
  estimatedMinutes: number;
  dependencies: string[];       // missionIds whose `produces` satisfied this task's `requires`
  dependents: string[];         // inverse edges, filled after the graph is built
  deadline: ISOString;
  risk: number;                 // propagated risk score, 0–1
  /** Set when a required artifact had no producer in today's workload and a
   *  fallback (or nothing) was used instead — surfaced in explanations. */
  degradedInput?: { wanted: string; gotInstead: string | null };
}

// ── Calendar ────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  title: string;
  start: ISOString;
  end: ISOString;
  isBlocked: boolean;   // true = Nexus protected this block
  source: "google" | "nexus" | "manual";
  missionId?: string;
  /** True for all-day events (birthdays, holidays — Google's `date`-only
   *  events with no `dateTime`). These are informational, not commitments —
   *  they must NEVER occupy busy-time, or a single all-day event blocks the
   *  scheduler from placing anything that entire day. */
  allDay?: boolean;
}

// ── Risk ─────────────────────────────────────────────────────────────────────

export interface RiskSignal {
  id: string;
  missionId: string;
  score: number;        // 0–1, higher = more at risk
  level: "safe" | "watch" | "danger" | "critical";
  reason: string;       // human-readable explanation
  recommendations: string[];
  detectedAt: ISOString;
}

// ── Focus ────────────────────────────────────────────────────────────────────

export interface FocusWindow {
  window: TimeWindow;
  quality: "peak" | "good" | "moderate" | "low";
  protectedBy: "nexus" | "user";
  missionId?: string;   // what Nexus scheduled here
  reason: string;
  /** Display title for this block — e.g. "🎥 Demo Preparation". Falls back to the
   *  mission title in the UI when absent (older cached sessions). */
  title?: string;
  /** What kind of work this block represents — drives the emoji/title and lets
   *  the UI distinguish deep work from buffer/recovery time at a glance. */
  blockType?: "meeting" | "execution" | "testing" | "demo" | "documentation" |
    "deployment" | "learning" | "admin" | "personal" | "buffer" | "recovery";
}

// ── Memory / Behavioral Twin ─────────────────────────────────────────────────

export interface BehavioralMemory {
  userId: string;
  updatedAt: ISOString;

  // Work patterns
  preferredWorkHours: TimeWindow[];         // e.g. 9–12, 16–19
  averageSessionMinutes: number;            // how long they actually focus
  peakProductivityHour: number;             // 0–23

  // Estimation accuracy
  estimationBias: number;                   // >1 = underestimates, <1 = overestimates

  // Behavioral signals
  // Plain strings are still accepted (legacy data) — code reading these
  // arrays should treat a bare string as "no structured category" and skip
  // it for category-matched logic rather than fail.
  procrastinationPatterns: Array<string | { category: string; note: string }>;
  /** Human-readable burnout signals, derived only from real execution history
   *  (declining completion rate, repeated skips) — consumed by the scheduler
   *  to defer/compress low-risk work rather than just displayed. */
  burnoutIndicators: string[];
  schedulingHabits: Array<string | { category: string; note: string }>;

  // Historical performance
  missedDeadlineRate: number;              // 0–1
  onTimeCompletionRate: number;

  // ── Execution-derived learning (Behavioural Learning Engine) ───────────────
  // Everything below is computed ONLY from real ExecutionRecord history —
  // never hardcoded, never invented. Absent/empty until enough history exists.

  /** completionRate per WorkType (0–1), e.g. { execution: 0.91, documentation: 0.4 } */
  completionRateByWorkType?: Record<string, number>;
  /** estimationBias per WorkType — actualMinutes / estimatedMinutes, averaged.
   *  >1 = this work type consistently takes longer than estimated. */
  estimationBiasByWorkType?: Record<string, number>;
  /** completionRate keyed by hour-of-day started (0–23). */
  completionRateByHour?: Record<number, number>;
  /** Extra minutes of reduced-confidence buffer to add after a meeting,
   *  learned from how often post-meeting tasks get skipped/partial.
   *  Consumed directly by local-fallback.ts to size the recovery block
   *  inserted after meetings ≥45 min — not just stored for display. */
  meetingRecoveryMinutes?: number;
  /** Most recent learning insights, human-readable, generated strictly from
   *  execution history aggregates — rendered verbatim on the "Momentum
   *  Learning" dashboard card. Newest first. */
  learningInsights?: string[];
}

// ── Execution Tracking (Behavioural Learning Engine) ────────────────────────
// Every planner-generated task has a lifecycle. State lives on the task
// itself (denormalized for fast reads); the full history of HOW it got there
// lives in ExecutionRecord, append-only, in Firestore.

export type ExecutionState =
  | "not_started"
  | "in_progress"
  | "paused"
  | "completed"
  | "partially_completed"
  | "skipped"
  | "cancelled";

/** How confident Momentum is that completionState reflects reality. */
export type CompletionSource =
  | "manual"              // user explicitly clicked Complete/Skip/Partial — 100%
  | "expired_prompt"       // user answered the "did you complete this?" prompt — 90%
  | "timer"                // Start→Complete with no gap, timer-derived — 85%
  | "planner_inference"    // assumed from a later replan with no contradicting signal — 60%
  | "none";                // no evidence at all — 10%

export const COMPLETION_CONFIDENCE: Record<CompletionSource, number> = {
  manual: 1.0,
  expired_prompt: 0.9,
  timer: 0.85,
  planner_inference: 0.6,
  none: 0.1,
};

export interface ExecutionRecord {
  id: string;             // record id (Firestore doc id)
  taskId: string;          // == Task.missionId — stable across replans
  goalId?: string;          // top-level goal/mission group, if applicable
  title: string;
  workType: string;        // WorkType, kept as string to avoid a domain.ts → work-types.ts cycle
  plannedStart: ISOString;
  plannedEnd: ISOString;
  actualStart?: ISOString;
  actualEnd?: ISOString;
  estimatedDuration: number; // minutes
  actualDuration?: number;   // minutes
  status: ExecutionState;
  completionConfidence: number;   // 0–1, derived from completionSource
  completionSource: CompletionSource;
  plannerVersion: string;          // PIPELINE_VERSION at plan-creation time
  calendarEventId?: string;
  /** A tiny snapshot of the behavioral signals that drove this placement,
   *  for later "why did Momentum schedule this here" audits. */
  behaviourSnapshot?: { peakProductivityHour: number; estimationBias: number };
  reflection?: string;
  timestamp: ISOString;   // when THIS record/transition was written
}

// ── Recovery ─────────────────────────────────────────────────────────────────

export interface RecoveryPlan {
  id: string;
  triggeredBy: string;          // mission id or "manual"
  createdAt: ISOString;
  strategy: "compress" | "defer" | "delegate" | "drop";
  reasoning: string;
  revisedSchedule: Array<{
    missionId: string;
    newDeadline: ISOString;
    newTimeBlock: TimeWindow;
    rationale: string;
    blockType?: "recovery";
  }>;
  stressScore: number;          // 0–1, lower = less stressful plan
}

// ── Operating Signals (displayed on dashboard) ────────────────────────────

export type SignalType = "risk" | "focus" | "achievement" | "warning" | "insight";

export interface OperatingSignal {
  id: string;
  type: SignalType;
  title: string;
  body: string;
  priority: Priority;
  actionable: boolean;
  action?: string;
  missionId?: string;
  createdAt: ISOString;
}

// ── Daily Brief ───────────────────────────────────────────────────────────

export interface DailyBrief {
  generatedAt: ISOString;
  summary: string;              // Gemini-generated 2–3 sentence executive summary
  topPriority: string;
  riskCount: number;
  focusWindowsProtected: number;
  agentActions: AgentAction[];  // what Nexus already did today
  signals: OperatingSignal[];
}

// ── Agent Actions (shown in UI: "Nexus has already...") ──────────────────

export interface AgentAction {
  id: string;
  agentName: AgentName;
  action: string;               // human-readable past-tense: "Protected 3 focus blocks"
  reasoning: string;
  timestamp: ISOString;
  impact: "high" | "medium" | "low";
}

export type AgentName =
  | "Orchestrator"
  | "PlannerAgent"
  | "RiskEngine"
  | "FocusEngine"
  | "RecoveryAgent"
  | "MemoryEngine";

// ── Timeline (the single merged view every page renders) ──────────────────
// Built ONCE by the orchestrator from calendarEvents + focusWindows. No page
// may merge or re-derive this itself — Dashboard, Day, Calendar, and Why all
// read the same TimelineEntry[] so they can never disagree with each other.

export interface TimelineEntry {
  id: string;
  start: ISOString;
  end: ISOString;
  title: string;
  description: string;
  kind: "calendar" | "focus" | "buffer" | "recovery";
  blockType?: FocusWindow["blockType"];
  missionId?: string;
  protected: boolean;
  /** Current execution lifecycle state — only meaningful for "focus" kind
   *  entries (a Task the user actually executes). Defaults to "not_started"
   *  when no ExecutionRecord exists yet for this missionId today. */
  executionState?: ExecutionState;
}

// ── Execution Summary ───────────────────────────────────────────────────────
// Every derived "pick" a page would otherwise compute itself — top risk,
// peak window, at-risk list, completed-actions list, estimated finish time —
// computed ONCE here. Pages render these fields; they never sort, filter, or
// find their way to the same answer independently.

export interface ExecutionSummary {
  topRiskSignal: RiskSignal | null;
  atRiskSignals: RiskSignal[]; // danger + critical, worst-first
  peakFocusWindow: FocusWindow | null;
  completedActions: string[]; // formatted, ready to render
  estimatedFinishTime: ISOString | null;
}

// ── Orchestrator ──────────────────────────────────────────────────────────

export interface OrchestratorInput {
  userId: string;
  currentDatetime: ISOString;
  missions: Mission[];
  calendarEvents: CalendarEvent[];
  memory: BehavioralMemory;
  triggerReason: "app_open" | "check_in" | "mission_update" | "manual_replan";
}

export interface OrchestratorOutput {
  sessionId: string;
  firestoreSessionId?: string;
  persistedAt?: string;
  persistenceError?: string;
  executedAgents: AgentName[];
  brief: DailyBrief;
  signals: OperatingSignal[];
  focusWindows: FocusWindow[];
  riskSignals: RiskSignal[];
  recoveryPlan?: RecoveryPlan;
  agentActions: AgentAction[];
  /** The resolved, risk-propagated Task Graph behind focusWindows — the same
   *  task IDs (missionId) every page references. Single source, computed once. */
  taskGraph: Task[];
  /** Calendar events + focus/buffer blocks merged and sorted once. Dashboard,
   *  Day, Calendar, and Why all render THIS — none of them may merge or
   *  re-derive a timeline themselves. */
  timeline: TimelineEntry[];
  /** Every "pick" a page would otherwise derive itself, computed once. */
  summary: ExecutionSummary;
  processingMs: number;
  /** True when this result was loaded from the Firestore daily cache (no API call made). */
  fromCache?: boolean;
  /** ISO timestamp of when this result was originally cached. */
  cachedAt?: string;
  /**
   * Pipeline version tag written at session-creation time.
   * The health check invalidates any session whose version doesn't match the
   * current PIPELINE_VERSION constant in useNexus.ts.
   */
  pipelineVersion?: string;
  /**
   * Sorted, comma-joined list of real (non-nexus) calendar event IDs that were
   * fed into the planner when this session was created.  Used by the health
   * check on next load: if the current calendar events produce a different
   * fingerprint, the session was planned with stale / incomplete data and must
   * be regenerated.
   * Old sessions that pre-date this field will have `undefined` here and are
   * always treated as stale.
   */
  calendarFingerprint?: string;
  /** Concrete sentences explaining how THIS plan differs from the previous
   *  one in the same browser session (block moved/shortened, recovery block
   *  inserted, etc.) — computed by diffing focusWindows against the prior
   *  output, never invented. Empty on the very first plan of the day. */
  scheduleChangeExplanations?: string[];
}

// ── Agent contract — every agent implements this ───────────────────────────

export interface AgentResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  reasoning: string;
  agentAction: AgentAction;
  processingMs: number;
}
