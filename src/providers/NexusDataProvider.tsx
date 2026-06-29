// ============================================================================
// Nexus OS — NexusDataProvider
// Single shared context: orchestrator output, calendar events, user info.
// Lifted from DashboardPage so every page reads real data via useNexusData().
// ============================================================================

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useNexus, type NexusStatus } from "@/ai/hooks/useNexus";
import { useExecutionTracking } from "@/ai/hooks/useExecutionTracking";
import { useAuth } from "@/hooks/useAuth";
import { getCalendarAccessToken } from "@/auth/auth.service";
import {
  fetchEventsForRange,
  CalendarServiceError,
} from "@/services/calendar/calendar.service";
import {
  missions as mockMissions,
  calendarEvents as mockCalendarEvents,
} from "@/data/mock-data";
import { DEMO_USER_ID, demoCalendarEvents } from "@/data/demo-workspace";
import type { OrchestratorOutput, CalendarEvent, AgentName, Mission, ExecutionState, ExecutionRecord, BehavioralMemory } from "@/types/domain";

// ── Context shape ─────────────────────────────────────────────────────────────

export interface NexusDataContextValue {
  // Nexus orchestrator state
  status: NexusStatus;
  output: OrchestratorOutput | null;
  thinkingStep: string | null;
  activeAgent: AgentName | null;
  error: string | null;
  persistenceError: string | null;
  fromCache: boolean;
  forceRefresh: () => void;
  // "Last Updated" + replan visibility — so the UI can always tell the user
  // when they're looking at the latest plan and WHY it just changed.
  lastRunAt: string | null;
  replanReason: string | null;
  // Calendar
  calendarEvents: CalendarEvent[];
  calendarSource: "google" | "mock";
  calendarNotice: string | null;
  refreshCalendar: () => Promise<void>;
  // Workload — the same missions fed into the planner, exposed so pages like
  // Reflection can find completed work to feed back into Behavioral Memory.
  missions: Mission[];
  // User
  userId: string;
  displayName: string;
  // Behavioural Memory — exposed read-only so pages (Momentum Learning card,
  // Reflection) can read learned insights without re-deriving them.
  memory: BehavioralMemory | null;
  // Demo Workspace — a first-class, no-OAuth data source. True whenever the
  // current session is running on the demo dataset instead of Google
  // Calendar; the planner pipeline below this point has no idea either way.
  isDemoMode: boolean;
  // Execution Tracking (Behavioural Learning Engine)
  executionStates: Record<string, ExecutionRecord>;
  executionStateOf: (taskId: string) => ExecutionState;
  startTask: (taskId: string) => Promise<void>;
  pauseTask: (taskId: string) => Promise<void>;
  completeTask: (taskId: string) => Promise<void>;
  partialTask: (taskId: string, reflection?: string) => Promise<void>;
  skipTask: (taskId: string, reflection?: string) => Promise<void>;
  cancelTask: (taskId: string) => Promise<void>;
  answerExpiredPrompt: (taskId: string, answer: "completed" | "partially_completed" | "skipped") => Promise<void>;
  // Called by the Reflection page after a reflection is saved — triggers an
  // immediate replan and surfaces a human-readable reason on the Dashboard.
  replanAfterReflection: () => void;
}

