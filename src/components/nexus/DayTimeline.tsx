import { useEffect, useState } from "react";
import { Play, Pause, Check, CircleDashed, X } from "lucide-react";
import { timeline as mockTimeline, type TimelineItem } from "@/data/mock-data";
import { useNexusData } from "@/providers/NexusDataProvider";

const dotColors = ["bg-sage", "bg-sky", "bg-amber", "bg-coral"];

interface DayTimelineProps {
  /** Real items built from focusWindows + calendarEvents. Falls back to mock if omitted. */
  items?: TimelineItem[];
}

const STATE_LABEL: Record<string, string> = {
  not_started: "",
  in_progress: "In progress",
  paused: "Paused",
  completed: "Completed",
  partially_completed: "Partially completed",
  skipped: "Skipped",
  cancelled: "Cancelled",
};

const STATE_DOT: Record<string, string> = {
  not_started: "bg-stone/30",
  in_progress: "bg-sky animate-pulse",
  paused: "bg-amber",
  completed: "bg-sage",
  partially_completed: "bg-amber",
  skipped: "bg-coral/60",
  cancelled: "bg-stone/30",
};

const STATE_BORDER: Record<string, string> = {
  in_progress: "border-sky",
  paused: "border-amber",
  completed: "border-sage",
  partially_completed: "border-amber",
  skipped: "border-coral/40",
};

const TERMINAL = new Set(["completed", "partially_completed", "skipped", "cancelled"]);

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function ExecutionControls({ missionId, state }: { missionId: string; state: string }) {
  const { startTask, pauseTask, completeTask, partialTask, skipTask, executionStates } = useNexusData();
  const record = executionStates[missionId];

  // Ticking elapsed-time display while a task is actually running — the
  // whole point of "feels alive": you should see time passing, not a static
  // label that only updates on the next replan.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (state !== "in_progress" || !record?.actualStart) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state, record?.actualStart]);

  if (TERMINAL.has(state)) {
    const durationLabel =
      record?.actualDuration !== undefined
        ? ` · actual ${formatMinutes(record.actualDuration)} (est. ${formatMinutes(record.estimatedDuration)})`
        : "";
    return (
      <span
        className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium
          ${state === "completed" ? "bg-sage/15 text-sage" :
            state === "partially_completed" ? "bg-amber/15 text-amber" :
            "bg-soft text-stone"}`}
      >
        {state === "completed" && <Check className="h-3 w-3" />}
        {STATE_LABEL[state]}{durationLabel}
      </span>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {state === "in_progress" && record?.actualStart && (
        <span className="mr-1 inline-flex items-center gap-1.5 rounded-full bg-sky/15 px-2 py-0.5 text-xs font-medium text-sky tabular-nums">
          <span className="h-1.5 w-1.5 rounded-full bg-sky animate-pulse" />
          {formatElapsed(now - new Date(record.actualStart).getTime())}
        </span>
      )}
      {state === "paused" && (
        <span className="mr-1 rounded-full bg-amber/15 px-2 py-0.5 text-xs font-medium text-amber">Paused</span>
      )}

      {(state === "not_started" || state === "paused") && (
        <button
          onClick={() => startTask(missionId)}
          className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-ink transition hover:bg-soft"
        >
          <Play className="h-3 w-3" /> {state === "paused" ? "Resume" : "Start"}
        </button>
      )}
      {state === "in_progress" && (
        <button
          onClick={() => pauseTask(missionId)}
          className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-ink transition hover:bg-soft"
        >
          <Pause className="h-3 w-3" /> Pause
        </button>
      )}
      <button
        onClick={() => completeTask(missionId)}
        className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-sage transition hover:bg-soft"
      >
        <Check className="h-3 w-3" /> Complete
      </button>
      <button
        onClick={() => partialTask(missionId)}
        className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-amber transition hover:bg-soft"
      >
        <CircleDashed className="h-3 w-3" /> Partial
      </button>
      <button
        onClick={() => skipTask(missionId)}
        className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-coral transition hover:bg-soft"
      >
        <X className="h-3 w-3" /> Skip
      </button>
    </div>
  );
}

export function DayTimeline({ items }: DayTimelineProps) {
  const displayItems = items && items.length > 0 ? items : mockTimeline;

  return (
    <div className="space-y-1">
      {displayItems.map((item, index) => {
        const state = item.executionState ?? "not_started";
        const isFocus = item.type === "focus" && Boolean(item.missionId);
        const borderClass = isFocus ? (STATE_BORDER[state] ?? "border-line") : "border-line";
        return (
          <div key={item.id} className="grid grid-cols-[74px_1fr] gap-5 py-4">
            <p className="pt-1 text-xs text-stone">{item.time}</p>
            <div className={`relative border-l pl-6 transition-colors ${borderClass}`}>
              <span
                className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full transition-colors ${
                  isFocus ? (STATE_DOT[state] ?? dotColors[index % dotColors.length]) : dotColors[index % dotColors.length]
                }`}
              />
              <p className="text-sm font-semibold text-ink">{item.title}</p>
              <p className="mt-1 text-sm leading-6 text-stone">{item.description}</p>
              {isFocus && item.missionId && (
                <ExecutionControls missionId={item.missionId} state={state} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
