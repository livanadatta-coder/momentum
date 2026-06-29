import { AlertCircle, ArrowRight, ShieldCheck } from "lucide-react";
import { Button }       from "@/components/ui/Button";
import { PageIntro }    from "@/components/nexus/PageIntro";
import { SpecCard }     from "@/components/nexus/SpecCard";
import { useNexusData } from "@/providers/NexusDataProvider";
import type { OrchestratorOutput, RiskSignal } from "@/types/domain";

// ── Derived helpers ───────────────────────────────────────────────────────────

type RiskLevel = RiskSignal["level"];

const RISK_DISPLAY: Record<RiskLevel, { label: string; color: string }> = {
  critical: { label: "Critical", color: "text-coral" },
  danger:   { label: "High",     color: "text-coral" },
  watch:    { label: "Medium",   color: "text-amber" },
  safe:     { label: "Low",      color: "text-sage"  },
};

function getTopRiskLevel(output: OrchestratorOutput | null): RiskLevel | null {
  return output?.summary.topRiskSignal?.level ?? null;
}

function getTopRiskReason(output: OrchestratorOutput | null): string {
  return output?.summary.topRiskSignal?.reason
    ?? "78% chance of missing 2 deadlines without a narrower plan.";
}

/** Every revised task in the recovery plan, not just the single highest-risk
 *  signal — this is what surfaces downstream dependents (e.g. recovering the
 *  coding block also shows the demo/docs/deploy blocks rescheduled after it). */
function getRevisedScheduleActions(output: OrchestratorOutput | null): string[] {
  const schedule = output?.recoveryPlan?.revisedSchedule;
  if (schedule?.length) return schedule.map(s => s.rationale);

  const recs = output?.summary.topRiskSignal?.recommendations;
  if (recs?.length) return recs;

  return [
    "Move tasks to protect the must-win work",
    "Reduce nonessential workload",
    "Build in a recovery buffer",
  ];
}

function getEstimatedFinish(output: OrchestratorOutput | null): string {
  if (!output?.summary.estimatedFinishTime) return "6:20 PM";
  return new Date(output.summary.estimatedFinishTime).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────

const staticActions = [
  "Move tasks to protect the must-win work",
  "Reduce nonessential workload",
  "Build in a recovery buffer",
];

export function RecoveryPage() {
  const { output, status, forceRefresh } = useNexusData();

  const isThinking  = status === "thinking" || status === "loading_memory";
  const riskLevel   = getTopRiskLevel(output);
  const riskDisplay = riskLevel ? RISK_DISPLAY[riskLevel] : null;
  const riskReason  = getTopRiskReason(output);
  const actions     = output ? getRevisedScheduleActions(output) : staticActions;
  const finishTime  = getEstimatedFinish(output);
  const hasRecovery = Boolean(output?.recoveryPlan);

  const riskDescription = output
    ? (riskLevel && riskLevel !== "safe"
        ? `We have detected ${riskDisplay?.label.toLowerCase()} risk across your active missions.`
        : "Your current plan looks on track. No critical risks detected.")
    : "We have detected an overload risk for Friday.";

  const planReadyText = hasRecovery
    ? `${output?.recoveryPlan?.reasoning ?? "Your revised plan is ready."} Focus on the must-win tasks first.`
    : undefined;

  return (
    <div className="grid gap-12 lg:grid-cols-[0.7fr_1fr]">
      <PageIntro
        eyebrow="Recovery"
        title="When the day slips, Momentum makes a better path."
        description="Recovery is designed to feel reassuring. The system should lower pressure, not punish the user for falling behind."
        className="lg:sticky lg:top-10 lg:self-start"
      />

      <div className="space-y-5">
        <SpecCard className="p-7 sm:p-9">
          <h2 className="font-serif text-4xl tracking-[-0.035em]">Momentum Recovery Plan</h2>
          <p className="mt-4 max-w-md text-base leading-8 text-stone">
            {planReadyText ?? riskDescription}
          </p>

          <div className="mt-8 rounded-[18px] border border-coral/25 bg-[#fff3ef] p-5">
            <p className="text-sm text-stone">Risk level</p>
            <p className={`mt-2 font-serif text-3xl ${riskDisplay?.color ?? "text-coral"}`}>
              {riskDisplay?.label ?? "High"}
            </p>
            <p className="mt-3 text-sm leading-6 text-stone">{riskReason}</p>
          </div>

          <div className="mt-8">
            <p className="mb-4 text-sm font-semibold text-ink">Momentum will</p>
            <div className="space-y-4">
              {actions.map((action) => (
                <div key={action} className="flex gap-3 text-sm leading-6 text-stone">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-coral" />
                  {action}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 rounded-[18px] border border-line bg-white p-5 text-sm leading-7 text-stone">
            {hasRecovery
              ? `Plan rebuilt. You are back on track to finish by ${finishTime}.`
              : `You will still finish by ${finishTime} with a focused plan.`}
          </div>

          <Button
            className="mt-7 w-full"
            onClick={forceRefresh}
            disabled={isThinking}
          >
            {isThinking ? "Building plan…" : hasRecovery ? "Rebuild plan" : "Build my recovery plan"}
            {!isThinking && <ArrowRight className="h-4 w-4" />}
          </Button>
        </SpecCard>

        <SpecCard className="flex gap-4 p-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#eef6ef] text-sage">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-serif text-2xl tracking-[-0.025em]">No shame loop.</h3>
            <p className="mt-2 text-sm leading-7 text-stone">
              Momentum recovers the plan without turning missed time into a moral failure.
            </p>
          </div>
        </SpecCard>
      </div>
    </div>
  );
}
