import { useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { BarRhythm }   from "@/components/nexus/BarRhythm";
import { MiniChart }   from "@/components/nexus/MiniChart";
import { PageIntro }   from "@/components/nexus/PageIntro";
import { SpecCard }    from "@/components/nexus/SpecCard";
import { useNexusData } from "@/providers/NexusDataProvider";
import { whyChanges }  from "@/data/mock-data";
import type { AgentAction, TimelineEntry } from "@/types/domain";
import type { WhyChange }   from "@/data/mock-data";

// ── The real "why" per block lives on the shared timeline (TimelineEntry.
// description is the same why-this/why-now/why-not-later explanation Day and
// Calendar already render) — this page must reference that, not regenerate
// its own explanation text from agentActions or mock copy.

function timelineToChanges(timeline: TimelineEntry[]): WhyChange[] {
  return timeline
    .filter(entry => entry.kind !== "calendar") // only Momentum-authored decisions need explaining
    .map(entry => ({
      id:         entry.id,
      timestamp:  new Date(entry.start).toLocaleString("en-US", {
        weekday: undefined, month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit",
      }),
      title:      entry.title,
      body:       entry.description,
      agent:      "FocusEngine" as AgentAction["agentName"],
      impact:     entry.kind === "buffer" ? "low" : "high",
      reversible: true,
    }));
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function WhyPage() {
  const { output } = useNexusData();

  const changes: WhyChange[] = useMemo(() => {
    if (output?.timeline?.length) {
      const fromTimeline = timelineToChanges(output.timeline);
      if (fromTimeline.length) return fromTimeline;
    }
    return whyChanges;
  }, [output]);

  // Need at least 1 item for the hero card; rest go in the sidebar
  const hero      = changes[0];
  const secondary = changes.slice(1);

  if (!hero) return null;

  return (
    <div className="space-y-10">
      <PageIntro
        eyebrow="Why Momentum planned it this way"
        title="Every adjustment should feel explainable."
        description="Momentum earns trust by showing the reasoning behind the plan, not by acting mysterious."
      />
      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <SpecCard className="p-7 sm:p-8">
          <div className="mb-6 flex items-center gap-2 text-sm text-stone">
            Today <ChevronDown className="h-4 w-4" />
          </div>
          <h2 className="font-serif text-4xl tracking-[-0.035em]">{hero.title}</h2>
          <p className="mt-4 text-base leading-8 text-stone">{hero.body}</p>
          <MiniChart />
        </SpecCard>
        <div className="space-y-5">
          {secondary.map((change, index) => (
            <SpecCard key={change.id} className="p-6">
              <h3 className="font-serif text-2xl leading-tight tracking-[-0.025em]">{change.title}</h3>
              <p className="mt-3 text-sm leading-7 text-stone">{change.body}</p>
              {index === 1 ? <BarRhythm /> : null}
            </SpecCard>
          ))}
        </div>
      </div>
    </div>
  );
}
