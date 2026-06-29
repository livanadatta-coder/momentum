// ============================================================================
// Nexus OS — AI Orchestrator v2
// Coordinates all agents. Persists to Firestore.
//
// Execution strategy (matches the product pipeline: calendar → workload →
// task graph → risk → behavioral memory → execution strategy → schedule):
//   Phase A (serial):      RiskEngine               — risk must exist before scheduling
//   Phase B (parallel):    FocusEngine + PlannerAgent — both consume risk signals,
//                          independent of each other
//   Phase C (conditional): RecoveryAgent            — only if risk >= danger
//   Phase D: DailyBrief                             — synthesises everything
// ============================================================================

import type {
  OrchestratorInput,
  OrchestratorOutput,
  AgentAction,
  OperatingSignal,
  DailyBrief,
  FocusWindow,
  RiskSignal,
  CalendarEvent,
  TimelineEntry,
  Task,
} from "@/types/domain";
import { PlannerAgent } from "@/ai/agents/planner.agent";
import { RiskEngine } from "@/ai/agents/risk.engine";
import { FocusEngine } from "@/ai/agents/focus.engine";
import { RecoveryAgent } from "@/ai/agents/recovery.agent";
import { MemoryEngine } from "@/ai/memory/memory.engine";
import { getGeminiService } from "@/ai/gemini/gemini.service";
import { localDailyBrief } from "@/ai/local-fallback";
import { WORK_TYPE_PROFILES } from "@/ai/work-types";
import {
  saveSession,
  saveMemory,
  markLatestSession,
} from "@/services/firestore.service";
import { buildUnifiedWorkload } from "@/ai/workload";
import { generateId, nowISO } from "@/lib/utils";

export class AIOrchestrator {
  private planner    = new PlannerAgent();
  private riskEngine = new RiskEngine();
  private focusEngine = new FocusEngine();
  private recovery   = new RecoveryAgent();
  private memory     = new MemoryEngine();
  private gemini     = getGeminiService();

