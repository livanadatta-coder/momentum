// ============================================================================
// Nexus OS — Local Fallback Engine
//
// Deterministic, Gemini-free computation for every pipeline stage.
// Called by each agent when Gemini is unavailable (429, 503, timeout, etc.)
//
// Guarantees:
//   • Every output is derived from the current user's real data — never hardcoded.
//   • Two different users with different memories/calendars produce different outputs.
//   • Output shapes are identical to what Gemini would return — the orchestrator
//     and UI are completely unaware which path ran.
//   • No randomness — given the same inputs the results are deterministic.
//   • Every explanation explicitly names missions, calendar events, times, and
//     the exact evidence used — never a generic phrase.
// ============================================================================

import type {
  Mission,
  BehavioralMemory,
  RiskSignal,
  FocusWindow,
  AgentAction,
  OperatingSignal,
  DailyBrief,
  RecoveryPlan,
  CalendarEvent,
  Task,
} from "@/types/domain";
import type { RiskEngineInput, RiskEngineOutput } from "@/ai/agents/risk.engine";
import type { FocusEngineInput, FocusEngineOutput } from "@/ai/agents/focus.engine";
import type { PlannerInput, PlannerOutput } from "@/ai/agents/planner.agent";
import type { RecoveryInput } from "@/ai/agents/recovery.agent";
import type { MemoryUpdateInput } from "@/ai/memory/memory.engine";
import { generateId, nowISO } from "@/lib/utils";
import { buildTaskGraph, propagateTaskRisk } from "@/ai/task-graph";
import { WORK_TYPE_PROFILES, BUFFER_BLOCK_LABEL, RECOVERY_BLOCK_LABEL, classifyWorkType, type WorkType } from "@/ai/work-types";

// ── Internal time utilities ───────────────────────────────────────────────────

function parseHHMM(t: string): { h: number; m: number } {
  if (t.includes("T")) {
    const d = new Date(t);
    return { h: d.getHours(), m: d.getMinutes() };
  }
  const parts = t.split(":");
  return { h: Number(parts[0] ?? 0), m: Number(parts[1] ?? 0) };
}

function minsFromMidnight(t: string): number {
  const { h, m } = parseHHMM(t);
  return h * 60 + m;
}

function atTime(base: Date, h: number, m: number): Date {
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

function addMins(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60_000);
}

/** Return the LOCAL calendar date as "YYYY-MM-DD".
 *  NEVER use .toISOString().split("T")[0] — that gives the UTC date, which
 *  is wrong for any timezone offset (e.g. IST Monday midnight = UTC Sunday). */
