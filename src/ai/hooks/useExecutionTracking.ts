// ============================================================================
// Nexus OS — Execution Tracking (Behavioural Learning Engine, part 1)
//
// Every planner-generated task has a lifecycle. This hook is the ONLY place
// that writes ExecutionRecord transitions and the ONLY place that knows the
// current execution state of a task. Pages call its actions (startTask,
// completeTask, ...); nothing else computes or stores execution state.
//
// Append-only by design: every transition writes a NEW Firestore document
// (appendExecutionRecord), never an update to a previous one. "Current
// state" is a client-side reduction (latest record per taskId), not a
// separate mutable source of truth.
// ============================================================================

import { useState, useEffect, useCallback, useRef } from "react";
import {
  appendExecutionRecord,
  loadExecutionHistory,
  updateMemoryField,
} from "@/services/firestore.service";
import { PIPELINE_VERSION } from "@/ai/hooks/useNexus";
import { deriveMemoryFromExecutionHistory } from "@/ai/learning/behavioral-learning";
import type {
  ExecutionRecord,
  ExecutionState,
  CompletionSource,
  OrchestratorOutput,
  BehavioralMemory,
} from "@/types/domain";
import { COMPLETION_CONFIDENCE } from "@/types/domain";
import { nowISO } from "@/lib/utils";

interface TaskMeta {
  title: string;
  workType: string;
  plannedStart: string;
  plannedEnd: string;
  estimatedDuration: number;
  calendarEventId?: string;
}

function findTaskMeta(output: OrchestratorOutput | null, taskId: string): TaskMeta | null {
  if (!output) return null;
  const task = output.taskGraph.find(t => t.missionId === taskId);
  const entry = output.timeline.find(e => e.missionId === taskId && e.kind === "focus");
  if (!task || !entry) return null;
  return {
    title: task.goal,
    workType: task.workType,
    plannedStart: entry.start,
    plannedEnd: entry.end,
    estimatedDuration: task.estimatedMinutes,
    calendarEventId: task.calendarAnchor?.eventId,
  };
}