const NexusDataContext = createContext<NexusDataContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function NexusDataProvider({ children }: { children: ReactNode }) {
  const { user, hasCalendarAccess, isDemoMode } = useAuth();
  // The ONLY place demo-vs-live branches at the provider level: which userId
  // and which calendar feed the pipeline below receives. Everything from
  // here down — useNexus, the orchestrator, risk, task graph, execution
  // tracking, behavioral learning — takes plain values and has no idea
  // whether they came from Demo Workspace or Google Calendar.
  const userId      = isDemoMode ? DEMO_USER_ID : (user?.uid ?? "");
  const displayName = isDemoMode ? "there" : (user?.displayName?.split(" ")[0] ?? "there");

  // ── Calendar fetch (lifted from DashboardPage) ───────────────────────────

  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(mockCalendarEvents);
  const [calendarReady,  setCalendarReady]  = useState(false);
  const [calendarSource, setCalendarSource] = useState<"google" | "mock">("mock");
  const [calendarNotice, setCalendarNotice] = useState<string | null>(null);

  // ── Planning horizon ─────────────────────────────────────────────────────
  // Computed once from active missions: today through the latest deadline,
  // capped at 7 days. Used for both the calendar fetch and the FocusEngine.

  const planningHorizonDays = (() => {
    const active = mockMissions.filter(m => m.status !== "completed");
    if (!active.length) return 2;
    const latestMs = Math.max(...active.map(m => new Date(m.deadline).getTime()));
    const days = Math.ceil((latestMs - Date.now()) / 86_400_000);
    return Math.min(7, Math.max(2, days));
  })();

  function planningRangeISO(): { startISO: string; endISO: string } {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + planningHorizonDays);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }

  useEffect(() => {
    if (isDemoMode) {
      // Demo Workspace supplies its own calendar directly — no network
      // fetch, no token, nothing to wait on.
      setCalendarEvents(demoCalendarEvents);
      setCalendarSource("mock");
      setCalendarNotice(null);
      setCalendarReady(true);
      return;
    }
    if (!userId) {
      setCalendarReady(false);
      return;
    }
    let cancelled = false;

    async function loadCalendar() {
      const token = getCalendarAccessToken();

      if (!token) {
        if (!cancelled) {
          setCalendarSource("mock");
          setCalendarNotice(
            hasCalendarAccess
              ? null
              : "Calendar access not granted yet — showing sample schedule. Sign in again to connect your real calendar.",
          );
          setCalendarReady(true);
        }
        return;
      }

      try {
        const { startISO, endISO } = planningRangeISO();
        const events = await fetchEventsForRange(token, startISO, endISO);
        if (cancelled) return;

        // ── Diagnostic log: what the calendar fetch actually returned ──────────
        console.group(`[NexusDataProvider] Calendar fetch: ${startISO} → ${endISO}`);
        console.log(`Total events: ${events.length}  (horizon: ${planningHorizonDays} days)`);
        events.forEach(ev =>
          console.log(`  ${ev.start} → ${ev.end}  [${ev.source}]  "${ev.title}"`)
        );
        console.groupEnd();

        setCalendarEvents(events);
        setCalendarSource("google");
        setCalendarNotice(
          events.length === 0
            ? `No events found on your calendar for the next ${planningHorizonDays} days.`
            : null,
        );
      } catch (err) {
        if (cancelled) return;
        setCalendarSource("mock");
        setCalendarNotice(
          err instanceof CalendarServiceError
            ? `Couldn't reach Google Calendar (${err.status ?? "network"}). Showing sample schedule.`
            : "Couldn't reach Google Calendar. Showing sample schedule.",
        );
      } finally {
        if (!cancelled) setCalendarReady(true);
      }
    }

    loadCalendar();
    return () => { cancelled = true; };
  }, [userId, hasCalendarAccess, isDemoMode]);

  const refreshCalendar = useCallback(async () => {
    const token = getCalendarAccessToken();
    if (!token) return;
    try {
      const { startISO, endISO } = planningRangeISO();
      const events = await fetchEventsForRange(token, startISO, endISO);
      setCalendarEvents(events);
      setCalendarSource("google");
    } catch (err) {
      console.error("[NexusDataProvider] Calendar refresh failed:", err);
    }
  }, []);

  // ── Nexus (lifted from DashboardPage) ────────────────────────────────────

  // ── Mission source ────────────────────────────────────────────────────────
  // Google Calendar is the primary source of truth for the user's real
  // workload. When a real calendar is connected, the seeded mock missions
  // ("Finalize Nexus AI orchestration layer", "Deploy to Google Cloud Run", …)
  // must NOT be injected — buildUnifiedWorkload() derives pseudo-missions
  // directly from the user's actual calendar events instead. Mock missions
  // only fill in when no real calendar is connected (demo/sample mode), so
  // the experience still has something to plan around.
  // Demo Workspace behaves exactly like live Google Calendar mechanically:
  // missions=[] and buildUnifiedWorkload() derives pseudo-missions from the
  // calendar events itself — the same code path "google" mode already uses.
  const missionsForPlanning = (isDemoMode || calendarSource === "google") ? [] : mockMissions;

  console.log(
    `[NexusDataProvider] Mission source: ${
      isDemoMode ? "Demo Workspace — pseudo-missions derived from demo calendar"
      : calendarSource === "google" ? "Google Calendar (live) — Firestore missions suppressed"
      : "mock/sample missions"
    }`,
  );

  const {
    status,
    output,
    thinkingStep,
    activeAgent,
    error,
    persistenceError,
    fromCache,
    forceRefresh,
    memory,
    lastRunAt,
  } = useNexus(calendarReady ? userId : "", missionsForPlanning, calendarEvents);

  // ── Replan reason — surfaced on the Dashboard so the user always knows
  // WHY the plan just changed, not just that it changed. ───────────────────
  const [replanReason, setReplanReason] = useState<string | null>(null);

  // Once the new plan actually lands, append the concrete diff (block moved/
  // shortened/recovery inserted) computed by useNexus — not just the generic
  // "because you did X" trigger set immediately by wrapWithReplan below.
  useEffect(() => {
    const explanations = output?.scheduleChangeExplanations;
    if (!explanations?.length) return;
    setReplanReason(prev => (prev ? `${prev} ${explanations[0]}` : explanations[0]));
  }, [output?.scheduleChangeExplanations]);

  // ── Execution Tracking (Behavioural Learning Engine) ─────────────────────
  // Every Start/Pause/Complete/Partial/Skip action writes an append-only
  // ExecutionRecord, then forces a re-plan so Behavioural Memory and the
  // schedule reflect what actually happened — without requiring a restart.
  const tracking = useExecutionTracking(userId, output, memory);

  const wrapWithReplan = useCallback(
    <A extends unknown[]>(fn: (...args: A) => Promise<void>, reason: (...args: A) => string) =>
      async (...args: A) => {
        await fn(...args);
        setReplanReason(reason(...args));
        forceRefresh();
      },
    [forceRefresh],
  );
  const taskTitle = useCallback(
    (taskId: string) => output?.taskGraph.find(t => t.missionId === taskId)?.goal ?? "a task",
    [output],
  );
  const startTask    = useCallback(wrapWithReplan(tracking.startTask, (id) => `Momentum replanned because you started "${taskTitle(id)}".`), [wrapWithReplan, tracking.startTask, taskTitle]);
  const pauseTask    = useCallback(wrapWithReplan(tracking.pauseTask, (id) => `Momentum replanned because you paused "${taskTitle(id)}".`), [wrapWithReplan, tracking.pauseTask, taskTitle]);
  const completeTask = useCallback(wrapWithReplan(tracking.completeTask, (id) => `Momentum replanned your day just now because you completed "${taskTitle(id)}".`), [wrapWithReplan, tracking.completeTask, taskTitle]);
  const partialTask  = useCallback(wrapWithReplan(tracking.partialTask, (id) => `Momentum replanned because you partially completed "${taskTitle(id)}".`), [wrapWithReplan, tracking.partialTask, taskTitle]);
  const skipTask     = useCallback(wrapWithReplan(tracking.skipTask, (id) => `Momentum replanned because you skipped "${taskTitle(id)}".`), [wrapWithReplan, tracking.skipTask, taskTitle]);
  const cancelTask   = useCallback(wrapWithReplan(tracking.cancelTask, (id) => `Momentum replanned because you cancelled "${taskTitle(id)}".`), [wrapWithReplan, tracking.cancelTask, taskTitle]);
  const answerExpiredPrompt = useCallback(wrapWithReplan(tracking.answerExpiredPrompt, (id) => `Momentum replanned after you confirmed the outcome of "${taskTitle(id)}".`), [wrapWithReplan, tracking.answerExpiredPrompt, taskTitle]);

  const replanAfterReflection = useCallback(() => {
    setReplanReason("Momentum replanned tomorrow's schedule based on what it learned from today's reflection.");
    forceRefresh();
  }, [forceRefresh]);

  // ── Force re-plan on mock → google transition ────────────────────────────
  // useNexus auto-runs once per userId per browser session. If that first
  // run fires while calendarSource is still "mock" (Google token not ready
  // yet) and then flips to "google" moments later, nothing else forces a
  // re-plan in the SAME session — the next reload would catch it via the
  // calendar fingerprint check, but the user shouldn't have to reload.
  const prevCalendarSource = useRef(calendarSource);
  useEffect(() => {
    // Only force a re-plan if a plan was ALREADY produced with the old
    // (mock) calendar source — if useNexus's own initial run hasn't fired
    // yet, it'll naturally pick up the now-current calendar data on its own.
    if (prevCalendarSource.current !== "google" && calendarSource === "google" && status === "ready") {
      console.log("[NexusDataProvider] Calendar source flipped mock → google — forcing re-plan.");
      setReplanReason("Momentum replanned because your real calendar just connected.");
      forceRefresh();
    }
    prevCalendarSource.current = calendarSource;
  }, [calendarSource, status, forceRefresh]);

  // ── Attach live execution state to the timeline ──────────────────────────
  // Annotation only — this never re-derives, re-sorts, or re-merges the
  // timeline. It just stamps each focus entry with its current
  // ExecutionState so pages render real-time progress without each page
  // independently joining executionStates against the timeline itself.
  const outputWithExecutionState: OrchestratorOutput | null = output && {
    ...output,
    timeline: output.timeline.map(entry =>
      entry.kind === "focus" && entry.missionId
        ? { ...entry, executionState: tracking.stateOf(entry.missionId) }
        : entry,
    ),
  };

  // ── Provide ───────────────────────────────────────────────────────────────

  return (
    <NexusDataContext.Provider
      value={{
        status,
        output: outputWithExecutionState,
        thinkingStep,
        activeAgent,
        error,
        persistenceError,
        fromCache,
        forceRefresh,
        lastRunAt,
        replanReason,
        calendarEvents,
        calendarSource,
        calendarNotice,
        refreshCalendar,
        missions: missionsForPlanning,
        userId,
        displayName,
        memory,
        isDemoMode,
        executionStates: tracking.states,
        executionStateOf: tracking.stateOf,
        startTask,
        pauseTask,
        completeTask,
        partialTask,
        skipTask,
        cancelTask,
        answerExpiredPrompt,
        replanAfterReflection,
      }}
    >
      {children}
    </NexusDataContext.Provider>
  );
}

// ── Consumer hook ─────────────────────────────────────────────────────────────

export function useNexusData(): NexusDataContextValue {
  const ctx = useContext(NexusDataContext);
  if (!ctx) throw new Error("useNexusData must be used inside <NexusDataProvider>");
  return ctx;
}
