// ============================================================================
// Nexus OS — Focus Engine
// Determines the user's best focus windows and protects them automatically.
// ============================================================================

import type { CalendarEvent, BehavioralMemory, FocusWindow, AgentResult, AgentAction, Mission, RiskSignal, Task } from "@/types/domain";
import { getGeminiService } from "@/ai/gemini/gemini.service";
import { MemoryEngine } from "@/ai/memory/memory.engine";
import { localFocusProtection } from "@/ai/local-fallback";
import { buildTaskGraph, propagateTaskRisk } from "@/ai/task-graph";
import { WORK_TYPE_PROFILES } from "@/ai/work-types";
import { generateId, nowISO } from "@/lib/utils";

export interface FocusEngineInput {
  calendarEvents: CalendarEvent[];
  missions: Mission[];
  memory: BehavioralMemory;
  currentDatetime: string;
  daysAhead?: number; // default 3
  /** Risk signals from the RiskEngine, run earlier in the pipeline.
   *  Used to propagate risk through the Task Graph and to decide which
   *  task gets the user's peak-productivity slot. */
  riskSignals?: RiskSignal[];
}

export interface FocusEngineOutput {
  protectedWindows: FocusWindow[];
  summary: string;
  calendarEventsToCreate: Array<{
    title: string;
    start: string;
    end: string;
    description: string;
  }>;
  /** The same Task Graph (dependencies resolved, risk propagated) used to
   *  derive protectedWindows — attached regardless of which path (Gemini or
   *  local fallback) produced the windows, since the graph itself is
   *  deterministic and computed once. This is what lets Why/Recovery/Day
   *  reference the exact same task IDs instead of re-deriving anything. */
  taskGraph: Task[];
}

export class FocusEngine {
  private gemini = getGeminiService();
  private memoryEngine = new MemoryEngine();

  async protect(input: FocusEngineInput): Promise<AgentResult<FocusEngineOutput>> {
    const start = Date.now();
    const memorySummary = this.memoryEngine.summarize(input.memory);
    const daysAhead = input.daysAhead ?? 3;
    const activeMissions = input.missions.filter(m => m.status !== "completed");

    // Build the same Task Graph the deterministic fallback uses — Gemini sees
    // the resolved dependencies/risk instead of guessing relationships itself,
    // so both paths converge on the same ordering and reasoning structure.
    const { tasks: taskGraph, log: graphLog } = buildTaskGraph(activeMissions);
    const propagatedTasks = propagateTaskRisk(taskGraph, input.riskSignals ?? []);
    graphLog.forEach(l => console.log(l));

    const prompt = `
You are the Focus Engine for Momentum — an AI executive assistant, not a scheduler.

Your job: schedule meaningful work that SUPPORTS the user's real commitments, using the
dependency graph and risk already computed below. Do not invent unrelated work.

${memorySummary}

Work-type taxonomy (produces/requires artifacts, and the block title to use):
${JSON.stringify(WORK_TYPE_PROFILES, null, 2)}

Task graph for today (already topologically sorted — dependencies come first,
risk already propagated through dependent tasks):
${JSON.stringify(propagatedTasks, null, 2)}

Existing calendar (already blocked):
${JSON.stringify(input.calendarEvents, null, 2)}

Current datetime: ${input.currentDatetime}

Rules:
1. Only protect windows during the user's preferred hours.
2. Each task with a calendarAnchor must be scheduled to END before that anchor's start time,
   and must START after every task in its "dependencies" array has finished.
3. Give the task currently holding the HIGHEST risk in the graph the user's peak hour
   (${input.memory.peakProductivityHour}:00) when a valid slot at that hour exists.
4. Use the work-type taxonomy's blockLabel as the block title (e.g. "💻 Deep Work").
5. Every reason must explicitly answer: why this task, why now, why not later — citing the
   dependency it follows, the event it supports, and/or a specific behavioral-memory fact.
6. Never invent work that isn't in the task graph above.

Respond with JSON only:
{
  "protectedWindows": [
    {
      "window": { "start": "<ISO>", "end": "<ISO>" },
      "quality": "peak|good|moderate|low",
      "protectedBy": "nexus",
      "missionId": "<id>",
      "reason": "<why this, why now, why not later — specific, names real entities>",
      "title": "<blockLabel from the work-type taxonomy>",
      "blockType": "<workType from the task graph, or 'buffer'>"
    }
  ],
  "summary": "<what Momentum protected and why>",
  "calendarEventsToCreate": [
    {
      "title": "<same as title above>",
      "start": "<ISO>",
      "end": "<ISO>",
      "description": "<reason>"
    }
  ]
}
    `.trim();

    try {
      const output = await this.gemini.generateJSON<FocusEngineOutput>({ prompt, temperature: 0.2 });
      output.taskGraph = propagatedTasks; // same graph regardless of which path ran

      const action: AgentAction = {
        id: generateId(),
        agentName: "FocusEngine",
        action: `Protected ${output.protectedWindows.length} focus windows over ${daysAhead} days`,
        reasoning: output.summary,
        timestamp: nowISO(),
        impact: "high",
      };

      return {
        success: true,
        data: output,
        reasoning: output.summary,
        agentAction: action,
        processingMs: Date.now() - start,
      };
    } catch (error) {
      // Gemini unavailable — find free slots and protect them deterministically
      console.warn("[FocusEngine] Gemini unavailable — computing focus windows locally:", String(error));
      const localOutput = localFocusProtection(input);
      const action: AgentAction = {
        id:        generateId(),
        agentName: "FocusEngine",
        action:    `Protected ${localOutput.protectedWindows.length} focus windows over ${daysAhead} days`,
        reasoning: localOutput.summary,
        timestamp: nowISO(),
        impact:    "high",
      };
      return {
        success:      true,
        data:         localOutput,
        reasoning:    localOutput.summary,
        agentAction:  action,
        processingMs: Date.now() - start,
      };
    }
  }
}
