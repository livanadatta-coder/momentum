// ============================================================================
// Nexus OS — Expired Task Prompt (Behavioural Learning Engine)
//
// A task that reached its planned end time while still not_started/
// in_progress is NOT assumed to have failed. Instead we ask. The answer is
// written via answerExpiredPrompt (completionSource: "expired_prompt",
// confidence 90%) — lower confidence than an explicit Complete/Skip click,
// since it's a retrospective answer rather than a live action.
// ============================================================================

import { useMemo, useState } from "react";
import { Check, CircleDashed, X } from "lucide-react";
import { useNexusData } from "@/providers/NexusDataProvider";

export function ExpiredTaskPrompt() {
  const { output, answerExpiredPrompt } = useNexusData();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const expired = useMemo(() => {
    if (!output) return null;
    const now = Date.now();
    return output.timeline.find(entry =>
      entry.kind === "focus" &&
      entry.missionId &&
      !dismissed.has(entry.missionId) &&
      new Date(entry.end).getTime() <= now &&
      (entry.executionState === "not_started" || entry.executionState === "in_progress"),
    ) ?? null;
  }, [output, dismissed]);

  if (!expired || !expired.missionId) return null;
  const missionId = expired.missionId;

  async function answer(choice: "completed" | "partially_completed" | "skipped") {
    setBusy(true);
    try {
      await answerExpiredPrompt(missionId, choice);
    } finally {
      setDismissed(d => new Set(d).add(missionId));
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-6 left-1/2 z-[9998] w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-line bg-white p-5 shadow-2xl">
      <p className="text-sm font-semibold text-ink">Did you complete this?</p>
      <p className="mt-1 text-sm leading-6 text-stone">
        "{expired.title}" was scheduled to finish at{" "}
        {new Date(expired.end).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.
      </p>
      <div className="mt-4 flex gap-2">
        <button
          disabled={busy}
          onClick={() => answer("completed")}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line py-2 text-sm font-medium text-sage transition hover:bg-soft disabled:opacity-50"
        >
          <Check className="h-4 w-4" /> Completed
        </button>
        <button
          disabled={busy}
          onClick={() => answer("partially_completed")}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line py-2 text-sm font-medium text-amber transition hover:bg-soft disabled:opacity-50"
        >
          <CircleDashed className="h-4 w-4" /> Partially
        </button>
        <button
          disabled={busy}
          onClick={() => answer("skipped")}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line py-2 text-sm font-medium text-coral transition hover:bg-soft disabled:opacity-50"
        >
          <X className="h-4 w-4" /> Didn't
        </button>
      </div>
    </div>
  );
}