function isoDate(d: Date): string {
  const y   = d.getFullYear();
  const mon = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mon}-${day}`;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function shortTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** "9:00 AM – 1:00 PM" from a preferred-hours period */
function formatPeriod(ph: BehavioralMemory["preferredWorkHours"][number]): string {
  const { h: sh, m: sm } = parseHHMM(ph.start);
  const { h: eh, m: em } = parseHHMM(ph.end);
  return `${shortTime(atTime(new Date(), sh, sm))} – ${shortTime(atTime(new Date(), eh, em))}`;
}

/** "90 minutes" / "2 hours" / "2 hours 15 minutes" */
function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} minutes`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${h} hour${h === 1 ? "" : "s"} ${m} minutes`;
}

/** Rounded to 1 decimal, e.g. 2.5 */
function hoursStr(h: number): string {
  return Number.isInteger(Math.round(h * 2) / 2)
    ? `${(Math.round(h * 2) / 2).toFixed(1)} hours`
    : `${Math.round(h)} hours`;
}

// ── Priority helpers ──────────────────────────────────────────────────────────

const P_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

function byPriorityThenDeadline(missions: Mission[]): Mission[] {
  return [...missions].sort((a, b) => {
    const pd = P_ORDER[b.priority] - P_ORDER[a.priority];
    return pd !== 0 ? pd : new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  });
}

// ── Overlap detection ─────────────────────────────────────────────────────────

type BusySlot = { start: number; end: number };

// Minimum blocking window for calendar events: 45 minutes.
// Google Calendar reminders / tasks can have start === end (zero duration).
// Without this floor, a 5 PM zero-duration event would never block a 5 PM
// focus slot because the overlap test sMs < evE (5PM < 5PM) is always false.
const MIN_EVENT_BLOCK_MS = 45 * 60_000;

function toBusy(events: CalendarEvent[]): BusySlot[] {
  // All-day events (birthdays, holidays) are informational, not commitments —
  // a 24h all-day entry must never block the entire day's scheduling.
  return events.filter(e => !e.allDay).map(e => {
    const start = new Date(e.start).getTime();
    const rawEnd = new Date(e.end).getTime();
    // Guarantee every event blocks at least MIN_EVENT_BLOCK_MS regardless of
    // whether the user set a proper end time.
    const end = Math.max(rawEnd, start + MIN_EVENT_BLOCK_MS);
    return { start, end };
  });
}

function overlaps(s: Date, e: Date, busy: BusySlot[]): boolean {
  const sMs = s.getTime();
  const eMs = e.getTime();
  return busy.some(b => sMs < b.end && eMs > b.start);
}

// ── Advance cursor to the next free slot inside preferred hours ───────────────

function nextFreeSlot(
  from: Date,
  durationMins: number,
  preferredHours: BehavioralMemory["preferredWorkHours"],
  busy: BusySlot[],
  earliest: Date,
): Date {
  let cursor = from < earliest ? new Date(earliest) : new Date(from);

  for (let iter = 0; iter < 1000; iter++) {
    const dayBase = new Date(cursor);
    let advanced = false;

    for (const ph of preferredHours) {
      const smins = minsFromMidnight(ph.start);
      const emins = minsFromMidnight(ph.end);
      const periodStart = atTime(dayBase, Math.floor(smins / 60), smins % 60);
      const periodEnd   = atTime(dayBase, Math.floor(emins / 60), emins % 60);

      if (cursor < periodStart) cursor = new Date(periodStart);
      if (cursor >= periodEnd) continue;

      const slotEnd = addMins(cursor, durationMins);
      if (slotEnd > periodEnd) {
        cursor = new Date(periodEnd);
        continue;
      }

      if (!overlaps(cursor, slotEnd, busy)) return cursor;

      cursor = addMins(cursor, 15);
      advanced = true;
    }

    if (!advanced || cursor.toDateString() === dayBase.toDateString()) {
      const next = new Date(dayBase);
      next.setDate(next.getDate() + 1);
      const first = preferredHours[0];
      if (first) {
        const sm = minsFromMidnight(first.start);
        cursor = atTime(next, Math.floor(sm / 60), sm % 60);
      } else {
        cursor = addMins(cursor, 24 * 60);
      }
    }
  }

  return cursor;
}

/** All non-overlapping slots of `durationMins` that start no earlier than
 *  `earliest` and end no later than `deadline`. When `withinPreferredHours`
 *  is true, also requires the slot to fit inside a preferred-hours period —
 *  used as the FIRST, preferred pass. 15-minute grid. */
function candidateSlotsBefore(
  deadline: Date,
  durationMins: number,
  preferredHours: BehavioralMemory["preferredWorkHours"],
  busy: BusySlot[],
  earliest: Date,
  withinPreferredHours: boolean,
): Date[] {
  const slots: Date[] = [];
  const limit = addMins(deadline, -durationMins);
  let cursor = new Date(earliest);

  while (cursor <= limit) {
    const fitsPeriod = !withinPreferredHours || preferredHours.some(ph => {
      const smins = minsFromMidnight(ph.start);
      const emins = minsFromMidnight(ph.end);
      const periodStart = atTime(cursor, Math.floor(smins / 60), smins % 60);
      const periodEnd   = atTime(cursor, Math.floor(emins / 60), emins % 60);
      return cursor >= periodStart && addMins(cursor, durationMins) <= periodEnd;
    });
    if (fitsPeriod && !overlaps(cursor, addMins(cursor, durationMins), busy)) {
      slots.push(new Date(cursor));
    }
    cursor = addMins(cursor, 15);
  }
  return slots;
}

/** Anchored placement: find the slot for a task that must finish before
 *  `deadline` (its calendar anchor or hard deadline).
 *
 *  Three passes, in order:
 *   1. Preferred hours — the ideal case. Prefer `preferHour` if it's among
 *      the valid slots (highest-risk task gets the peak hour), else the
 *      slot nearest the deadline (tightest, least idle gap).
 *   2. ANY time between earliestStart and deadline, ignoring preferred
 *      hours but still respecting busy time — most "no slot" cases are
 *      "preferred hours too narrow," not "literally no time exists," so
 *      this still keeps the block honestly before its deadline.
 *   3. Only if neither pass finds anything (deadline already in the past,
 *      or the window is fully double-booked) does this fall back to a
 *      forward search past the deadline — and reports `metDeadline: false`
 *      so the caller can word the explanation honestly instead of claiming
 *      "must finish before X" when it didn't. */
function nextFreeSlotBefore(
  deadline: Date,
  durationMins: number,
  preferredHours: BehavioralMemory["preferredWorkHours"],
  busy: BusySlot[],
  earliestStart: Date,
  preferHour?: number,
): { start: Date; metDeadline: boolean } {
  const preferred = candidateSlotsBefore(deadline, durationMins, preferredHours, busy, earliestStart, true);
  if (preferred.length) {
    if (preferHour !== undefined) {
      const peakSlot = preferred.find(s => s.getHours() === preferHour);
      if (peakSlot) return { start: peakSlot, metDeadline: true };
    }
    // Earliest valid slot, not latest — maximizes the buffer before the
    // deadline (more slack = lower completion risk) instead of packing the
    // block right up against the anchor with no room for overrun.
    return { start: preferred[0], metDeadline: true };
  }

  const any = candidateSlotsBefore(deadline, durationMins, preferredHours, busy, earliestStart, false);
  if (any.length) {
    return { start: any[0], metDeadline: true };
  }

  return { start: nextFreeSlot(earliestStart, durationMins, preferredHours, busy, earliestStart), metDeadline: false };
}

/** Buffer-specific placement: unlike a normal task, a buffer's entire purpose
 *  is to sit immediately before the deadline it protects — picking the
 *  EARLIEST valid slot (like normal tasks now do) would place it nowhere
 *  near the anchor and defeat the point. Always takes the latest slot that
 *  still fits before `deadline`. */
function latestFreeSlotBefore(
  deadline: Date,
  durationMins: number,
  preferredHours: BehavioralMemory["preferredWorkHours"],
  busy: BusySlot[],
  earliestStart: Date,
): Date {
  const preferred = candidateSlotsBefore(deadline, durationMins, preferredHours, busy, earliestStart, true);
  if (preferred.length) return preferred[preferred.length - 1];
  const any = candidateSlotsBefore(deadline, durationMins, preferredHours, busy, earliestStart, false);
  if (any.length) return any[any.length - 1];
  return nextFreeSlot(earliestStart, durationMins, preferredHours, busy, earliestStart);
}

// ============================================================================
// 1. Risk Assessment
// ============================================================================

export function localRiskAssessment(input: RiskEngineInput): RiskEngineOutput {
  const now    = new Date(input.currentDatetime).getTime();
  const bias   = input.memory.estimationBias;
  const active = input.missions.filter(m => m.status !== "completed");

  const LEVEL_ORDER: Record<RiskSignal["level"], number> = {
    critical: 4, danger: 3, watch: 2, safe: 1,
  };

  const signals: RiskSignal[] = active.map(mission => {
    const deadline    = new Date(mission.deadline).getTime();
    const hoursLeft   = (deadline - now) / 3_600_000;
    const hoursNeeded = (mission.estimatedMinutes / 60) * bias;
    const buffer      = hoursLeft / Math.max(0.1, hoursNeeded);

    let level: RiskSignal["level"];
    let score: number;

    if (hoursLeft <= 0)    { level = "critical"; score = 1.00; }
    else if (buffer < 1.0) { level = "critical"; score = 0.92; }
    else if (buffer < 1.3) { level = "danger";   score = 0.75; }
    else if (buffer < 2.0) { level = "watch";    score = 0.45; }
    else                   { level = "safe";      score = 0.15; }

    if (mission.priority === "critical" && level === "watch") level = "danger";
    if (input.memory.onTimeCompletionRate < 0.7) score = Math.min(1, score + 0.08);

    // Learned completion rate for THIS work type — "completion rate for
    // deployment is poor → increase deployment risk," from real history,
    // not the flat global onTimeCompletionRate above.
    const workType = classifyWorkType(mission.calendarEventTitle ?? mission.title, mission.category);
    const typeCompletionRate = input.memory.completionRateByWorkType?.[workType];
    let completionRatePenalty = 0;
    if (typeCompletionRate !== undefined && typeCompletionRate < 0.6) {
      completionRatePenalty = Math.round((0.6 - typeCompletionRate) * 100) / 100;
      score = Math.min(1, score + completionRatePenalty);
      if (score >= 0.9) level = "critical";
      else if (score >= 0.7) level = "danger";
      else if (score >= 0.4 && level === "safe") level = "watch";
    }

    const dl              = shortDate(mission.deadline);
    const hoursLeftStr    = hoursStr(hoursLeft);
    const hoursNeededStr  = hoursStr(hoursNeeded);

    // Build a reason that names the mission, deadline, hours, and bias explicitly.
    let reason: string;
    if (hoursLeft <= 0) {
      reason = `"${mission.title}" passed its deadline of ${dl}. Immediate action required.`;
    } else if (level === "critical") {
      reason =
        `"${mission.title}" is due ${dl} with only ${hoursLeftStr} remaining. ` +
        `Your ${mission.estimatedMinutes}-minute estimate × ${bias.toFixed(2)} historical bias ` +
        `means this requires ~${hoursNeededStr} — there is no remaining buffer.`;
    } else if (level === "danger") {
      reason =
        `"${mission.title}" is due ${dl}. ${hoursLeftStr} remain and ` +
        `~${hoursNeededStr} are needed (${mission.estimatedMinutes}m × ${bias.toFixed(2)} bias). ` +
        `Buffer is critically thin — any overrun will cause a miss.`;
    } else if (level === "watch") {
      const bufferH = hoursStr(hoursLeft - hoursNeeded);
      reason =
        `"${mission.title}" is due ${dl}. ${hoursLeftStr} remain against ` +
        `~${hoursNeededStr} needed, leaving only ${bufferH} of slack. ` +
        `A single overrun could push this into danger.`;
    } else {
      reason =
        `"${mission.title}" is on track. ${hoursLeftStr} remain until ${dl} ` +
        `against ~${hoursNeededStr} needed — buffer is healthy.`;
    }

    if (completionRatePenalty > 0 && typeCompletionRate !== undefined) {
      reason += ` Risk raised further — you've completed only ${Math.round(typeCompletionRate * 100)}% of past ${readableArtifact(workType)} tasks.`;
    }

    // Burnout signal — derived only from a real declining completion trend
    // in execution history (see computeBurnoutIndicators). When present,
    // today's workload is treated as riskier across the board, not just for
    // the task type that triggered it — this is what lets Momentum actually
    // "reduce workload because recent completion rates have dropped."
    let burnoutPenalty = 0;
    if (input.memory.burnoutIndicators.length > 0) {
      burnoutPenalty = 0.1;
      score = Math.min(1, score + burnoutPenalty);
      if (score >= 0.9) level = "critical";
      else if (score >= 0.7) level = "danger";
      else if (level === "safe") level = "watch";
      reason += ` Momentum detected a recent decline in completion rate — risk raised and today's lower-priority work will be deferred first.`;
    }

    const recommendations: string[] =
      level === "critical" || level === "danger"
        ? [
            `Begin "${mission.title}" in your next open focus window before ${dl}`,
            `Your ${bias.toFixed(2)}x estimation bias is factored in — do not rely on your original ${mission.estimatedMinutes}-minute estimate`,
          ]
        : [
            `Keep "${mission.title}" on its current schedule — deadline is ${dl}`,
            `Watch for calendar conflicts that could reduce the ${hoursStr(hoursLeft - hoursNeeded)} buffer`,
          ];

    return {
      id: generateId(),
      missionId: mission.id,
      score: Math.round(score * 100) / 100,
      level,
      reason,
      recommendations,
      detectedAt: nowISO(),
    };
  });

  // ── Propagate risk through the Task Graph ────────────────────────────────
  // Risk is no longer calculated in isolation: a thin-buffer coding task now
  // visibly raises the risk of the demo/docs/deploy tasks chained after it.
  const { tasks } = buildTaskGraph(active);
  const propagated = propagateTaskRisk(tasks, signals);
  const taskById = new Map(propagated.map(t => [t.missionId, t]));

  function levelFromScore(score: number): RiskSignal["level"] {
    if (score >= 0.9) return "critical";
    if (score >= 0.7) return "danger";
    if (score >= 0.4) return "watch";
    return "safe";
  }

  for (const signal of signals) {
    const task = taskById.get(signal.missionId);
    if (!task || task.risk <= signal.score) continue;

    const inheritedFrom = task.dependencies
      .map(id => taskById.get(id))
      .filter((t): t is Task => Boolean(t))
      .sort((a, b) => b.risk - a.risk)[0];
    const upstreamMission = inheritedFrom && active.find(m => m.id === inheritedFrom.missionId);

    if (upstreamMission) {
      signal.reason += ` Risk elevated to ${task.risk} because it depends on "${upstreamMission.title}," which is carrying higher risk (${inheritedFrom!.risk}).`;
    } else if (task.degradedInput) {
      signal.reason += ` Risk elevated to ${task.risk} — no task in today's workload produces "${task.degradedInput.wanted.replace(/_/g, " ")}," so this proceeds with degraded input.`;
    }
    signal.score = task.risk;
    signal.level = levelFromScore(task.risk);
  }

  const overallRiskLevel = signals.reduce<RiskSignal["level"]>(
    (worst, s) => (LEVEL_ORDER[s.level] > LEVEL_ORDER[worst] ? s.level : worst),
    "safe",
  );

  const dangerCount = signals.filter(s => s.level === "danger" || s.level === "critical").length;

  // Name specific at-risk missions in the summary
  const atRiskTitles = signals
    .filter(s => s.level === "danger" || s.level === "critical")
    .map(s => {
      const m = active.find(m => m.id === s.missionId);
      return m ? `"${m.title}"` : null;
    })
    .filter(Boolean);

  const summary =
    dangerCount > 0
      ? `${atRiskTitles.join(" and ")} ${dangerCount === 1 ? "requires" : "require"} immediate action. ` +
        `Your ×${bias.toFixed(2)} estimation bias has been applied to all time calculations.`
      : active.length > 0
      ? `All ${active.length} active mission${active.length === 1 ? "" : "s"} are within safe buffer. ` +
        `×${bias.toFixed(2)} estimation bias applied throughout.`
      : "No active missions to assess.";

  return { signals, overallRiskLevel, summary };
}

