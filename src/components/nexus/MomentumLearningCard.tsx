// ============================================================================
// Nexus OS — "Momentum Learning" dashboard card
//
// Renders BehavioralMemory.learningInsights VERBATIM. This component never
// computes, sorts, or invents an insight itself — every sentence here was
// generated once, in deriveMemoryFromExecutionHistory (behavioral-learning.ts),
// strictly from real ExecutionRecord aggregates. If there isn't enough
// execution history yet, the card explains that honestly instead of showing
// placeholder insights.
// ============================================================================

import { Sparkles } from "lucide-react";
import { SpecCard } from "@/components/nexus/SpecCard";
import { useNexusData } from "@/providers/NexusDataProvider";

export function MomentumLearningCard() {
  const { memory } = useNexusData();
  const insights = memory?.learningInsights ?? [];

  return (
    <SpecCard className="p-7 sm:p-9">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#fff3ef] text-coral">
          <Sparkles className="h-4 w-4" />
        </div>
        <h3 className="font-serif text-2xl tracking-[-0.025em]">Momentum Learning</h3>
      </div>

      {insights.length === 0 ? (
        <p className="mt-4 text-sm leading-7 text-stone">
          Momentum hasn't seen enough completed, partial, or skipped tasks yet to learn your patterns.
          Start, complete, and skip a few tasks on the Day page — insights will appear here once there's
          real history to learn from.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {insights.map((insight, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-7 text-stone">
              <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-coral" />
              {insight}
            </li>
          ))}
        </ul>
      )}
    </SpecCard>
  );
}