  async run(input: OrchestratorInput): Promise<OrchestratorOutput> {
    const sessionId      = generateId();
    const t0             = Date.now();
    const executedAgents: OrchestratorOutput["executedAgents"] = [];
    const allActions: AgentAction[] = [];

    // ── Unified workload ────────────────────────────────────────────────────
    // Merge Firestore missions with Google Calendar work events into one list.
    // Calendar tasks that match a mission annotate it with calendarScheduled.
    // Unmatched calendar tasks become pseudo-missions so the planner can
    // schedule prep time for them and reference them by name.
    const now = new Date(input.currentDatetime);
    const { missions: unifiedMissions } = buildUnifiedWorkload(
      input.missions,
      input.calendarEvents,
      now,
    );
    console.log(
      `[Orchestrator] Unified workload: ${input.missions.length} Firestore missions + ` +
      `${input.calendarEvents.filter(e => e.source !== "nexus" && !e.isBlocked).length} calendar work events ` +
      `→ ${unifiedMissions.length} total work items`,
    );

    // ── Planning horizon — derived from mission deadlines ───────────────────
    // At least 2 days, at most 7. Shared by FocusEngine so it protects windows
    // across every day in the horizon rather than defaulting to 3 days.
    const nowMs  = now.getTime();
    const active = unifiedMissions.filter(m => m.status !== "completed");
    const latestDeadlineMs = active.length
      ? Math.max(...active.map(m => new Date(m.deadline).getTime()))
      : nowMs + 2 * 86_400_000;
    const daysUntilLatest = Math.ceil((latestDeadlineMs - nowMs) / 86_400_000);
    const planningDays = Math.min(7, Math.max(2, daysUntilLatest));

    // ── Phase A — Risk first ─────────────────────────────────────────────────
    // Risk must exist before scheduling: Focus/Planner use propagated risk to
    // decide which task earns the peak-hour slot and to widen estimates for
    // tasks inheriting risk from a dependency.
    const riskResult = await this.riskEngine.assess({
      missions: unifiedMissions,
      memory:   input.memory,
      currentDatetime: input.currentDatetime,
    });
    executedAgents.push("RiskEngine");
    allActions.push(riskResult.agentAction);

    const riskSignals: RiskSignal[] = riskResult.data?.signals  ?? [];
    const overallRisk               = riskResult.data?.overallRiskLevel ?? "safe";

    // ── Phase B — Focus + Planner (parallel, both consume risk) ─────────────
    const [focusResult, planResult] = await Promise.all([
      this.focusEngine.protect({
        calendarEvents:  input.calendarEvents,
        missions:        unifiedMissions,
        memory:          input.memory,
        currentDatetime: input.currentDatetime,
        daysAhead:       planningDays,
        riskSignals,
      }),
      this.planner.plan({
        missions:       unifiedMissions,
        calendarEvents: input.calendarEvents,
        memory:         input.memory,
        currentDatetime: input.currentDatetime,
        riskSignals,
      }),
    ]);

    executedAgents.push("FocusEngine", "PlannerAgent");
    allActions.push(focusResult.agentAction, planResult.agentAction);

    const focusWindows: FocusWindow[] = focusResult.data?.protectedWindows ?? [];
    const taskGraph                   = focusResult.data?.taskGraph ?? [];

    // ── Phase C — Recovery (only when genuinely needed) ─────────────────────
    let recoveryPlan: OrchestratorOutput["recoveryPlan"];
    if (overallRisk === "critical" || overallRisk === "danger") {
      const recoveryResult = await this.recovery.recover({
        missions:    unifiedMissions,
        riskSignals,
        memory:      input.memory,
        currentDatetime: input.currentDatetime,
      });
      executedAgents.push("RecoveryAgent");
      allActions.push(recoveryResult.agentAction);
      recoveryPlan = recoveryResult.data;
    }

    // ── Phase D — Daily Brief (Gemini synthesis of everything) ─────────────
    const signals = this.buildSignals(riskSignals, focusWindows);
    const brief   = await this.generateDailyBrief({
      input,
      actions:            allActions,
      signals,
      riskSignals,
      focusWindows,
      overallRisk,
      planReasoning:      planResult.data?.planReasoning ?? "",
    });
    executedAgents.push("Orchestrator");

    // ── Timeline — the ONE merged view every page renders ───────────────────
    // Built here, once. No page may merge calendarEvents + focusWindows itself.
    const timeline = this.buildTimeline(input.calendarEvents, focusWindows, taskGraph);

    // ── Summary — every "pick" a page would otherwise derive itself ────────
    // Computed once. Dashboard/Recovery render these fields directly; they
    // never sort riskSignals, find the peak window, or filter actions again.
    const summary = this.buildSummary(riskSignals, focusWindows, allActions);

    const output: OrchestratorOutput = {
      sessionId,
      executedAgents,
      brief,
      signals,
      focusWindows,
      riskSignals,
      recoveryPlan,
      taskGraph,
      timeline,
      summary,
      agentActions: allActions,
      processingMs: Date.now() - t0,
    };

    // ── Persist to Firestore (non-blocking — don't await in hot path) ───────
    try {
      const firestoreSessionId = await this.persist(input.userId, input.memory, output);
      output.firestoreSessionId = firestoreSessionId;
      output.persistedAt = nowISO();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      output.persistenceError = message;
      console.error("[Orchestrator] Firestore persist failed:", err);
    }

    return output;
  }