// ============================================================================
// Shared: schedule a topologically-sorted Task[] against busy time
// ============================================================================
// Used by BOTH localFocusProtection and localPlannerSchedule so there is one
// placement + explanation system, not two diverging ones.

interface Placement {
  task: Task;
  mission: Mission;
  start: Date;
  end: Date;
  isPeakChoice: boolean;
  whyThis: string;
  whyNow: string;
  whyNotLater: string;
}

interface BufferPlacement {
  /** The task this buffer protects, if any — absent for meeting-recovery
   *  buffers, which protect a calendar event rather than a specific task. */
  after?: Placement;
  start: Date;
  end: Date;
  reason: string;
  kind: "deadline" | "meeting_recovery";
}

function readableArtifact(name: string): string {
  return name.replace(/_/g, " ");
}

/** A category-matched note from procrastinationPatterns/schedulingHabits, if any. */
function findCategoryNote(workType: WorkType, memory: BehavioralMemory): string | null {
  const all = [...memory.procrastinationPatterns, ...memory.schedulingHabits];
  const match = all.find(p => typeof p !== "string" && p.category === workType);
  return match && typeof match !== "string" ? match.note : null;
}

/** Learned estimation bias for this work type, if Momentum has seen enough
 *  completed tasks of this type (set by deriveMemoryFromExecutionHistory).
 *  This is the REAL signal — actual past durations for this exact work type
 *  — and takes priority over the legacy flat habit-note penalty below. */
