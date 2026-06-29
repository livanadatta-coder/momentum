// ============================================================================
// Nexus OS — Integration Test
// Paste this into browser console OR run: import('@/tests/integration.ts')
// Tests each layer independently so you know exactly where any issue is.
// ============================================================================

import { GeminiService } from "@/ai/gemini/gemini.service";
import { MemoryEngine, defaultMemory } from "@/ai/memory/memory.engine";
import { RiskEngine } from "@/ai/agents/risk.engine";
import { FocusEngine } from "@/ai/agents/focus.engine";
import { PlannerAgent } from "@/ai/agents/planner.agent";
import { AIOrchestrator } from "@/ai/orchestrator/orchestrator";
import { missions, calendarEvents, seedMemory } from "@/data/mock-data";
import { nowISO } from "@/lib/utils";

const TEST_USER_ID = "integration-test-user";
const now = nowISO();

// ── Test runner ────────────────────────────────────────────────────────────

type TestResult = { name: string; pass: boolean; ms: number; detail?: string; error?: string };

async function test(name: string, fn: () => Promise<void>): Promise<TestResult> {
  const t0 = Date.now();
  try {
    await fn();
    const ms = Date.now() - t0;
    console.log(`✅ ${name} (${ms}ms)`);
    return { name, pass: true, ms };
  } catch (err) {
    const ms = Date.now() - t0;
    const error = err instanceof Error ? err.message : String(err);
    console.error(`❌ ${name} (${ms}ms)\n   ${error}`);
    return { name, pass: false, ms, error };
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// ── Individual tests ───────────────────────────────────────────────────────

async function testGeminiConnection() {
  const gemini = new GeminiService(import.meta.env.VITE_GEMINI_API_KEY);
  const result = await gemini.generate({
    prompt: 'Respond with exactly this JSON: {"status":"ok","agent":"gemini"}',
    temperature: 0,
  });
  assert(result.parsed !== undefined, "Gemini did not return parseable JSON");
  assert((result.parsed as { status: string }).status === "ok", "Unexpected JSON shape");
}

async function testMemoryDefault() {
  const memory = defaultMemory(TEST_USER_ID);
  assert(memory.userId === TEST_USER_ID, "userId mismatch");
  assert(memory.estimationBias > 0, "estimationBias must be > 0");
  assert(memory.preferredWorkHours.length > 0, "No preferred work hours");
}

async function testMemorySummarize() {
  const engine = new MemoryEngine();
  const summary = engine.summarize(seedMemory);
  assert(summary.includes("Peak productivity"), "Summary missing peak productivity");
  assert(summary.includes("Preferred work hours"), "Summary missing work hours");
  assert(summary.length > 50, "Summary too short");
}

async function testRiskEngine() {
  const engine = new RiskEngine();
  const result = await engine.assess({
    missions,
    memory: { ...seedMemory, userId: TEST_USER_ID },
    currentDatetime: now,
  });
  assert(result.success, `RiskEngine failed: ${result.error}`);
  assert(result.data !== undefined, "No data returned");
  assert(Array.isArray(result.data!.signals), "signals is not an array");
  assert(
    ["safe", "watch", "danger", "critical"].includes(result.data!.overallRiskLevel),
    "Invalid risk level"
  );
  console.log(`   Risk level: ${result.data!.overallRiskLevel}, signals: ${result.data!.signals.length}`);
}

async function testFocusEngine() {
  const engine = new FocusEngine();
  const result = await engine.protect({
    calendarEvents,
    missions,
    memory: { ...seedMemory, userId: TEST_USER_ID },
    currentDatetime: now,
    daysAhead: 2,
  });
  assert(result.success, `FocusEngine failed: ${result.error}`);
  assert(result.data !== undefined, "No data returned");
  assert(Array.isArray(result.data!.protectedWindows), "protectedWindows is not an array");
  assert(result.data!.protectedWindows.length > 0, "No windows protected");
  console.log(`   Protected windows: ${result.data!.protectedWindows.length}`);
}

async function testPlannerAgent() {
  const agent = new PlannerAgent();
  const result = await agent.plan({
    missions,
    calendarEvents,
    memory: { ...seedMemory, userId: TEST_USER_ID },
    currentDatetime: now,
  });
  assert(result.success, `PlannerAgent failed: ${result.error}`);
  assert(result.data !== undefined, "No data returned");
  assert(Array.isArray(result.data!.prioritizedMissions), "prioritizedMissions not an array");
  assert(result.data!.prioritizedMissions.length > 0, "No missions prioritized");
  console.log(`   Planned missions: ${result.data!.prioritizedMissions.length}, overloaded: ${result.data!.isOverloaded}`);
}

async function testFullOrchestration() {
  const orchestrator = new AIOrchestrator();
  const output = await orchestrator.run({
    userId:          TEST_USER_ID,
    currentDatetime: now,
    missions,
    calendarEvents,
    memory: { ...seedMemory, userId: TEST_USER_ID },
    triggerReason:   "app_open",
  });

  assert(output.sessionId.length > 0, "No session ID");
  assert(output.executedAgents.length >= 3, "Too few agents executed");
  assert(output.brief !== undefined, "No daily brief generated");
  assert(output.brief.summary.length > 20, "Brief summary too short");
  assert(output.brief.topPriority.length > 5, "Top priority too short");
  assert(output.processingMs > 0, "Processing time not recorded");

  console.log(`   Agents: ${output.executedAgents.join(" → ")}`);
  console.log(`   Brief: "${output.brief.summary.slice(0, 80)}..."`);
  console.log(`   Top priority: "${output.brief.topPriority}"`);
  console.log(`   Risk signals: ${output.riskSignals.length}`);
  console.log(`   Focus windows: ${output.focusWindows.length}`);
  console.log(`   Processing: ${output.processingMs}ms`);
}

// ── Run all tests ──────────────────────────────────────────────────────────

export async function runIntegrationTests(): Promise<void> {
  console.group("🧪 Nexus Integration Tests");
  console.log(`Running at: ${new Date().toLocaleString()}`);
  console.log("─".repeat(50));

  const results = await Promise.all([
    // Layer 1: Gemini
    test("Gemini API connection",     testGeminiConnection),
    // Layer 2: Memory (sync — no API call)
    test("Memory default values",     testMemoryDefault),
    test("Memory summarize()",        testMemorySummarize),
  ]);

  // Layer 3: Individual agents (sequential — each costs a Gemini call)
  results.push(await test("RiskEngine.assess()",     testRiskEngine));
  results.push(await test("FocusEngine.protect()",   testFocusEngine));
  results.push(await test("PlannerAgent.plan()",     testPlannerAgent));

  // Layer 4: Full pipeline
  results.push(await test("Full orchestration",      testFullOrchestration));

  console.log("─".repeat(50));
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.group("Failed tests:");
    results.filter(r => !r.pass).forEach(r => console.log(`  ❌ ${r.name}: ${r.error}`));
    console.groupEnd();
  }

  console.groupEnd();
}

// Auto-run when imported directly
runIntegrationTests();
