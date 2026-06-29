// ============================================================================
// Nexus OS — Memory Engine
// Stores and updates behavioral intelligence. Every other agent consults this
// before making decisions. This is NOT chat history.
// ============================================================================

import type { BehavioralMemory, Mission, AgentResult, AgentAction } from "@/types/domain";
import { getGeminiService } from "@/ai/gemini/gemini.service";
import { generateId, nowISO } from "@/lib/utils";

// ── Default memory (new user) ──────────────────────────────────────────────

export function defaultMemory(userId: string): BehavioralMemory {
  return {
    userId,
    updatedAt: nowISO(),
    preferredWorkHours: [
      { start: "09:00", end: "12:00" },
      { start: "16:00", end: "19:00" },
    ],
    averageSessionMinutes: 45,
    peakProductivityHour: 10,
    estimationBias: 1.3,          // most people underestimate by ~30%
    procrastinationPatterns: [],
    burnoutIndicators: [],
    schedulingHabits: [],
    missedDeadlineRate: 0,
    onTimeCompletionRate: 1,
  };
}

// ── Memory update input ────────────────────────────────────────────────────

export interface MemoryUpdateInput {
  userId: string;
  currentMemory: BehavioralMemory;
  completedMissions: Mission[];
  currentDatetime: string;
}

// ── Memory Engine ──────────────────────────────────────────────────────────

export class MemoryEngine {
  private gemini = getGeminiService();

  async update(input: MemoryUpdateInput): Promise<AgentResult<BehavioralMemory>> {
    const start = Date.now();

    const prompt = `
You are the Memory Engine for Momentum.

Analyze the user's completed tasks and current behavioral memory, then produce an updated memory profile.

Current Memory:
${JSON.stringify(input.currentMemory, null, 2)}

Recently Completed Tasks:
${JSON.stringify(input.completedMissions, null, 2)}

Current datetime: ${input.currentDatetime}

Instructions:
- Compare estimated vs actual time for each task. Update estimationBias.
- Look for patterns: which tasks were completed ahead of schedule? Which were delayed?
- Update missedDeadlineRate and onTimeCompletionRate based on new data.
- Infer any new procrastination patterns, burnout indicators (e.g. declining completion rate, repeated skips), or scheduling habits.
- If not enough data, keep existing values. Do not invent patterns.
- Return the FULL updated BehavioralMemory object, preserving any fields you were given that you have no new evidence to change (e.g. completionRateByWorkType, estimationBiasByWorkType, completionRateByHour, meetingRecoveryMinutes — these are computed elsewhere from raw execution history, not by you).

Respond with JSON only:
{
  "userId": "${input.userId}",
  "updatedAt": "<current ISO datetime>",
  "preferredWorkHours": [...],
  "averageSessionMinutes": <number>,
  "peakProductivityHour": <0-23>,
  "estimationBias": <number>,
  "procrastinationPatterns": [...],
  "burnoutIndicators": [...],
  "schedulingHabits": [...],
  "missedDeadlineRate": <0-1>,
  "onTimeCompletionRate": <0-1>
}
    `.trim();

    try {
      const fromGemini = await this.gemini.generateJSON<BehavioralMemory>({ prompt, temperature: 0.2 });

      // Execution-derived fields (completionRateByWorkType, estimationBiasByWorkType,
      // completionRateByHour, meetingRecoveryMinutes, learningInsights) are computed
      // deterministically from real ExecutionRecord history elsewhere — Gemini was
      // never given the raw history to derive them from, so its response must never
      // overwrite or invent them here.
      const updated: BehavioralMemory = {
        ...fromGemini,
        completionRateByWorkType: input.currentMemory.completionRateByWorkType,
        estimationBiasByWorkType: input.currentMemory.estimationBiasByWorkType,
        completionRateByHour: input.currentMemory.completionRateByHour,
        meetingRecoveryMinutes: input.currentMemory.meetingRecoveryMinutes,
        learningInsights: input.currentMemory.learningInsights,
      };

      const action: AgentAction = {
        id: generateId(),
        agentName: "MemoryEngine",
        action: "Updated behavioral memory from recent task completions",
        reasoning: `Analyzed ${input.completedMissions.length} completed tasks to refine estimation bias and productivity patterns`,
        timestamp: nowISO(),
        impact: "medium",
      };

      return {
        success: true,
        data: updated,
        reasoning: "Behavioral memory updated from task completion data",
        agentAction: action,
        processingMs: Date.now() - start,
      };
    } catch (error) {
      return {
        success: false,
        error: String(error),
        reasoning: "Memory update failed — keeping existing memory",
        agentAction: {
          id: generateId(),
          agentName: "MemoryEngine",
          action: "Memory update attempted but failed",
          reasoning: String(error),
          timestamp: nowISO(),
          impact: "low",
        },
        processingMs: Date.now() - start,
      };
    }
  }

  // Serialize memory to a concise context string for other agents
  summarize(memory: BehavioralMemory): string {
    const noteOf = (p: string | { category: string; note: string }) =>
      typeof p === "string" ? p : `[${p.category}] ${p.note}`;
    const patterns = [...memory.procrastinationPatterns, ...memory.schedulingHabits].map(noteOf);
    const byType = memory.completionRateByWorkType
      ? Object.entries(memory.completionRateByWorkType).map(([t, r]) => `${t}: ${Math.round(r * 100)}% completed`).join(", ")
      : null;
    const biasByType = memory.estimationBiasByWorkType
      ? Object.entries(memory.estimationBiasByWorkType).map(([t, b]) => `${t}: ${Math.round((b - 1) * 100)}% over estimate`).join(", ")
      : null;
    return `
User Behavioral Profile:
- Peak productivity: ${memory.peakProductivityHour}:00
- Preferred work hours: ${memory.preferredWorkHours.map(w => `${w.start}–${w.end}`).join(", ")}
- Average focus session: ${memory.averageSessionMinutes} min
- Estimation bias: ${memory.estimationBias}x (underestimates by ${Math.round((memory.estimationBias - 1) * 100)}%)
- On-time completion rate: ${Math.round(memory.onTimeCompletionRate * 100)}%
- Missed deadline rate: ${Math.round(memory.missedDeadlineRate * 100)}%
- Burnout indicators: ${memory.burnoutIndicators.join("; ") || "none yet"}
- Known patterns: ${patterns.join("; ") || "none yet"}
${byType ? `- Completion rate by work type: ${byType}` : ""}
${biasByType ? `- Estimation bias by work type: ${biasByType}` : ""}
${memory.meetingRecoveryMinutes ? `- Needs ~${memory.meetingRecoveryMinutes}min recovery buffer after meetings` : ""}
    `.trim();
  }
}