function learnedBiasPenalty(workType: WorkType, memory: BehavioralMemory): number | null {
  const bias = memory.estimationBiasByWorkType?.[workType];
  if (bias === undefined) return null;
  // bias = actual/estimated averaged over real completions. >1 means this
  // work type consistently runs over — widen by exactly that learned ratio
  // instead of a flat guess.
  return Math.max(0, bias - 1);
}

function categoryPenalty(workType: WorkType, memory: BehavioralMemory): number {
  const learned = learnedBiasPenalty(workType, memory);
  if (learned !== null) return learned;
  // No execution history yet for this type — fall back to the
  // reflection-derived habit note (flat widen) instead of nothing.
  return findCategoryNote(workType, memory) ? 0.25 : 0;
}

/** Calendar event IDs whose work has been relocated into its own execution
 *  block (movable AND replacesCalendarEvent — currently just "execution").
 *  Their original time slot is genuinely free now, not still busy. Meetings
 *  and prep-supporting movable work (testing/demo/docs/deploy) keep their
 *  calendar slot blocked since the original commitment still happens there. */
function relocatedCalendarEventIds(tasks: Task[]): Set<string> {
  return new Set(
    tasks
      .filter(t => t.calendarAnchor && WORK_TYPE_PROFILES[t.workType].replacesCalendarEvent)
      .map(t => t.calendarAnchor!.eventId),
  );
}

/** The hour-of-day with the clearly best learned completion rate, if there's
 *  enough history AND it's a meaningfully better hour than the rest —
 *  otherwise null, so the caller falls back to the static
 *  peakProductivityHour rather than overfitting to thin data. */
function bestLearnedHour(memory: BehavioralMemory): number | null {
  const byHour = memory.completionRateByHour;
  if (!byHour) return null;
  const entries = Object.entries(byHour).map(([h, r]) => [Number(h), r] as const);
  if (entries.length < 2) return null;
  const [bestHour, bestRate] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  const avgOthers = entries.filter(([h]) => h !== bestHour).reduce((sum, [, r]) => sum + r, 0) / (entries.length - 1);
  return bestRate - avgOthers >= 0.2 ? bestHour : null;
}

