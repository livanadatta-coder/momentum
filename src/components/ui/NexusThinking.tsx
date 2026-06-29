// ============================================================================
// Nexus OS — NexusThinking & AgentPulse
// Design-system-aware thinking state components.
// Uses only: framer-motion, lucide-react, Tailwind tokens already in the project.
// ============================================================================

import { motion, AnimatePresence } from "framer-motion";
import { Brain, Calendar, Eye, RefreshCcw, Zap, CheckCircle2 } from "lucide-react";
import type { AgentName } from "@/types/domain";

// ── Per-agent visual config ─────────────────────────────────────────────────

const AGENT_META: Record<AgentName, { label: string; Icon: React.ElementType }> = {
  MemoryEngine:   { label: "Loading behavioral profile",  Icon: Brain       },
  RiskEngine:     { label: "Assessing deadline risk",     Icon: Eye         },
  FocusEngine:    { label: "Protecting focus windows",    Icon: Calendar    },
  PlannerAgent:   { label: "Building execution plan",     Icon: Zap         },
  RecoveryAgent:  { label: "Preparing recovery plan",     Icon: RefreshCcw  },
  Orchestrator:   { label: "Synthesizing daily brief",    Icon: Brain       },
};

const AGENT_ORDER: AgentName[] = [
  "MemoryEngine",
  "RiskEngine",
  "FocusEngine",
  "PlannerAgent",
  "Orchestrator",
];

// ── Inline thinking strip ───────────────────────────────────────────────────
// Shown inside SpecCard while orchestrator runs.

interface NexusThinkingProps {
  step: string | null;
  activeAgent?: AgentName | null;
}

export function NexusThinking({ step, activeAgent }: NexusThinkingProps) {
  if (!step) return null;
  const activeLabel = activeAgent ? AGENT_META[activeAgent].label : step;

  return (
    <div className="flex items-center gap-3 py-2" title={activeLabel}>
      {/* Coral pulse dot — matches the brand */}
      <span className="relative flex h-2 w-2 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-coral opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-coral" />
      </span>

      <AnimatePresence mode="wait">
        <motion.p
          key={step}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: 0.18 }}
          className="text-sm text-stone font-medium"
        >
          {step}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

// ── Agent progress strip ────────────────────────────────────────────────────
// Shown during orchestration — horizontal row of agent steps.

interface AgentProgressProps {
  activeAgent: AgentName | null;
  completedAgents?: AgentName[];
}

export function AgentProgress({ activeAgent, completedAgents = [] }: AgentProgressProps) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {AGENT_ORDER.map((name, i) => {
        const { label, Icon } = AGENT_META[name];
        const isActive    = activeAgent === name;
        const isCompleted = completedAgents.includes(name);
        const isPending   = !isActive && !isCompleted;

        return (
          <motion.div
            key={name}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            className={`
              flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
              transition-all duration-300
              ${isActive    ? "bg-coral/10 text-coral border border-coral/30"     : ""}
              ${isCompleted ? "bg-sage/10  text-sage  border border-sage/20"      : ""}
              ${isPending   ? "bg-white/40 text-stone border border-line"         : ""}
            `}
          >
            {isCompleted ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <Icon className={`h-3 w-3 ${isActive ? "animate-pulse" : ""}`} />
            )}
            <span className="hidden sm:inline">{label}</span>
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Completed agent pulse row ───────────────────────────────────────────────
// Shown after orchestration completes — which agents ran.

interface AgentPulseProps {
  agents: AgentName[];
}

export function AgentPulse({ agents }: AgentPulseProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {agents.map((name, i) => {
        const { label, Icon } = AGENT_META[name] ?? {
          label: name,
          Icon: Brain,
        };
        return (
          <motion.div
            key={name}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.07 }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs
                       bg-white/60 border border-line text-stone"
          >
            <Icon className="h-3 w-3 text-sage" />
            {label}
          </motion.div>
        );
      })}
    </div>
  );
}
