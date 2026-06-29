import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button }       from "@/components/ui/Button";
import { DayTimeline }  from "@/components/nexus/DayTimeline";
import { PageIntro }    from "@/components/nexus/PageIntro";
import { SpecCard }     from "@/components/nexus/SpecCard";
import { useNexusData } from "@/providers/NexusDataProvider";
import type { OrchestratorOutput } from "@/types/domain";
import type { TimelineItem } from "@/data/mock-data";

// ── Date key helpers (LOCAL time — never UTC) ─────────────────────────────────
// ISO strings from the pipeline store UTC. Converting to a Date and reading
// .getFullYear()/.getMonth()/.getDate() gives the user's LOCAL calendar date,
// which is what should drive the Day view navigation.

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Extract the LOCAL calendar date from any ISO string */
function isoToLocalDateKey(iso: string): string {
  return toDateKey(new Date(iso));
}

function addDays(dateKey: string, n: number): string {
  // Parse at local noon to avoid DST edge cases shifting the date
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + n);
  return toDateKey(d);
}

function todayKey(): string {
  return toDateKey(new Date());
}

function formatDayHeader(dateKey: string): string {
  const today    = todayKey();
  const tomorrow = addDays(today, 1);
  if (dateKey === today)    return "Today";
  if (dateKey === tomorrow) return "Tomorrow";
  // Parse at noon to avoid midnight DST shifts
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

function formatSubheader(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

function formatDuration(start: Date, end: Date): string {
  const ms = Math.max(0, end.getTime() - start.getTime());
  const h  = Math.floor(ms / 3600000);
  const m  = Math.round((ms % 3600000) / 60000);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ── Map the planner's shared timeline to this page's display shape ────────────
// The merge (calendar events + focus/buffer blocks, sorted) happens exactly
// once, in the orchestrator (see TimelineEntry / buildTimeline). This page
// only filters by date and formats — it does not merge or re-derive anything.

function timelineToItems(
  output: OrchestratorOutput | null,
  dateKey: string, // LOCAL date key "YYYY-MM-DD"
): TimelineItem[] {
  if (!output?.timeline?.length) return [];

  return output.timeline
    .filter(entry => isoToLocalDateKey(entry.start) === dateKey)
    .map(entry => {
      const start = new Date(entry.start);
      const end   = new Date(entry.end);
      return {
        id:          entry.id,
        time:        start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        title:       entry.title,
        description: entry.description,
        type:        entry.kind === "calendar" ? "meeting" :
                     entry.kind === "buffer"   ? "buffer"  :
                     entry.kind === "recovery" ? "task"    : "focus",
        duration:    formatDuration(start, end),
        protected:   entry.protected,
        missionId:   entry.missionId,
        executionState: entry.executionState,
      } satisfies TimelineItem;
    });
}

// ── Derive navigable date range ───────────────────────────────────────────────

function planningBounds(output: OrchestratorOutput | null): { minKey: string; maxKey: string } {
  const today = todayKey();

  // Always allow navigation at least 7 days forward so the user can browse
  // future days even before the pipeline has placed sessions there.
  const dates: string[] = [today, addDays(today, 7)];

  output?.timeline?.forEach(entry => dates.push(isoToLocalDateKey(entry.start)));

  dates.sort();
  return {
    minKey: today,
    maxKey: dates[dates.length - 1] ?? today,
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function DayPage() {
  const navigate = useNavigate();
  const { output } = useNexusData();

  const [selectedDate, setSelectedDate] = useState(todayKey);

  const { minKey, maxKey } = useMemo(() => planningBounds(output), [output]);

  const timelineItems = useMemo(
    () => timelineToItems(output, selectedDate),
    [output, selectedDate],
  );

  const canGoPrev = selectedDate > minKey;
  const canGoNext = selectedDate < maxKey;

  return (
    <div className="grid gap-12 lg:grid-cols-[0.72fr_1fr]">
      <PageIntro
        eyebrow="Your Day"
        title="Your day has a shape now."
        description="Momentum arranges the day as a readable sequence instead of a pile of commitments."
        className="lg:sticky lg:top-10 lg:self-start"
      />
      <SpecCard className="p-7 sm:p-9">
        {/* Header with date navigation */}
        <div className="mb-8 flex items-start justify-between gap-5">
          <div>
            <h2 className="font-serif text-4xl tracking-[-0.035em]">
              {formatDayHeader(selectedDate)}
            </h2>
            <p className="mt-2 text-sm text-stone">
              {formatSubheader(selectedDate)}
            </p>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => canGoPrev && setSelectedDate(addDays(selectedDate, -1))}
              disabled={!canGoPrev}
              aria-label="Previous day"
              className="rounded-md p-1.5 text-stone transition hover:bg-soft disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {selectedDate !== todayKey() && (
              <button
                onClick={() => setSelectedDate(todayKey())}
                className="rounded-md px-2 py-1 text-xs text-stone transition hover:bg-soft"
              >
                Today
              </button>
            )}
            <button
              onClick={() => canGoNext && setSelectedDate(addDays(selectedDate, 1))}
              disabled={!canGoNext}
              aria-label="Next day"
              className="rounded-md p-1.5 text-stone transition hover:bg-soft disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <CalendarDays className="ml-1 h-5 w-5 text-stone" />
          </div>
        </div>

        {timelineItems.length === 0 ? (
          <p className="py-8 text-center text-sm text-stone">
            No events or focus blocks scheduled for{" "}
            {formatDayHeader(selectedDate).toLowerCase()}.
          </p>
        ) : (
          <DayTimeline items={timelineItems} />
        )}

        <Button
          className="mt-8 w-full"
          variant="secondary"
          onClick={() => navigate("/calendar")}
        >
          View calendar
        </Button>
      </SpecCard>
    </div>
  );
}