function scheduleTaskGraph(
  tasks: Task[], // already topologically sorted
  missionsById: Map<string, Mission>,
  memory: BehavioralMemory,
  busyInput: BusySlot[],
  now: Date,
  meetingEvents: CalendarEvent[] = [],
): { placements: Placement[]; buffers: BufferPlacement[] } {
  // Own, growing copy — every placement and buffer this function creates
  // must immediately count as busy time for the NEXT task in the loop.
  // Without this, two different tasks can independently search for "the
  // earliest free slot" against the same static calendar-only busy set and
  // both land on the identical time, since neither knows about the other's
  // placement.
  const busy = [...busyInput];
  const buffers: BufferPlacement[] = [];

  // ── Post-meeting recovery — "meetings reduce productivity" ──────────────
  // Every meeting ≥45min gets a recovery window blocked immediately after it
  // so no task gets placed right up against the meeting's end. The SIZE of
  // that window is learned (meetingRecoveryMinutes, derived from how often
  // post-meeting work actually gets skipped/partial) once there's enough
  // history; before that, a small sane default still protects the slot —
  // this is general scheduling behavior, not something that should only
  // exist once Momentum has already seen it go wrong.
  const recoveryMins = memory.meetingRecoveryMinutes ?? 10;
  const learnedRecovery = memory.meetingRecoveryMinutes !== undefined;
  for (const ev of meetingEvents) {
    const evStart = new Date(ev.start).getTime();
    const evEnd = Math.max(new Date(ev.end).getTime(), evStart + 45 * 60_000);
    if (evEnd - evStart < 45 * 60_000) continue;
    const recoveryEnd = evEnd + recoveryMins * 60_000;
    busy.push({ start: evEnd, end: recoveryEnd });
    buffers.push({
      start: new Date(evEnd),
      end: new Date(recoveryEnd),
      kind: "meeting_recovery",
      reason: learnedRecovery
        ? `Recovery time protected after "${ev.title}" — Momentum learned that work scheduled right after meetings is completed less reliably, so ${recoveryMins} minutes are reserved here.`
        : `Recovery time protected after "${ev.title}" — long meetings reduce focus immediately afterward.`,
    });
  }
  // Prefer the hour with the BEST learned completion rate over the static
  // peakProductivityHour, once there's enough real history to trust it —
  // "coding completion rate at 10 AM is highest → scheduler prefers 10 AM."
  const learnedHour = bestLearnedHour(memory);
  const peakHour = learnedHour ?? memory.peakProductivityHour;
  const placedEnd = new Map<string, Date>();
  const placements: Placement[] = [];
  const tasksByMissionId = new Map(tasks.map(t => [t.missionId, t]));

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const mission = missionsById.get(task.missionId);
    if (!mission) continue;

    const notYetPlaced = tasks.slice(i);
    const isHighestRiskRemaining = task.risk >= Math.max(...notYetPlaced.map(t => t.risk));

    const earliestStart = task.dependencies.length
      ? new Date(Math.max(now.getTime(), ...task.dependencies.map(id => placedEnd.get(id)?.getTime() ?? now.getTime())))
      : now;

    const penalty = categoryPenalty(task.workType, memory);
    const baseMins = task.estimatedMinutes || memory.averageSessionMinutes;
    const durationMins = Math.round(baseMins * (1 + penalty));

    // A task whose calendar event it REPLACES (e.g. "execution") has no real
    // external deadline of its own — its original calendar slot was just a
    // placeholder for when the work used to live, not a commitment anything
    // else depends on. What it actually must finish before is whatever its
    // DEPENDENTS are anchored to (e.g. the demo recording or doc session
    // that needs this work done first). Scheduling against the placeholder
    // slot instead of the real downstream deadline is what let "Deep Work"
    // land at 4 PM — AFTER the 3 PM demo recording it was supposed to feed.
    let effectiveAnchor = task.calendarAnchor;
    if (WORK_TYPE_PROFILES[task.workType].replacesCalendarEvent && task.dependents.length) {
      const dependentAnchors = task.dependents
        .map(id => tasksByMissionId.get(id)?.calendarAnchor)
        .filter((a): a is NonNullable<typeof a> => Boolean(a));
      if (dependentAnchors.length) {
        effectiveAnchor = dependentAnchors.reduce((earliest, a) =>
          new Date(a.start).getTime() < new Date(earliest.start).getTime() ? a : earliest,
        );
      }
    }

    let start: Date;
    let metDeadline = true;
    // An anchor whose deadline has already elapsed isn't a scheduling
    // conflict to search around — there is no "before" left today. Treat it
    // as missed and forward-fill, instead of running the before-deadline
    // search (which can never succeed) and reporting a misleading conflict.
    const anchorAlreadyPassed = Boolean(effectiveAnchor) &&
      new Date(effectiveAnchor!.start).getTime() <= now.getTime();

    if (effectiveAnchor && !anchorAlreadyPassed) {
      const deadline = new Date(effectiveAnchor.start);
      ({ start, metDeadline } = nextFreeSlotBefore(
        deadline, durationMins, memory.preferredWorkHours, busy, earliestStart,
        isHighestRiskRemaining ? peakHour : undefined,
      ));
    } else {
      start = nextFreeSlot(earliestStart, durationMins, memory.preferredWorkHours, busy, earliestStart);
      if (anchorAlreadyPassed) metDeadline = false;
    }
    const end = addMins(start, durationMins);
    placedEnd.set(task.missionId, end);

    if (anchorAlreadyPassed) {
      console.warn(
        `[FocusEngine] MISSED — "${effectiveAnchor!.title}" at ` +
        `${shortTime(new Date(effectiveAnchor!.start))} has already passed; "${mission.title}" ` +
        `rescheduled to ${shortTime(start)}–${shortTime(end)} instead.`,
      );
      task.risk = Math.min(1, task.risk + 0.2);
    } else if (effectiveAnchor && !metDeadline) {
      console.warn(
        `[FocusEngine] CONFLICT — "${mission.title}" could not be placed before its ` +
        `${effectiveAnchor === task.calendarAnchor ? "anchor" : "real downstream deadline"} ` +
        `"${effectiveAnchor.title}" at ${shortTime(new Date(effectiveAnchor.start))}; ` +
        `placed ${shortTime(start)}–${shortTime(end)} instead (earliestStart left no room).`,
      );
      // A genuine scheduling conflict is itself a risk signal — reflect it so
      // downstream consumers of taskGraph (Why, Recovery) see it too.
      task.risk = Math.min(1, task.risk + 0.2);
    }

    const isPeakChoice = start.getHours() === peakHour;

    // ── whyThis: the artifact relationship ─────────────────────────────────
    const depTitles = task.dependencies
      .map(id => missionsById.get(id)?.title)
      .filter((t): t is string => Boolean(t));
    let whyThis: string;
    if (task.degradedInput) {
      whyThis = task.degradedInput.gotInstead
        ? `No dedicated ${readableArtifact(task.degradedInput.wanted)} step exists today, so this proceeds using ` +
          `${readableArtifact(task.degradedInput.gotInstead)} instead.`
        : `This needs ${readableArtifact(task.degradedInput.wanted)}, which nothing in today's workload produces — ` +
          `proceeding without it, which is why its risk is elevated.`;
    } else if (depTitles.length) {
      whyThis = `This follows ${depTitles.map(t => `"${t}"`).join(" and ")}, which produced what ` +
        `${effectiveAnchor ? `"${effectiveAnchor.title}"` : `"${mission.title}"`} needs.`;
    } else if (effectiveAnchor) {
      whyThis = `This prepares you directly for "${effectiveAnchor.title}".`;
    } else {
      whyThis = `Independent focus time reserved for "${mission.title}".`;
    }

    // ── whyNow: memory fact or propagated risk ─────────────────────────────
    const learnedBias = memory.estimationBiasByWorkType?.[task.workType];
    const habitNote = findCategoryNote(task.workType, memory);
    let whyNow: string;
    if (learnedBias !== undefined && learnedBias > 1.1) {
      const pct = Math.round((learnedBias - 1) * 100);
      whyNow = `Your last several ${readableArtifact(task.workType)} tasks took ${pct}% longer than estimated — extra time was reserved based on that real history.`;
    } else if (habitNote) {
      whyNow = `${habitNote} Extra time was reserved accordingly.`;
    } else if (isPeakChoice && learnedHour !== null) {
      whyNow = `Scheduled at ${shortTime(start)} — your historical completion rate is highest around ${peakHour}:00, so Momentum prefers this hour over the default.`;
    } else if (isPeakChoice && isHighestRiskRemaining) {
      whyNow = `Scheduled at ${shortTime(start)} — your peak productivity hour (${peakHour}:00) — ` +
        `because this currently carries the highest risk (${task.risk}) in today's chain.`;
    } else if (isPeakChoice) {
      whyNow = `Scheduled at ${shortTime(start)}, your peak productivity hour (${peakHour}:00).`;
    } else {
      whyNow = `Scheduled at ${shortTime(start)}, the nearest open window inside your preferred hours.`;
    }

    // ── whyNotLater: the deadline/anchor constraint ────────────────────────
    // Only claim "must finish before X" when that's actually true — if every
    // preferred-hours AND any-time slot before the anchor was exhausted
    // (metDeadline: false), say so honestly instead of contradicting the
    // placement that follows.
    let whyNotLater: string;
    if (anchorAlreadyPassed) {
      whyNotLater = `"${effectiveAnchor!.title}" at ${shortTime(new Date(effectiveAnchor!.start))} has already passed today — ` +
        `this was rescheduled to the next available opening instead. Risk is elevated.`;
    } else if (effectiveAnchor && metDeadline) {
      whyNotLater = `Must finish before "${effectiveAnchor.title}" at ${shortTime(new Date(effectiveAnchor.start))} — pushing later leaves no buffer.`;
    } else if (effectiveAnchor) {
      const noTimeLeft = new Date(effectiveAnchor.start).getTime() - earliestStart.getTime() < durationMins * 60_000;
      whyNotLater = noTimeLeft
        ? `There wasn't enough time left before "${effectiveAnchor.title}" at ${shortTime(new Date(effectiveAnchor.start))} to fit this — ` +
          `it was placed at the earliest opening after it instead. This dependency is now running behind, and anything that needs it is also at elevated risk.`
        : `Could not fit fully before "${effectiveAnchor.title}" at ${shortTime(new Date(effectiveAnchor.start))} — ` +
          `every slot in that window was already booked, so this was placed at the earliest opening after it instead. Risk is elevated.`;
    } else {
      whyNotLater = `Deadline is ${shortDate(mission.deadline)} — delaying further increases risk.`;
    }

    placements.push({ task, mission, start, end, isPeakChoice, whyThis, whyNow, whyNotLater });
    busy.push({ start: start.getTime(), end: end.getTime() });

    console.log(
      `[FocusEngine] "${WORK_TYPE_PROFILES[task.workType].blockLabel}" for "${mission.title}" placed ` +
      `${shortTime(start)}–${shortTime(end)}, risk ${task.risk}${task.degradedInput ? " (degraded input)" : ""}`,
    );

    // ── Buffer block: terminal task in a chain feeding a hard deadline ─────
    if (task.dependents.length === 0 && task.calendarAnchor) {
      const anchorStart = new Date(task.calendarAnchor.start);
      const gapMins = Math.round((anchorStart.getTime() - end.getTime()) / 60_000);
      if (gapMins > 30) {
        const bufMins = Math.min(20, Math.max(15, Math.round(gapMins / 4)));
        const bufStart = latestFreeSlotBefore(anchorStart, bufMins, memory.preferredWorkHours, busy, end);
        const bufEnd = addMins(bufStart, bufMins);
        buffers.push({
          after: placements[placements.length - 1],
          start: bufStart,
          end: bufEnd,
          kind: "deadline",
          reason: `Buffer reserved before "${task.calendarAnchor.title}" at ${shortTime(anchorStart)} ` +
            `in case "${mission.title}" runs over.`,
        });
        busy.push({ start: bufStart.getTime(), end: bufEnd.getTime() });
      }
    }
  }

  return { placements, buffers };
}

