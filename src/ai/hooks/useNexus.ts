// ============================================================================
// Nexus OS — useNexus hook v6
// Auto-run is now fully internal to the hook.
// The hook accepts missions + calendarEvents and self-manages the initial load:
//   1. Wait for userId and memory to both be ready.
//   2. Check daily Firestore cache.
//   3. Cache hit → serve instantly. Cache miss → call Gemini.
// Dashboard only needs to call forceRefresh() for manual re-runs.
// ============================================================================

import { useState, useCallback, useRef, useEffect } from "react";
import { AIOrchestrator } from "@/ai/orchestrator/orchestrator";
import { defaultMemory } from "@/ai/memory/memory.engine";
import { computeScheduleDiff } from "@/ai/learning/schedule-diff";
import {
  loadMemory,
  loadTodaySession,
  saveTodaySession,
} from "@/services/firestore.service";
import type {
  OrchestratorOutput,
  Mission,
  CalendarEvent,
  BehavioralMemory,
  OrchestratorInput,
  AgentName,
} from "@/types/domain";
import { nowISO } from "@/lib/utils";

// ── Pipeline version ─────────────────────────────────────────────────────────
// Bump this string any time the planning logic changes in a way that would make
// a previously-cached session wrong (new agent, fixed bug, schema change, etc.).
// Any cached session carrying a different version is automatically stale.
export const PIPELINE_VERSION = "v25-personal-event-classification-fix";

// ── Module-level guard — one auto-run per userId per browser session ─────────
const sessionStarted = new Set<string>();

// ── Status ─────────────────────────────────────────────────────────────────

export type NexusStatus =
  | "idle"
  | "loading_memory"
  | "thinking"
  | "ready"
  | "error";

export interface NexusState {
  status: NexusStatus;
  output: OrchestratorOutput | null;
  error: string | null;
  persistenceError: string | null;
  lastRunAt: string | null;
  thinkingStep: string | null;
  activeAgent: AgentName | null;
  memory: BehavioralMemory | null;
  fromCache: boolean;
}

// ── Thinking steps ─────────────────────────────────────────────────────────

const THINKING_STEPS: Array<{ label: string; agent: AgentName }> = [
  { label: "Loading your behavioral profile...",  agent: "MemoryEngine"  },
  { label: "Assessing deadline risk...",          agent: "RiskEngine"    },
  { label: "Protecting focus windows...",         agent: "FocusEngine"   },
  { label: "Building execution plan...",          agent: "PlannerAgent"  },
  { label: "Synthesizing your daily brief...",    agent: "Orchestrator"  },
];

// ── Hook ───────────────────────────────────────────────────────────────────