  // ── Build the single merged timeline ──────────────────────────────────────
  // Real (non-nexus) calendar events + the planner's focus/buffer blocks,
  // sorted together. This is the ONLY place this merge happens — Dashboard,
  // Day, Calendar, and Why all read this same array.
  //
  // Calendar events are NOT all immutable: a "1 PM Complete Nexus Coding"
  // entry represents MOVABLE work (per WORK_TYPE_PROFILES[workType].movable),
  // not a fixed appointment. Once the Task Graph has relocated that work to
  // its own execution block (e.g. "💻 Deep Work" at 10:00), the original
  // calendar-kind entry for the same event would just be a stale duplicate
  // of the same work at the wrong time — it's dropped from the timeline.
  // Fixed commitments (meetings, etc.) are never relocated and always stay.
  private buildTimeline(
    calendarEvents: CalendarEvent[],
    focusWindows: FocusWindow[],
    taskGraph: Task[],
  ): TimelineEntry[] {
    // Only hide the original calendar entry when its replacement block
    // actually exists in focusWindows. Without this check, any task whose
    // workType replaces its calendar event gets hidden here unconditionally
    // — if scheduling skipped/failed to place that task for any reason
    // (conflict, error, etc.), BOTH the original event AND its replacement
    // vanish from every page's timeline with no visible trace, even though
    // the task still exists in taskGraph (which is why it could still show
    // up elsewhere, e.g. Reflection's Task Review, which reads taskGraph
    // directly rather than the merged timeline).
    const placedMissionIds = new Set(
      focusWindows.map(fw => fw.missionId).filter((id): id is string => Boolean(id)),
    );
    const relocatedEventIds = new Set(
      taskGraph
        .filter(t =>
          t.calendarAnchor &&
          WORK_TYPE_PROFILES[t.workType].replacesCalendarEvent &&
          placedMissionIds.has(t.missionId),
        )
        .map(t => t.calendarAnchor!.eventId),
    );

    const fromCalendar: TimelineEntry[] = calendarEvents
      .filter(ev => ev.source !== "nexus" && !relocatedEventIds.has(ev.id))
      .map(ev => ({
        id:          ev.id,
        start:       ev.start,
        end:         ev.end,
        title:       ev.title,
        description: ev.source === "google" ? "From your Google Calendar." : "",
        kind:        "calendar" as const,
        missionId:   ev.missionId,
        protected:   false,
      }));

    const fromFocus: TimelineEntry[] = focusWindows.map((fw, idx) => ({
      id:          `fw-${fw.window.start}-${fw.missionId ?? idx}`,
      start:       fw.window.start,
      end:         fw.window.end,
      title:       fw.title ?? "Focus block",
      description: fw.reason,
      kind:        fw.blockType === "buffer" ? "buffer" as const : "focus" as const,
      blockType:   fw.blockType,
      missionId:   fw.missionId,
      protected:   fw.protectedBy === "nexus",
    }));

    // Compare actual instants, not raw ISO text — calendar events may carry
    // a timezone offset (e.g. "...+05:30") while focus blocks are plain UTC
    // ("...Z"). Lexical string comparison of two different ISO formats does
    // NOT correspond to chronological order, which silently shoved every
    // offset-formatted calendar entry to the end of the timeline regardless
    // of its real time.
    return [...fromCalendar, ...fromFocus].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
    );
  }

  // ── Build the execution summary ───────────────────────────────────────────
  private buildSummary(
    riskSignals: RiskSignal[],
    focusWindows: FocusWindow[],
    actions: AgentAction[],
  ): OrchestratorOutput["summary"] {
    const LEVEL_ORDER: Record<RiskSignal["level"], number> = {
      critical: 4, danger: 3, watch: 2, safe: 1,
    };

    const atRiskSignals = riskSignals
      .filter(s => s.level === "danger" || s.level === "critical")
      .sort((a, b) => LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level]);

    const topRiskSignal = riskSignals.length
      ? [...riskSignals].sort((a, b) => LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level])[0]
      : null;

    const peakFocusWindow = focusWindows.find(w => w.quality === "peak") ?? null;

    const completedActions = actions
      .filter(a => a.impact === "high" || a.impact === "medium")
      .slice(0, 4)
      .map(a => a.action);

    const estimatedFinishTime = focusWindows.length
      ? focusWindows[focusWindows.length - 1].window.end
      : null;

    return { topRiskSignal, atRiskSignals, peakFocusWindow, completedActions, estimatedFinishTime };
  }

  // ── Build operating signals ───────────────────────────────────────────────

  private buildSignals(
    riskSignals: RiskSignal[],
    focusWindows: FocusWindow[]
  ): OperatingSignal[] {
    const signals: OperatingSignal[] = [];

    for (const risk of riskSignals) {
      if (risk.level === "safe") continue;
      signals.push({
        id:         generateId(),
        type:       risk.level === "critical" ? "risk" : "warning",
        title:      risk.level === "critical" ? "Critical risk detected" : "Mission at risk",
        body:       risk.reason,
        priority:   risk.level === "critical" ? "critical" : "high",
        actionable: true,
        action:     risk.recommendations[0],
        missionId:  risk.missionId,
        createdAt:  nowISO(),
      });
    }

    const peak = focusWindows.find(w => w.quality === "peak");
    if (peak) {
      signals.push({
        id:         generateId(),
        type:       "focus",
        title:      "Peak focus window protected",
        body:       peak.reason,
        priority:   "medium",
        actionable: false,
        createdAt:  nowISO(),
      });
    }

    return signals;
  }

  // ── Daily Brief via Gemini ────────────────────────────────────────────────

  private async generateDailyBrief(params: {
    input: OrchestratorInput;
    actions: AgentAction[];
    signals: OperatingSignal[];
    riskSignals: RiskSignal[];
    focusWindows: FocusWindow[];
    overallRisk: string;
    planReasoning: string;
  }): Promise<DailyBrief> {
    const dangerCount = params.riskSignals.filter(
      s => s.level === "danger" || s.level === "critical"
    ).length;

    const prompt = `
You are the intelligence layer behind Momentum, writing Today's Execution Brief.

This appears the moment the user opens the app, answering: "What has Momentum already done for me?"

Inputs:
- Current datetime: ${params.input.currentDatetime}
- Active missions: ${params.input.missions.length}
- Overall risk level: ${params.overallRisk}
- Missions at risk: ${dangerCount}
- Focus windows protected: ${params.focusWindows.length}
- Peak focus window: ${params.focusWindows.find(w => w.quality === "peak")?.window.start ?? "none identified"}
- Agent actions completed: ${JSON.stringify(params.actions.map(a => a.action))}
- Planner strategy: ${params.planReasoning}

Tone rules:
- Sound like a calm, competent Chief of Staff — never a chatbot or assistant
- Use past tense: "Momentum has identified...", "Three focus blocks protected..."
- Be specific: name actual counts, times, and what was done
- Do NOT use emoji, exclamation marks, or cheerful language
- One sentence per thought. No padding.
- topPriority: the single most important thing the user should do first

Respond with JSON only — no markdown fences:
{
  "generatedAt": "${nowISO()}",
  "summary": "<2 sentences, executive tone>",
  "topPriority": "<imperative sentence: what to do first>",
  "riskCount": ${dangerCount},
  "focusWindowsProtected": ${params.focusWindows.length},
  "agentActions": ${JSON.stringify(params.actions)},
  "signals": ${JSON.stringify(params.signals)}
}
    `.trim();

    try {
      return await this.gemini.generateJSON<DailyBrief>({ prompt, temperature: 0.35 });
    } catch (err) {
      // Gemini unavailable — generate brief from already-computed pipeline results
      console.warn("[Orchestrator] Gemini unavailable for Daily Brief — generating locally.");
      return localDailyBrief({
        missions:     params.input.missions,
        actions:      params.actions,
        signals:      params.signals,
        riskSignals:  params.riskSignals,
        focusWindows: params.focusWindows,
        overallRisk:  params.overallRisk,
      });
    }
  }

  // ── Firestore persistence (fire-and-forget) ───────────────────────────────

  private async persist(
    userId: string,
    memory: import("@/types/domain").BehavioralMemory,
    output: OrchestratorOutput
  ): Promise<string> {
    await saveMemory({ ...memory, updatedAt: nowISO() });
    const firestoreId = await saveSession(userId, output);
    await markLatestSession(userId, firestoreId);
    return firestoreId;
  }
}