// ============================================================================
// 2. Focus Protection
// ============================================================================

export function localFocusProtection(input: FocusEngineInput): FocusEngineOutput {
  const now = new Date(input.currentDatetime);
  const peakHour = input.memory.peakProductivityHour;

  const active = input.missions.filter(m => m.status !== "completed");
  const missionsById = new Map(active.map(m => [m.id, m]));

  const { tasks, log: graphLog } = buildTaskGraph(active);
  graphLog.forEach(l => console.log(l));
  const riskedTasks = propagateTaskRisk(tasks, input.riskSignals ?? []);

  // Fixed commitments (meetings, etc.) are hard constraints — they always
  // block. Movable work whose calendar entry has been relocated into its
  // own execution block (replacesCalendarEvent) no longer occupies its
  // original time: that slot is genuinely free now, not still "busy."
  const relocatedEventIds = relocatedCalendarEventIds(riskedTasks);
  const realEvents = input.calendarEvents.filter(
    e => e.source !== "nexus" && !relocatedEventIds.has(e.id),
  );
  const busy = toBusy(realEvents);
  const meetingEvents = realEvents.filter(e => !e.allDay && classifyWorkType(e.title) === "meeting");

  const { placements, buffers } = scheduleTaskGraph(riskedTasks, missionsById, input.memory, busy, now, meetingEvents);

  const protectedWindows: FocusWindow[] = [];
  const calendarEventsToCreate: FocusEngineOutput["calendarEventsToCreate"] = [];

  for (const p of placements) {
    const blockTitle = WORK_TYPE_PROFILES[p.task.workType].blockLabel;
    const reason = `${p.whyThis} ${p.whyNow} ${p.whyNotLater}`;
    const quality: FocusWindow["quality"] =
      p.isPeakChoice ? "peak" : p.start.getHours() < 14 ? "good" : "moderate";

    console.log(`[FocusEngine]   reason: ${reason}`);

    protectedWindows.push({
      window:      { start: p.start.toISOString(), end: p.end.toISOString() },
      quality,
      protectedBy: "nexus",
      missionId:   p.mission.id,
      reason,
      title:       blockTitle,
      blockType:   p.task.workType,
    });

    calendarEventsToCreate.push({
      title:       blockTitle,
      start:       p.start.toISOString(),
      end:         p.end.toISOString(),
      description: reason,
    });
  }

  for (const b of buffers) {
    const isRecovery = b.kind === "meeting_recovery";
    const label = isRecovery ? RECOVERY_BLOCK_LABEL : BUFFER_BLOCK_LABEL;
    console.log(`[FocusEngine] "${label}" placed ${shortTime(b.start)}–${shortTime(b.end)} — ${b.reason}`);
    protectedWindows.push({
      window:      { start: b.start.toISOString(), end: b.end.toISOString() },
      quality:     "good",
      protectedBy: "nexus",
      missionId:   b.after?.mission.id,
      reason:      b.reason,
      title:       label,
      blockType:   isRecovery ? "recovery" : "buffer",
    });
    calendarEventsToCreate.push({
      title:       label,
      start:       b.start.toISOString(),
      end:         b.end.toISOString(),
      description: b.reason,
    });
  }

  const periodNames = input.memory.preferredWorkHours.map(formatPeriod).join(" and ");
  const peakWindow  = placements.find(p => p.isPeakChoice);
  const distinctDays = new Set(protectedWindows.map(w => isoDate(new Date(w.window.start)))).size;

  const summary =
    protectedWindows.length > 0
      ? `Built a ${tasks.length}-task dependency graph and protected ${protectedWindows.length} block${protectedWindows.length === 1 ? "" : "s"}` +
        ` across ${distinctDays} day${distinctDays === 1 ? "" : "s"} using your ${periodNames} window${input.memory.preferredWorkHours.length === 1 ? "" : "s"}.` +
        (peakWindow ? ` "${peakWindow.mission.title}" was reserved for your ${peakHour}:00 peak hour.` : "")
      : `No free slots found during your preferred hours (${periodNames}).`;

  return { protectedWindows, summary, calendarEventsToCreate, taskGraph: riskedTasks };
}

// ============================================================================
// 3. Planner Schedule
// ============================================================================