export function useExecutionTracking(userId: string, output: OrchestratorOutput | null, memory: BehavioralMemory | null) {
  // taskId -> latest ExecutionRecord (derived client-side from the
  // append-only history, never the source of truth itself)
  const [states, setStates] = useState<Record<string, ExecutionRecord>>({});
  // Full history (not deduped) — needed for behavioral-learning aggregation,
  // which must see every past completion/skip, not just the latest per task.
  const allRecordsRef = useRef<ExecutionRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || loadedFor.current === userId) return;
    loadedFor.current = userId;
    loadExecutionHistory(userId, 500)
      .then(records => {
        allRecordsRef.current = records;
        const latest: Record<string, ExecutionRecord> = {};
        // records arrive newest-first; first occurrence per taskId wins
        for (const r of records) {
          if (!latest[r.taskId]) latest[r.taskId] = r;
        }
        setStates(latest);
        setLoaded(true);
      })
      .catch(err => {
        console.error("[useExecutionTracking] Failed to load execution history:", err);
        setLoaded(true);
      });
  }, [userId]);

  const write = useCallback(
    async (
      taskId: string,
      status: ExecutionState,
      opts: {
        actualStart?: string;
        actualEnd?: string;
        completionSource: CompletionSource;
        reflection?: string;
      },
    ) => {
      const meta = findTaskMeta(output, taskId);
      if (!meta) {
        console.warn(`[useExecutionTracking] No task metadata found for "${taskId}" — skipping write.`);
        return;
      }

      const prior = allRecordsRef.current.find(r => r.taskId === taskId);
      const actualStart = opts.actualStart ?? prior?.actualStart;
      const actualEnd = opts.actualEnd;
      const actualDuration =
        actualStart && actualEnd
          ? Math.round((new Date(actualEnd).getTime() - new Date(actualStart).getTime()) / 60_000)
          : prior?.actualDuration;

      const record: Omit<ExecutionRecord, "id"> = {
        taskId,
        title: meta.title,
        workType: meta.workType,
        plannedStart: meta.plannedStart,
        plannedEnd: meta.plannedEnd,
        actualStart,
        actualEnd,
        estimatedDuration: meta.estimatedDuration,
        actualDuration,
        status,
        completionConfidence: COMPLETION_CONFIDENCE[opts.completionSource],
        completionSource: opts.completionSource,
        plannerVersion: PIPELINE_VERSION,
        calendarEventId: meta.calendarEventId,
        behaviourSnapshot: memory
          ? { peakProductivityHour: memory.peakProductivityHour, estimationBias: memory.estimationBias }
          : undefined,
        reflection: opts.reflection,
        timestamp: nowISO(),
      };

      // Optimistic: update local state INSTANTLY, before the Firestore round
      // trip resolves. The action must feel alive — the user clicking
      // "Complete" should see the card flip to completed immediately, not
      // after a network round trip. The temporary id is replaced once the
      // write actually lands; if it fails, the record stays (better to show
      // an optimistic state than silently revert and confuse the user).
      const optimistic: ExecutionRecord = { ...record, id: `pending-${Date.now()}` };
      setStates(s => ({ ...s, [taskId]: optimistic }));
      allRecordsRef.current = [optimistic, ...allRecordsRef.current];

      const id = await appendExecutionRecord(userId, record);
      const saved: ExecutionRecord = { ...record, id };
      setStates(s => ({ ...s, [taskId]: saved }));
      allRecordsRef.current = [saved, ...allRecordsRef.current.filter(r => r !== optimistic)];

      // Re-derive Behavioural Memory from the FULL execution history every
      // time a task reaches a terminal/observable state — this is the
      // "Update Behavioural Memory" step of the learning loop, firing on
      // every real outcome rather than waiting for a nightly batch job.
      if (status === "completed" || status === "partially_completed" || status === "skipped") {
        const derived = deriveMemoryFromExecutionHistory(allRecordsRef.current);
        try {
          await updateMemoryField(userId, derived);
        } catch (err) {
          console.error("[useExecutionTracking] Failed to persist derived memory:", err);
        }
      }
    },
    [userId, output, memory],
  );

  const startTask = useCallback(
    (taskId: string) => write(taskId, "in_progress", { actualStart: nowISO(), completionSource: "manual" }),
    [write],
  );

  const pauseTask = useCallback(
    (taskId: string) => write(taskId, "paused", { completionSource: "manual" }),
    [write],
  );

  const completeTask = useCallback(
    (taskId: string) => write(taskId, "completed", { actualEnd: nowISO(), completionSource: "manual" }),
    [write],
  );

  const partialTask = useCallback(
    (taskId: string, reflection?: string) =>
      write(taskId, "partially_completed", { actualEnd: nowISO(), completionSource: "manual", reflection }),
    [write],
  );

  const skipTask = useCallback(
    (taskId: string, reflection?: string) =>
      write(taskId, "skipped", { completionSource: "manual", reflection }),
    [write],
  );

  const cancelTask = useCallback(
    (taskId: string) => write(taskId, "cancelled", { completionSource: "manual" }),
    [write],
  );

  /** Answer to the "did you complete this?" prompt for an expired task —
   *  lower confidence than an explicit Complete/Skip click since it's a
   *  retrospective answer, not a live action. */
  const answerExpiredPrompt = useCallback(
    (taskId: string, answer: "completed" | "partially_completed" | "skipped") =>
      write(taskId, answer, {
        actualEnd: answer !== "skipped" ? nowISO() : undefined,
        completionSource: "expired_prompt",
      }),
    [write],
  );

  const stateOf = useCallback(
    (taskId: string): ExecutionState => states[taskId]?.status ?? "not_started",
    [states],
  );

  return {
    loaded,
    states,
    stateOf,
    startTask,
    pauseTask,
    completeTask,
    partialTask,
    skipTask,
    cancelTask,
    answerExpiredPrompt,
  };
}
