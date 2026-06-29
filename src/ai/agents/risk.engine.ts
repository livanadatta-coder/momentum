// ============================================================================
// Nexus OS — Risk Engine
// Predicts missed deadlines before they happen. This is the "predict" phase
// of the Observe → Predict → Plan → Execute → Recover loop.
// ============================================================================

import type { Mission, BehavioralMemory, RiskSignal, AgentResult, AgentAction } from "@/types/domain";
import { getGeminiService } from "@/ai/gemini/gemini.service";
import { MemoryEngine } from "@/ai/memory/memory.engine";
import { localRiskAssessment } from "@/ai/local-fallback";
import { buildTaskGraph } from "@/ai/task-graph";
import { generateId, nowISO } from "@/lib/utils";

export interface RiskEngineInput {
  missions: Mission[];
  memory: BehavioralMemory;
  currentDatetime: string;
}

export interface RiskEngineOutput {
  signals: RiskSignal[];
  overallRiskLevel: "safe" | "watch" | "danger" | "critical";
  summary: string;
}

export class RiskEngine {
  private gemini = getGeminiService();
  private memoryEngine = new MemoryEngine();

  async assess(input: RiskEngineInput): Promise<AgentResult<RiskEngineOutput>> {
    const start = Date.now();
    const memorySummary = this.memoryEngine.summarize(input.memory);

    // Only assess non-completed missions
    const activeMissions = input.missions.filter(m => m.status !== "completed");

    if (activeMissions.length === 0) {
      const action: AgentAction = {
        id: generateId(),
        agentName: "RiskEngine",
        action: "No active missions to assess",
        reasoning: "All missions completed",
        timestamp: nowISO(),
        impact: "low",
      };
      return {
        success: true,
        data: { signals: [], overallRiskLevel: "safe", summary: "No active missions." },
        reasoning: "No active missions",
        agentAction: action,
        processingMs: Date.now() - start,
      };
    }

    // Build the same Task Graph the deterministic fallback uses so Gemini's
    // risk reasoning accounts for dependency chains too — a thin-buffer
    // coding task should inflate the risk of the demo/docs/deploy tasks
    // chained after it, not just its own buffer.
    const { tasks: taskGraph, log: graphLog } = buildTaskGraph(activeMissions);
    graphLog.forEach(l => console.log(l));

    const prompt = `
You are the Risk Engine for Momentum.

Your job: predict which missions will be missed BEFORE they are missed.
Be honest, not optimistic. Factor in the user's behavioral history AND dependency chains —
risk should flow through dependencies: if an upstream task is at risk, every task that
depends on it inherits some of that risk too.

${memorySummary}

Active missions:
${JSON.stringify(activeMissions, null, 2)}

Dependency graph for these missions (topologically sorted; "dependencies" names which
other missionIds must finish first; "degradedInput" flags a missing required artifact):
${JSON.stringify(taskGraph, null, 2)}

Current datetime: ${input.currentDatetime}

For each mission, calculate:
1. Time remaining until deadline (hours)
2. Time needed (estimated + estimation bias of ${input.memory.estimationBias}x)
3. Current status momentum
4. Risk inherited from any missions it depends on (a task is never riskier in isolation
   than the reality that its prerequisite might be late)
5. Risk score 0–1, including inherited risk

Risk levels:
- safe: on track, plenty of buffer
- watch: tight but doable
- danger: likely to miss without intervention
- critical: will miss deadline unless drastic action taken

Respond with JSON only:
{
  "signals": [
    {
      "id": "<uuid>",
      "missionId": "<id>",
      "score": 0.85,
      "level": "danger",
      "reason": "<specific, honest, one sentence>",
      "recommendations": ["<concrete action 1>", "<concrete action 2>"],
      "detectedAt": "<current ISO datetime>"
    }
  ],
  "overallRiskLevel": "danger",
  "summary": "<2 sentences: what Momentum found and what it recommends>"
}
    `.trim();

    try {
      const output = await this.gemini.generateJSON<RiskEngineOutput>({ prompt, temperature: 0.2 });

      const dangerCount = output.signals.filter(s => s.level === "danger" || s.level === "critical").length;

      const action: AgentAction = {
        id: generateId(),
        agentName: "RiskEngine",
        action: `Assessed ${activeMissions.length} missions — found ${dangerCount} at risk`,
        reasoning: output.summary,
        timestamp: nowISO(),
        impact: dangerCount > 0 ? "high" : "low",
      };

      return {
        success: true,
        data: output,
        reasoning: output.summary,
        agentAction: action,
        processingMs: Date.now() - start,
      };
    } catch (error) {
      // Gemini unavailable — compute risk deterministically from real mission data
      console.warn("[RiskEngine] Gemini unavailable — computing risk locally:", String(error));
      const localOutput = localRiskAssessment(input);
      const dangerCount = localOutput.signals.filter(
        s => s.level === "danger" || s.level === "critical",
      ).length;
      const action: AgentAction = {
        id:        generateId(),
        agentName: "RiskEngine",
        action:    `Assessed ${activeMissions.length} missions — found ${dangerCount} at risk`,
        reasoning: localOutput.summary,
        timestamp: nowISO(),
        impact:    dangerCount > 0 ? "high" : "low",
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