export function localPlannerSchedule(input: PlannerInput): PlannerOutput {
  const now  = new Date(input.currentDatetime);

  const active = input.missions.filter(m => m.status !== "completed");
  const missionsById = new Map(active.map(m => [m.id, m]));

  const { tasks, log: graphLog } = buildTaskGraph(active);
  graphLog.forEach(l => console.log(l));
  const riskedTasks = propagateTaskRisk(tasks, input.riskSignals ?? []);

  // Same rule as Focus Protection: a relocated movable event's original
  // slot is free now, not still busy. Fixed commitments still block.
  const relocatedEventIds = relocatedCalendarEventIds(riskedTasks);
  const realEvents = input.calendarEvents.filter(
    ev => !ev.isBlocked && !relocatedEventIds.has(ev.id),
  );
  const busy = toBusy(realEvents);

  const { placements } = scheduleTaskGraph(riskedTasks, missionsById, input.memory, busy, now);

  const dailyBudgetMins = input.memory.preferredWorkHours.reduce((sum, ph) => {
    return sum + minsFromMidnight(ph.end) - minsFromMidnight(ph.start);
  }, 0);
  const periodNames = input.memory.preferredWorkHours.map(formatPeriod).join(" and ");

  const prioritizedMissions: PlannerOutput["prioritizedMissions"] = [];
  const dailyMap = new Map<string, { missions: string[]; totalMins: number }>();

  placements.forEach((p, idx) => {
    const rationale = `${p.whyThis} ${p.whyNow} ${p.whyNotLater}`;
    const durationMins = Math.round((p.end.getTime() - p.start.getTime()) / 60_000);
    const hoursLeft = (new Date(p.mission.deadline).getTime() - now.getTime()) / 3_600_000;
    const urgency = Math.max(p.task.risk, Math.min(1, (durationMins / 60) / Math.max(1, hoursLeft)));

    prioritizedMissions.push({
      missionId:          p.mission.id,
      rank:               idx + 1,
      urgencyScore:       Math.round(urgency * 100) / 100,
      suggestedTimeBlock: { start: p.start.toISOString(), end: p.end.toISOString() },
      rationale,
    });

    const dayKey = isoDate(p.start);
    if (!dailyMap.has(dayKey)) dailyMap.set(dayKey, { missions: [], totalMins: 0 });
    const day = dailyMap.get(dayKey)!;
    day.missions.push(p.mission.id);
    day.totalMins += durationMins;
  });

  const dailyMilestones: PlannerOutput["dailyMilestones"] = Array.from(dailyMap.entries()).map(
    ([date, { missions, totalMins }]) => ({
      date,
      missions,
      expectedLoad:
        totalMins > dailyBudgetMins * 0.9 ? "heavy"
        : totalMins > dailyBudgetMins * 0.6 ? "moderate"
        : "light",
    }),
  );

  const overloadedDays = dailyMilestones.filter(d => d.expectedLoad === "heavy").map(d => d.date);
  const isOverloaded = overloadedDays.length > 0;

  const top = placements[0];
  const planReasoning =
    active.length === 0
      ? "No active missions to schedule."
      : `Built a dependency graph of ${tasks.length} task${tasks.length === 1 ? "" : "s"} and scheduled them across your ` +
        `${periodNames} window${input.memory.preferredWorkHours.length === 1 ? "" : "s"}. ` +
        (top ? `"${top.mission.title}" was placed first — ${top.whyThis} ` : "") +
        (isOverloaded
          ? `${overloadedDays.length} day${overloadedDays.length === 1 ? "" : "s"} exceed ` +
            `${Math.round(dailyBudgetMins / 60)} available hours — consider deferring lower-risk tasks.`
          : `Workload fits within your ${Math.round(dailyBudgetMins / 60)}-hour daily budget.`);

  return { prioritizedMissions, dailyMilestones, planReasoning, isOverloaded, overloadedDays };
}

// ============================================================================
// 4. Recovery Plan
// ============================================================================

export function localRecoveryPlan(input: RecoveryInput): RecoveryPlan {
  const now = new Date(input.currentDatetime);

  const criticalCount = input.riskSignals.filter(s => s.level === "critical").length;
  const dangerCount   = input.riskSignals.filter(s => s.level === "danger").length;

  const strategy: RecoveryPlan["strategy"] =
    criticalCount > 0 ? "compress"
    : dangerCount > 1  ? "defer"
    : "compress";

  const atRisk = byPriorityThenDeadline(
    input.missions.filter(m =>
      input.riskSignals.some(
        s => s.missionId === m.id && (s.level === "danger" || s.level === "critical"),
      ),
    ),
  );

  const bias = input.memory.estimationBias;
  const revisedSchedule: RecoveryPlan["revisedSchedule"] = [];
  let recoveryCursor = new Date(now);
  const periodNames = input.memory.preferredWorkHours.map(formatPeriod).join(" and ");

  for (const mission of atRisk) {
    const adjustedMins = Math.round(mission.estimatedMinutes * bias);
    const signal       = input.riskSignals.find(s => s.missionId === mission.id);
    const slotStart    = nextFreeSlot(
      recoveryCursor, adjustedMins, input.memory.preferredWorkHours, [], now,
    );
    const blockEnd = addMins(slotStart, adjustedMins);

    let newDeadline = mission.deadline;
    if (strategy === "defer" && mission.priority !== "critical") {
      const d = new Date(mission.deadline);
      d.setDate(d.getDate() + 1);
      newDeadline = d.toISOString();
    }

    const rescheduledTo =
      `${shortTime(slotStart)} on ${new Date(slotStart).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`;

    let rationale: string;
    if (strategy === "defer" && mission.priority !== "critical") {
      rationale =
        `"${mission.title}" rescheduled to ${rescheduledTo} ` +
        `(${formatDuration(adjustedMins)} — ${mission.estimatedMinutes}m × ${bias.toFixed(2)} bias). ` +
        `Deadline shifted to ${shortDate(newDeadline)} to reduce pressure. ` +
        (signal ? `Risk signal: ${signal.reason}` : "");
    } else {
      rationale =
        `"${mission.title}" moved to the earliest opening at ${rescheduledTo} ` +
        `inside your ${periodNames} window ` +
        `(${formatDuration(adjustedMins)} — ${mission.estimatedMinutes}m × ${bias.toFixed(2)} bias). ` +
        (signal ? `Risk signal: ${signal.reason}` : "");
    }

    revisedSchedule.push({
      missionId:    mission.id,
      newDeadline,
      newTimeBlock: { start: slotStart.toISOString(), end: blockEnd.toISOString() },
      rationale,
      blockType:    "recovery",
    });

    recoveryCursor = addMins(blockEnd, 15);
  }

  // Reasoning names specific mission titles
  const atRiskNames = atRisk.map(m => `"${m.title}"`).join(", ");
  const reasoning =
    strategy === "compress"
      ? `${atRiskNames} ${atRisk.length === 1 ? "is" : "are"} at critical or danger risk. ` +
        `Compressing the schedule to begin these immediately inside your ${periodNames} window. ` +
        `Your ×${bias.toFixed(2)} estimation bias has been applied to all time blocks.`
      : `Deferring non-critical tasks by one day to relieve pressure on ${atRiskNames}. ` +
        `Critical-priority items remain at their original deadlines. ` +
        `×${bias.toFixed(2)} estimation bias applied throughout.`;

  return {
    id:             generateId(),
    triggeredBy:    input.triggerMissionId ?? "general",
    createdAt:      nowISO(),
    strategy,
    reasoning,
    revisedSchedule,
    stressScore:    strategy === "compress" ? 0.55 : 0.40,
  };
}

