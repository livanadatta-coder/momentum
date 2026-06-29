// ============================================================================
// Nexus OS — Planner Agent
// Converts missions + calendar into an execution plan.
// Consults Memory Engine before planning.
// ============================================================================

import type { Mission, CalendarEvent, BehavioralMemory, AgentResult, AgentAction, RiskSignal } from "@/types/domain";
import { getGeminiService } from "@/ai/gemini/gemini.service";
import { MemoryEngine } from "@/ai/memory/memory.engine";
import { localPlannerSchedule } from "@/ai/local-fallback";
import { buildTaskGraph, propagateTaskRisk } from "@/ai/task-graph";
import { WORK_TYPE_PROFILES } from "@/ai/work-types";
import { generateId, nowISO } from "@/lib/utils";

export interface PlannerInput {
  missions: Mission[];
  calendarEvents: CalendarEvent[];
  memory: BehavioralMemory;
  currentDatetime: string;
  /** Risk signals from the RiskEngine, run earlier in the pipeline. */
  riskSignals?: RiskSignal[];
}

export interface PlannerOutput {
  prioritizedMissions: Array<{
    missionId: string;
    rank: number;
    urgencyScore: number;
    suggestedTimeBlock: { start: string; end: string };
    rationale: string;
  }>;
  dailyMilestones: Array<{
    date: string;
    missions: string[];
    expectedLoad: "light" | "moderate" | "heavy";
  }>;
  planReasoning: string;
  isOverloaded: boolean;
  overloadedDays: string[];
}

export class PlannerAgent {
  private gemini = getGeminiService();
  private memoryEngine = new MemoryEngine();

  async plan(input: PlannerInput): Promise<AgentResult<PlannerOutput>> {
    const start = Date.now();
    const memorySummary = this.memoryEngine.summarize(input.memory);
    const activeMissions = input.missions.filter(m => m.status !== "completed");

    // Same Task Graph contract as the Focus Engine — Gemini reasons over the
    // resolved dependencies/propagated risk rather than guessing from scratch.
    const { tasks: taskGraph, log: graphLog } = buildTaskGraph(activeMissions);
    const propagatedTasks = propagateTaskRisk(taskGraph, input.riskSignals ?? []);
    graphLog.forEach(l => console.log(l));

    const prompt = `
You are the Planner Agent for Momentum — an AI executive assistant maximizing the
probability this specific user completes everything, not a slot-filler.

${memorySummary}

Work-type taxonomy (produces/requires artifacts, and the block title to use):
${JSON.stringify(WORK_TYPE_PROFILES, null, 2)}

Task graph (topologically sorted, dependencies resolved, risk already propagated
through dependent tasks — a task inherits risk from what it depends on):
${JSON.stringify(propagatedTasks, null, 2)}

Existing calendar commitments (do NOT schedule over these):
${JSON.stringify(input.calendarEvents.filter(e => !e.isBlocked), null, 2)}

Current datetime: ${input.currentDatetime}

Rules:
1. Schedule during the user's preferred work hours only.
2. A task with a calendarAnchor must end before that anchor's start, and start after every
   task in its "dependencies" array has finished.
3. Rank tasks by their propagated "risk" field, not raw priority — risk already accounts
   for dependency chains, estimation bias, and deadline pressure.
4. If a required artifact has no producer today (see "degradedInput" on a task), say so
   plainly in the rationale and reflect the elevated risk.
5. If the day is overloaded, flag it honestly — do not create an impossible plan.

Respond with JSON only:
{
  "prioritizedMissions": [
    {
      "missionId": "<id>",
      "rank": 1,
      "urgencyScore": "<task's propagated risk, 0-1>",
      "suggestedTimeBlock": { "start": "<ISO>", "end": "<ISO>" },
      "rationale": "<why this task, why now, why not later — name the real dependency/event/memory fact>"
    }
  ],
  "dailyMilestones": [
    {
      "date": "<YYYY-MM-DD>",
      "missions": ["<id>"],
      "expectedLoad": "moderate"
    }
  ],
  "planReasoning": "<2-3 sentences naming the dependency graph and top-risk task>",
  "isOverloaded": false,
  "overloadedDays": []
}
    `.trim();

    try {
      const output = await this.gemini.generateJSON<PlannerOutput>({ prompt, temperature: 0.25 });

      const action: AgentAction = {
        id: generateId(),
        agentName: "PlannerAgent",
        action: `Planned execution schedule for ${input.missions.length} missions`,
        reasoning: output.planReasoning,
        timestamp: nowISO(),
        impact: "high",
      };

      return {
        success: true,
        data: output,
        reasoning: output.planReasoning,
        agentAction: action,
        processingMs: Date.now() - start,
      };
    } catch (error) {
      // Gemini unavailable — build schedule deterministically from memory and deadlines
      console.warn("[PlannerAgent] Gemini unavailable — computing schedule locally:", String(error));
      const localOutput = localPlannerSchedule(input);
      const action: AgentAction = {
        id:        generateId(),
        agentName: "PlannerAgent",
        action:    `Planned execution schedule for ${input.missions.length} missions`,
        reasoning: localOutput.planReasoning,
        timestamp: nowISO(),
        impact:    "high",
      };
      return {
        success:      true,
        data:         localOutput,
        reasoning:    localOutput.planReasoning,
        agentAction:  action,
        processingMs: Date.now() - start,
      };
    }
  }
}
