// ── Types ──────────────────────────────────────────────────────────────────
export type * from "./types/domain";

// ── AI Layer ───────────────────────────────────────────────────────────────
export { AIOrchestrator }                        from "./ai/orchestrator/orchestrator";
export { GeminiService, getGeminiService }       from "./ai/gemini/gemini.service";
export { MemoryEngine, defaultMemory }           from "./ai/memory/memory.engine";
export { PlannerAgent }                          from "./ai/agents/planner.agent";
export { RiskEngine }                            from "./ai/agents/risk.engine";
export { FocusEngine }                           from "./ai/agents/focus.engine";
export { RecoveryAgent }                         from "./ai/agents/recovery.agent";

// ── Hooks ──────────────────────────────────────────────────────────────────
export { useNexus }                              from "./ai/hooks/useNexus";
export type { NexusState, NexusStatus }          from "./ai/hooks/useNexus";

// ── Services ───────────────────────────────────────────────────────────────
export {
  loadMemory, saveMemory, updateMemoryField,
  saveSession, loadLatestSession, markLatestSession,
}                                                from "./services/firestore.service";

// ── UI Components ──────────────────────────────────────────────────────────
export { NexusThinking, AgentProgress, AgentPulse } from "./components/ui/NexusThinking";

// ── Utils ──────────────────────────────────────────────────────────────────
export { generateId, nowISO, formatDatetime, hoursBetween, cn } from "./lib/utils";

// ── Data ───────────────────────────────────────────────────────────────────
export { missions, calendarEvents, seedMemory, experienceSteps } from "./data/mock-data";