// ============================================================================
// 5. Daily Brief
// ============================================================================

export function localDailyBrief(params: {
  missions:      Mission[];
  actions:       AgentAction[];
  signals:       OperatingSignal[];
  riskSignals:   RiskSignal[];
  focusWindows:  FocusWindow[];
  overallRisk:   string;
}): DailyBrief {
  const { missions, actions, signals, riskSignals, focusWindows } = params;

  const active      = missions.filter(m => m.status !== "completed");
  const atRisk      = riskSignals.filter(s => s.level === "danger" || s.level === "critical");
  const dangerCount = atRisk.length;
  const peakWindow  = focusWindows.find(w => w.quality === "peak");
  const sorted      = byPriorityThenDeadline(active);
  const topMission  = sorted[0];

  // Name at-risk missions in the summary
  const atRiskMissions = atRisk
    .map(s => active.find(m => m.id === s.missionId))
    .filter(Boolean) as Mission[];

  const riskClause =
    dangerCount > 0
      ? `${atRiskMissions.map(m => `"${m.title}"`).join(" and ")} ` +
        `${dangerCount === 1 ? "requires" : "require"} immediate attention`
      : active.length > 0
      ? `all ${active.length} active mission${active.length === 1 ? "" : "s"} are within safe buffer`
      : "no active missions found";

  const focusClause =
    peakWindow
      ? `peak focus window protected at ${shortTime(new Date(peakWindow.window.start))}`
      : focusWindows.length > 0
      ? `${focusWindows.length} focus block${focusWindows.length === 1 ? "" : "s"} protected`
      : "focus windows are being scheduled";

  const summary =
    `Momentum has reviewed ${active.length} active mission${active.length === 1 ? "" : "s"} — ` +
    `${riskClause}. ` +
    `${focusClause.charAt(0).toUpperCase() + focusClause.slice(1)}.`;

  // Top priority names the specific mission and its deadline
  const topPriority = topMission
    ? `Begin "${topMission.title}" — due ${shortDate(topMission.deadline)}, ${topMission.priority} priority`
    : actions[0]?.action ?? "Review your schedule and prioritize by nearest deadline";

  return {
    generatedAt:           nowISO(),
    summary,
    topPriority,
    riskCount:             dangerCount,
    focusWindowsProtected: focusWindows.length,
    agentActions:          actions,
    signals,
  };
}

// ============================================================================
// 6. Memory Update — closes the reflection → memory → tomorrow's-plan loop
// ============================================================================
// Deterministic counterpart to MemoryEngine.update(). Computes bias and
// completion-rate changes directly from completed missions' actual vs.
// estimated time — no LLM required, so the learning loop never stalls just
// because Gemini is unavailable.

export function localMemoryUpdate(input: MemoryUpdateInput): BehavioralMemory {
  const { currentMemory, completedMissions } = input;

  const withActuals = completedMissions.filter(
    m => typeof m.actualMinutesSpent === "number" && m.actualMinutesSpent > 0,
  );

  if (withActuals.length === 0) {
    // Not enough data — keep existing values rather than inventing patterns.
    return { ...currentMemory, updatedAt: nowISO() };
  }

  const ratios = withActuals.map(m => m.actualMinutesSpent! / m.estimatedMinutes);
  const avgRatioToday = ratios.reduce((a, b) => a + b, 0) / ratios.length;

  // Blend into the running average rather than letting one day's data swing
  // it wildly — weight today's sample by how much data it represents.
  const weight = Math.min(0.4, withActuals.length / 10);
  const estimationBias = Math.round(
    (currentMemory.estimationBias * (1 - weight) + avgRatioToday * weight) * 100,
  ) / 100;

  const onTime = withActuals.filter(m => new Date(m.updatedAt) <= new Date(m.deadline)).length;
  const onTimeRatioToday = onTime / withActuals.length;
  const onTimeCompletionRate = Math.round(
    (currentMemory.onTimeCompletionRate * (1 - weight) + onTimeRatioToday * weight) * 100,
  ) / 100;
  const missedDeadlineRate = Math.round((1 - onTimeCompletionRate) * 100) / 100;

  // Only add a structured habit when a clear, repeated pattern shows up —
  // i.e. multiple completions of the same work type overran meaningfully.
  const overrunByType = new Map<string, number[]>();
  for (const m of withActuals) {
    const ratio = m.actualMinutesSpent! / m.estimatedMinutes;
    const key = m.calendarEventTitle ?? m.title;
    const workTypeGuess = /\b(doc|docs|document)\b/i.test(key) ? "documentation"
      : /\b(deploy|push|ship|github)\b/i.test(key) ? "deployment"
      : /\b(test|qa)\b/i.test(key) ? "testing"
      : /\b(demo|record)\b/i.test(key) ? "demo"
      : /\b(code|coding|implement|build)\b/i.test(key) ? "execution"
      : null;
    if (!workTypeGuess) continue;
    if (!overrunByType.has(workTypeGuess)) overrunByType.set(workTypeGuess, []);
    overrunByType.get(workTypeGuess)!.push(ratio);
  }

  const newHabits = [...currentMemory.schedulingHabits];
  for (const [category, categoryRatios] of overrunByType) {
    if (categoryRatios.length < 2) continue; // one data point isn't a pattern
    const avg = categoryRatios.reduce((a, b) => a + b, 0) / categoryRatios.length;
    if (avg < 1.2) continue; // not a meaningful overrun
    const alreadyTracked = newHabits.some(h => typeof h !== "string" && h.category === category);
    if (alreadyTracked) continue;
    newHabits.push({
      category,
      note: `Your ${category} sessions have historically overrun by about ${Math.round((avg - 1) * 100)}%.`,
    });
  }

  console.log(
    `[MemoryEngine] Updated from ${withActuals.length} completed missions: ` +
    `bias ${currentMemory.estimationBias} → ${estimationBias}, ` +
    `on-time rate ${currentMemory.onTimeCompletionRate} → ${onTimeCompletionRate}`,
  );

  return {
    ...currentMemory,
    updatedAt: nowISO(),
    estimationBias,
    onTimeCompletionRate,
    missedDeadlineRate,
    schedulingHabits: newHabits,
  };
}
