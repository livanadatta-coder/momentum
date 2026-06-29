// ============================================================================
// Nexus OS — Pipeline Debug Panel
//
// Hidden developer mode: ?debug=true in the URL, or localStorage.debug="true".
// Makes every planning decision traceable by printing the ACTUAL runtime
// objects at each pipeline stage — not types, not descriptions. Renders
// nothing in normal use; this is purely an inspection tool, never a second
// source of planning logic (it only reads OrchestratorOutput, never derives).
// ============================================================================

import { useState } from "react";
import { useNexusData } from "@/providers/NexusDataProvider";

function isDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const param = new URLSearchParams(window.location.search).get("debug");
  if (param === "true") return true;
  try {
    return window.localStorage.getItem("debug") === "true";
  } catch {
    return false;
  }
}

function Section({ title, value }: { title: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  const count = Array.isArray(value) ? value.length : undefined;
  return (
    <div className="border-b border-white/10 py-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between text-left text-xs font-semibold text-amber-300"
      >
        <span>{title}{count !== undefined ? ` (${count})` : ""}</span>
        <span className="text-white/40">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <pre className="mt-2 max-h-72 overflow-auto rounded bg-black/40 p-2 text-[10px] leading-4 text-lime-200">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function PipelineDebugPanel() {
  const [visible, setVisible] = useState(true);
  if (!isDebugEnabled()) return null;

  const { output, calendarEvents, calendarSource, status } = useNexusData();

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="fixed bottom-4 right-4 z-[9999] rounded-full bg-black/80 px-3 py-2 text-xs text-white shadow-lg"
      >
        🐞 Debug
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-[420px] max-h-[80vh] overflow-y-auto rounded-xl bg-black/90 p-4 font-mono text-white shadow-2xl ring-1 ring-white/20">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-300">
          Pipeline Debug — status: {status} — calendar: {calendarSource}
        </p>
        <button onClick={() => setVisible(false)} className="text-white/50 hover:text-white">✕</button>
      </div>

      <Section title="1. Calendar Events (raw, from useNexusData)" value={calendarEvents} />
      <Section title="2. Task Graph (output.taskGraph)" value={output?.taskGraph ?? null} />
      <Section title="3. Risk Signals (output.riskSignals)" value={output?.riskSignals ?? null} />
      <Section title="4. Focus Windows (output.focusWindows)" value={output?.focusWindows ?? null} />
      <Section title="5. Recovery Plan (output.recoveryPlan)" value={output?.recoveryPlan ?? null} />
      <Section title="6. Timeline (output.timeline) — what every page renders" value={output?.timeline ?? null} />
      <Section title="7. Summary (output.summary) — every page-level 'pick'" value={output?.summary ?? null} />
      <Section title="8. Daily Brief (output.brief)" value={output?.brief ?? null} />
      <Section title="Full OrchestratorOutput" value={output} />
    </div>
  );
}
