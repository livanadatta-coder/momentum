// ============================================================================
// Nexus OS — Recovery Agent
// When the user falls behind, autonomously rebuild the schedule.
// Minimize stress. Protect the most important deadlines.
// ============================================================================

import type { Mission, BehavioralMemory, RecoveryPlan, RiskSignal, AgentResult, AgentAction } from "@/types/domain";
import { getGeminiService } from "@/ai/gemini/gemini.service";
import { MemoryEngine } from "@/ai/memory/memory.engine";
import { localRecoveryPlan } from "@/ai/local-fallback";
import { generateId, nowISO } from "@/lib/utils";

export interface RecoveryInput {
  missions: Mission[];
  riskSignals: RiskSignal[];
  memory: BehavioralMemory;
  currentDatetime: string;
  triggerMissionId?: string;
}

export class RecoveryAgent {
  private gemini = getGeminiService();
  private memoryEngine = new MemoryEngine();

  async recover(input: RecoveryInput): Promise<AgentResult<RecoveryPlan>> {
    const start = Date.now();
    const memorySummary = this.memoryEngine.summarize(input.memory);

    const atRiskMissions = input.missions.filter(m =>
      input.riskSignals.some(s => s.missionId === m.id && (s.level === "danger" || s.level === "critical"))
    );

    const prompt = `
You are the Recovery Agent for Momentum.

The user is behind on their schedule. Your job is to rebuild a recovery plan that:
1. Protects the most critical deadlines (do NOT move critical-priority items unless absolutely necessary)
2. Minimizes stress — do not create an overwhelming cram plan
3. Is honest — if something must be dropped or deferred, say so clearly
4. Respects the user's working patterns

${memorySummary}

All missions:
${JSON.stringify(input.missions, null, 2)}

At-risk missions:
${JSON.stringify(atRiskMissions, null, 2)}

Risk signals:
${JSON.stringify(input.riskSignals, null, 2)}

Current datetime: ${input.currentDatetime}
Triggered by mission: ${input.triggerMissionId ?? "general schedule review"}

Recovery strategies:
- compress: fit everything in, accepting higher load
- defer: push low-priority items to a later date
- delegate: flag items that could be done by someone else
- drop: explicitly recommend dropping lowest-priority items

Choose the strategy that minimizes stress while protecting critical deadlines.

Respond with JSON only:
{
  "id": "<uuid>",
  "triggeredBy": "${input.triggerMissionId ?? "general"}",
  "createdAt": "${nowISO()}",
  "strategy": "compress|defer|delegate|drop",
  "reasoning": "<2-3 sentences: what went wrong and why this strategy>",
  "revisedSchedule": [
    {
      "missionId": "<id>",
      "newDeadline": "<ISO or same>",
      "newTimeBlock": { "start": "<ISO>", "end": "<ISO>" },
      "rationale": "<one sentence>"
    }
  ],
  "stressScore": 0.4
}
    `.trim();

    try {
      const plan = await this.gemini.generateJSON<RecoveryPlan>({ prompt, temperature: 0.3 });

      const action: AgentAction = {
        id: generateId(),
        agentName: "RecoveryAgent",
        action: `Built recovery plan using "${plan.strategy}" strategy for ${atRiskMissions.length} at-risk missions`,
        reasoning: plan.reasoning,
        timestamp: nowISO(),
        impact: "high",
      };

      return {
        success: true,
        data: plan,
        reasoning: plan.reasoning,
        agentAction: action,
        processingMs: Date.now() - start,
      };
    } catch (error) {
      // Gemini unavailable — generate recovery plan deterministically from risk signals
      console.warn("[RecoveryAgent] Gemini unavailable — computing recovery plan locally:", String(error));
      const localPlan = localRecoveryPlan(input);
      const action: AgentAction = {
        id:        generateId(),
        agentName: "RecoveryAgent",
        action:    `Built recovery plan using "${localPlan.strategy}" strategy for ${atRiskMissions.length} at-risk missions`,
        reasoning: localPlan.reasoning,
        timestamp: nowISO(),
        impact:    "high",
      };
      return {
        success:      true,
        data:         localPlan,
        reasoning:    localPlan.reasoning,
        agentAction:  action,
        processingMs: Date.now() - start,
      };
    }
  }
}
