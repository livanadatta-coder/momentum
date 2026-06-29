import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button }       from "@/components/ui/Button";
import { PageIntro }    from "@/components/nexus/PageIntro";
import { SpecCard }     from "@/components/nexus/SpecCard";
import { useNexusData } from "@/providers/NexusDataProvider";
import { calendarBlocks } from "@/data/mock-data";
import { cn } from "@/lib/utils";
import type { TimelineEntry } from "@/types/domain";

// ── Local-time date helpers (mirrors DayPage — never use UTC splits) ──────────

function toDateKey(d: Date): string {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoToLocalDateKey(iso: string): string {
  return toDateKey(new Date(iso));
}

function addDays(dateKey: string, n: number): string {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + n);
  return toDateKey(d);
}

function todayKey(): string {
  return toDateKey(new Date());
}

function formatDayLabel(dateKey: string): string {
  const today    = todayKey();
  const tomorrow = addDays(today, 1);
  if (dateKey === today)    return "Today";
  if (dateKey === tomorrow) return "Tomorrow";
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

// ── Event helpers ─────────────────────────────────────────────────────────────

const tones: Record<string, string> = {
  sage:  "bg-[#E4F2E3]",
  sky:   "bg-[#E8F1FB]",
  lilac: "bg-[#F0E8FA]",
  cream: "bg-[#FBF2E2]",
};

function entryTone(entry: TimelineEntry): string {
  if (entry.kind === "buffer")   return "lilac";
  if (entry.kind === "focus")    return "cream";
  return "sky"; // kind === "calendar"
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatUpcomingDate(iso: string): string {
  const d        = new Date(iso);
  const today    = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === today.toDateString())    return `Today, ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${time}`;
  return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}, ${time}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function CalendarPage() {
  const navigate = useNavigate();
  const { calendarEvents, output } = useNexusData();

  const [selectedDate, setSelectedDate] = useState(todayKey);

  // ── Navigation bounds ──────────────────────────────────────────────────────
  const { minKey, maxKey } = useMemo(() => {
    const today = todayKey();
    const dates: string[] = [today, addDays(today, 7)];
    output?.timeline?.forEach(entry => dates.push(isoToLocalDateKey(entry.start)));
    dates.sort();
    return { minKey: today, maxKey: dates[dates.length - 1] ?? today };
  }, [output]);

  const canGoPrev = selectedDate > minKey;
  const canGoNext = selectedDate < maxKey;

  // ── Events for the selected day ───────────────────────────────────────────
  // Calendar must show the SAME execution strategy as every other page — the
  // orchestrator's merged timeline (real events + focus/buffer blocks),
  // never a calendar-only or independently re-merged view.
  const selectedDayEntries = useMemo(() => {
    return (output?.timeline ?? []).filter(
      entry => isoToLocalDateKey(entry.start) === selectedDate,
    );
  }, [output, selectedDate]);

  // Mock-only fallback for the brief window before the planner has ever run
  // (no output yet at all) — never used once a real timeline exists.
  const mockFallback = useMemo(() => {
    if (output || selectedDate !== todayKey()) return [];
    const today = todayKey();
    const mockToday = calendarBlocks.filter(b => b.date === today);
    return mockToday.length > 0 ? mockToday.slice(0, 4) : calendarBlocks.slice(0, 4);
  }, [output, selectedDate]);

  // ── Upcoming (next events after now, across the full horizon) ─────────────
  const upcoming = useMemo(() => {
    // Compare actual instants — calendar events may carry a timezone offset
    // ("...+05:30") while a plain string/Date comparison of differing ISO
    // formats does not correspond to chronological order.
    const now = Date.now();
    return calendarEvents
      .filter(ev => new Date(ev.start).getTime() > now)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .slice(0, 5);
  }, [calendarEvents]);

  return (
    <div className="grid gap-12 lg:grid-cols-[0.72fr_1fr]">
      <PageIntro
        eyebrow="Calendar"
        title="A preview that respects attention."
        description="Calendar is shown as context, not clutter. The important thing is how the day will feel."
        className="lg:sticky lg:top-10 lg:self-start"
      />
      <SpecCard className="p-7 sm:p-9">
        {/* Header with working navigation */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="font-serif text-4xl tracking-[-0.035em]">
              {formatDayLabel(selectedDate)}
            </h2>
            <p className="mt-2 text-sm text-stone">
              {new Date(`${selectedDate}T12:00:00`).toLocaleDateString("en-US", {
                weekday: "long", month: "long", day: "numeric",
              })}
            </p>
          </div>
          <div className="flex items-center gap-1 text-stone">
            <button
              onClick={() => canGoPrev && setSelectedDate(addDays(selectedDate, -1))}
              disabled={!canGoPrev}
              aria-label="Previous day"
              className="rounded-md p-1.5 transition hover:bg-soft disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            {selectedDate !== todayKey() && (
              <button
                onClick={() => setSelectedDate(todayKey())}
                className="rounded-md px-2 py-1 text-xs transition hover:bg-soft"
              >
                Today
              </button>
            )}
            <button
              onClick={() => canGoNext && setSelectedDate(addDays(selectedDate, 1))}
              disabled={!canGoNext}
              aria-label="Next day"
              className="rounded-md p-1.5 transition hover:bg-soft disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Events for selected day */}
        {selectedDayEntries.length === 0 && mockFallback.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone">
            No events on {formatDayLabel(selectedDate).toLowerCase()}.
          </p>
        ) : (
          <div className="space-y-5">
            {selectedDayEntries.length > 0
              ? selectedDayEntries.map(entry => (
                  <div key={entry.id} className="grid grid-cols-[76px_1fr] gap-5">
                    <p className="pt-4 text-xs text-stone">{formatTime(entry.start)}</p>
                    <div className={cn("rounded-[16px] p-4", tones[entryTone(entry)] ?? "bg-[#FBF2E2]")}>
                      <p className="text-sm font-semibold text-ink">{entry.title}</p>
                      <p className="mt-1 text-xs text-stone">{entry.description}</p>
                    </div>
                  </div>
                ))
              : mockFallback.map(block => (
                  <div key={block.id} className="grid grid-cols-[76px_1fr] gap-5">
                    <p className="pt-4 text-xs text-stone">{block.time}</p>
                    <div className={cn("rounded-[16px] p-4", tones[block.tone] ?? "bg-[#FBF2E2]")}>
                      <p className="text-sm font-semibold text-ink">{block.title}</p>
                      <p className="mt-1 text-xs text-stone">{block.detail}</p>
                    </div>
                  </div>
                ))
            }
          </div>
        )}

        {/* Upcoming across the full planning horizon */}
        <div className="mt-9 border-t border-line pt-7">
          <p className="mb-4 text-sm font-semibold text-ink">Upcoming</p>
          <div className="space-y-4 text-sm">
            {upcoming.length > 0
              ? upcoming.map(ev => (
                  <div key={ev.id} className="flex justify-between gap-4">
                    <span>{ev.title}</span>
                    <span className="text-stone shrink-0">{formatUpcomingDate(ev.start)}</span>
                  </div>
                ))
              : (
                  <>
                    <div className="flex justify-between gap-4">
                      <span>Design sync</span>
                      <span className="text-stone">Thu, 11:00 AM</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Demo narrative</span>
                      <span className="text-stone">Fri, all day</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Submission day</span>
                      <span className="text-stone">Mon, before 2 PM</span>
                    </div>
                  </>
                )
            }
          </div>
          <Button
            className="mt-8 w-full"
            variant="secondary"
            onClick={() => navigate("/day")}
          >
            Open day view
          </Button>
        </div>
      </SpecCard>
    </div>
  );
}