export function useNexus(
  userId: string,
  missions: Mission[],
  calendarEvents: CalendarEvent[],
) {
  const orchestrator  = useRef(new AIOrchestrator());
  const memoryRef     = useRef<BehavioralMemory | null>(null);
  // Tracks the most recent output actually rendered this session, kept in a
  // ref (not read from `state` inside the run() closure) specifically so
  // run() — memoized once per userId — always diffs against the LATEST
  // plan, not whatever was current when the closure was created.
  const prevOutputRef = useRef<OrchestratorOutput | null>(null);
  // isRunning prevents concurrent orchestrator calls regardless of call origin
  const isRunning     = useRef(false);
  // Store missions/calendarEvents in refs so the auto-run effect never
  // re-fires just because the arrays were recreated at the call site.
  const missionsRef   = useRef(missions);
  const calendarRef   = useRef(calendarEvents);
  missionsRef.current = missions;
  calendarRef.current = calendarEvents;

  const [state, setState] = useState<NexusState>({
    status:           "idle",
    output:           null,
    error:            null,
    persistenceError: null,
    lastRunAt:        null,
    thinkingStep:     null,
    activeAgent:      null,
    memory:           null,
    fromCache:        false,
  });

  // ── Load memory from Firestore on mount ───────────────────────────────

  useEffect(() => {
    if (!userId || userId === "guest") return;

    setState(s => ({ ...s, status: "loading_memory" }));

    loadMemory(userId)
      .then(memory => {
        console.log("[Momentum] 4. Memory loaded from Firestore");
        memoryRef.current = memory;
        setState(s => ({ ...s, memory, status: "idle" }));
      })
      .catch(err => {
        console.warn("[useNexus] Memory load failed, using defaults:", err);
        const fallback = defaultMemory(userId);
        memoryRef.current = fallback;
        setState(s => ({ ...s, memory: fallback, status: "idle" }));
      });
  }, [userId]);

  // ── Core run function (always calls Gemini) ───────────────────────────

  const run = useCallback(
    async (params: {
      missions: Mission[];
      calendarEvents: CalendarEvent[];
      memory?: BehavioralMemory;
      trigger?: OrchestratorInput["triggerReason"];
    }) => {
      // Mutex: drop concurrent calls that aren't a deliberate force-refresh
      if (isRunning.current && params.trigger !== "manual_replan") {
        console.warn("[useNexus] run() blocked — orchestrator already running.");
        return null;
      }
      isRunning.current = true;

      const memory = params.memory ?? memoryRef.current ?? defaultMemory(userId);

      setState(s => ({
        ...s,
        status:           "thinking",
        error:            null,
        persistenceError: null,
        thinkingStep:     THINKING_STEPS[0].label,
        activeAgent:      THINKING_STEPS[0].agent,
        fromCache:        false,
      }));

      let stepIdx = 0;
      const stepInterval = setInterval(() => {
        stepIdx = Math.min(stepIdx + 1, THINKING_STEPS.length - 1);
        setState(s => ({
          ...s,
          thinkingStep: THINKING_STEPS[stepIdx].label,
          activeAgent:  THINKING_STEPS[stepIdx].agent,
        }));
      }, 900);

      try {
        // ── Diagnostic log: exactly what the planner receives ─────────────
        console.group("[Nexus] Orchestrator input — calendar events");
        console.log(`Total events: ${params.calendarEvents.length}`);
        params.calendarEvents.forEach(ev =>
          console.log(`  ${ev.start} → ${ev.end}  [${ev.source}]  "${ev.title}"`)
        );
        console.groupEnd();

        const input: OrchestratorInput = {
          userId,
          currentDatetime: nowISO(),
          missions:        params.missions,
          calendarEvents:  params.calendarEvents,
          memory,
          triggerReason:   params.trigger ?? "app_open",
        };

        const output = await orchestrator.current.run(input);

        // Stamp the pipeline version so the health check can invalidate stale
        // sessions when planning logic changes.
        output.pipelineVersion = PIPELINE_VERSION;

        // "Every plan must explain WHY it changed" — diff this plan's
        // focusWindows against whatever was on screen before this run, not
        // just report that a replan happened.
        output.scheduleChangeExplanations = computeScheduleDiff(
          prevOutputRef.current?.focusWindows, output.focusWindows,
        );
        prevOutputRef.current = output;

        // Attach a fingerprint of the calendar events used so the health check
        // on next load can detect when the calendar has changed.
        output.calendarFingerprint = params.calendarEvents
          .filter(ev => ev.source !== "nexus" && !ev.isBlocked)
          .map(ev => ev.id)
          .sort()
          .join(",");

        console.log(
          `[useNexus] Writing session with fingerprint covering ` +
          `${params.calendarEvents.filter(ev => ev.source !== "nexus").length} real events.`
        );

        // Write to daily cache — awaited with timeout so it reliably lands
        console.log(`[Momentum] 11. Firestore write initiated for cache`);
        try {
          await Promise.race([
            saveTodaySession(userId, output),
            new Promise<void>((_, reject) =>
              setTimeout(() => reject(new Error("timeout")), 3000)
            ),
          ]);
          console.log(`[Momentum] 12. Cache write success`);
        } catch (e) {
          console.warn("[useNexus] Cache write failed:", e);
          console.log(`[Momentum] 12. Cache write failure: ${e}`);
        }

        clearInterval(stepInterval);
        setState(s => ({
          ...s,
          status:           "ready",
          output:           { ...output, fromCache: false },
          error:            null,
          persistenceError: output.persistenceError ?? null,
          lastRunAt:        nowISO(),
          thinkingStep:     null,
          activeAgent:      null,
          fromCache:        false,
        }));

        return output;
      } catch (err) {
        clearInterval(stepInterval);
        const message = err instanceof Error ? err.message : String(err);
        console.error("[useNexus] Orchestrator failed:", err);
        // NOTE: We do NOT write a fallback session to Firestore here.
        // All agents have local fallbacks — if the orchestrator still throws,
        // writing an empty/broken session would poison the cache for the rest of
        // the day and force the user to see stale error data on every subsequent load.
        setState(s => ({
          ...s,
          status:           "error",
          error:            message,
          persistenceError: null,
          thinkingStep:     null,
          activeAgent:      null,
          fromCache:        false,
        }));
        return null;
      }
    },
    [userId]
  );

  // ── Internal auto-run effect ──────────────────────────────────────────
  // Fires when BOTH userId and memory are ready (state.memory is the signal).
  // Uses module-level sessionStarted Set — immune to re-renders and StrictMode.

  useEffect(() => {
    if (!userId || userId === "guest") return;
    if (!state.memory) return;               // wait for memory to load
    if (sessionStarted.has(userId)) return;  // already ran this session

    sessionStarted.add(userId);

    console.log(`[Momentum] 5. Cache lookup started for ${userId}`);

    // Check cache first
    loadTodaySession(userId)
      .then(cached => {
        // Validate the cached session before serving it.
        // A session is broken if any of these are true:
        //  (a) agents never ran (executedAgents empty — the useNexus error-catch session shape)
        //  (b) the brief summary is a failure message
        //  (c) any agentAction reasoning contains the Gemini error string (old agent catch shape)
        //  (d) any agentAction title ends with " failed" (old catch block strings)
        //  (e) FocusEngine ran but produced zero focus windows — indicates session was
        //      cached before the multi-day calendar fetch, or localFocusProtection failed.
        //  (a.0) Pipeline version mismatch — planning logic was updated since
        //        this session was cached. Always re-run.
        const pipelineVersionMismatch =
          cached?.pipelineVersion !== PIPELINE_VERSION;

        if (pipelineVersionMismatch && cached !== null) {
          console.warn(
            `[useNexus] Pipeline version mismatch — ` +
            `cached: "${cached.pipelineVersion ?? "(none)"}" / ` +
            `current: "${PIPELINE_VERSION}" — discarding and re-running.`,
          );
        }

        const hasFailedActions = cached?.agentActions?.some(a =>
          a.reasoning?.includes("temporarily unavailable") ||
          /\bfailed$/i.test(a.action ?? "")
        ) ?? false;
        const focusEngineRan      = cached?.executedAgents?.includes("FocusEngine") ?? false;
        const hasFocusWindows     = (cached?.focusWindows?.length ?? 0) > 0;
        const missingFocusWindows = focusEngineRan && !hasFocusWindows;

        //  (f) Calendar fingerprint mismatch — the session was planned with a
        //      different set of calendar events than what we just fetched.
        //      This is the most reliable invalidation signal: it catches both
        //      today-only → multi-day upgrades AND real events vs. mock data.
        //      Sessions that pre-date the fingerprint field are also stale.
        const currentRealEvents = calendarRef.current.filter(
          ev => ev.source !== "nexus" && !ev.isBlocked,
        );
        const currentFingerprint = currentRealEvents
          .map(ev => ev.id)
          .sort()
          .join(",");
        const cachedFingerprint  = cached?.calendarFingerprint;

        // If no fingerprint on cached session → old format, always stale.
        // If fingerprint differs → calendar changed, re-plan.
        const fingerprintMismatch =
          cachedFingerprint === undefined ||
          cachedFingerprint !== currentFingerprint;

        if (fingerprintMismatch && cached !== null) {
          console.warn(
            `[useNexus] Calendar fingerprint mismatch — ` +
            `cached: "${cachedFingerprint ?? "(none)"}" / ` +
            `current: "${currentFingerprint}" — re-running with fresh calendar data.`,
          );
        }

        const isHealthy = cached !== null &&
          (cached.executedAgents?.length ?? 0) > 0 &&
          !cached.brief?.summary?.includes("temporarily unavailable") &&
          !hasFailedActions &&
          !missingFocusWindows &&
          !pipelineVersionMismatch &&
          !fingerprintMismatch;

        if (isHealthy && cached) {
          console.log(`[Momentum] 7. Cache hit`);
          console.log(`[Momentum] 8. Cached document contents:`, cached.sessionId);
          console.info("[useNexus] Cache hit — serving today's session.");
          prevOutputRef.current = cached;
          setState(s => ({
            ...s,
            status:    "ready",
            output:    cached,
            lastRunAt: cached.cachedAt ?? nowISO(),
            fromCache: true,
          }));
        } else {
          if (cached) {
            console.warn("[useNexus] Stale/failed session found in cache — discarding and re-running.");
          }
          console.log(`[Momentum] 7. Cache miss`);
          console.log(`[Momentum] 9. Calling pipeline because cache was empty or invalid.`);
          run({
            missions:       missionsRef.current,
            calendarEvents: calendarRef.current,
            trigger:        "app_open",
          });
        }
      })
      .catch(err => {
        console.log(`[Momentum] 7. Cache miss (error)`);
        console.log(`[Momentum] 9. Calling Gemini because cache read failed: ${err}`);
        console.warn("[useNexus] Cache read failed, running live:", err);
        run({
          missions:       missionsRef.current,
          calendarEvents: calendarRef.current,
          trigger:        "app_open",
        });
      });
  }, [userId, state.memory]); // fires exactly once when memory is ready

  // ── Force refresh: bypasses cache, always calls Gemini ────────────────

  const forceRefresh = useCallback(() => {
    sessionStarted.delete(userId);
    run({
      missions:       missionsRef.current,
      calendarEvents: calendarRef.current,
      trigger:        "manual_replan",
    });
  }, [userId, run]);

  const reset = useCallback(() => {
    sessionStarted.delete(userId);
    setState({
      status: "idle", output: null, error: null, persistenceError: null,
      lastRunAt: null, thinkingStep: null, activeAgent: null,
      memory: memoryRef.current,
      fromCache: false,
    });
  }, [userId]);

  return { ...state, run, forceRefresh, reset };
}
