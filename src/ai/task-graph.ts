// ============================================================================
// Nexus OS — Task Graph
//
// Replaces fixed keyword-chain ordering with relationship reasoning: every
// task declares what artifact it produces and what it requires (from
// work-types.ts). Dependencies are resolved by matching requires→produces
// across TODAY's actual workload — not by position in a list. This means:
//   • Fan-in works (documentation can depend on BOTH implementation and demo).
//   • Missing steps degrade gracefully (no testing task? demo/deploy fall
//     back to raw implementation instead of breaking).
//   • Two different workloads naturally produce two different graphs.
//
// This module is the deterministic half of the Task[] contract. The Gemini
// agents populate the exact same shape by reasoning over the same
// WORK_TYPE_PROFILES table — see focus.engine.ts / planner.agent.ts.
// Everything downstream (risk propagation, scheduling, explanations)
// consumes ONLY Task[] and never knows which path produced it.
// ============================================================================

import type { Mission, Task, RiskSignal } from "@/types/domain";
import {
  WORK_TYPE_PROFILES,
  DOCUMENTATION_OPTIONAL_INPUT,
  classifyWorkType,
  type WorkType,
} from "@/ai/work-types";

function goalPhrase(workType: WorkType, title: string): string {
  switch (workType) {
    case "execution":     return `Finish the implementation for "${title}"`;
    case "testing":       return `Verify the implementation before "${title}"`;
    case "demo":          return `Prepare and record "${title}"`;
    case "documentation": return `Document the work behind "${title}"`;
    case "deployment":    return `Verify and ship "${title}"`;
    case "meeting":       return `Attend "${title}"`;
    default:              return title;
  }
}

/** A task is "anchored" if it's tied to a real calendar event/time. */
function anchorTime(mission: Mission): number {
  if (mission.calendarScheduled && mission.calendarEventStart) {
    return new Date(mission.calendarEventStart).getTime();
  }
  return new Date(mission.deadline).getTime();
}

export interface BuildTaskGraphResult {
  tasks: Task[];
  /** Human-readable log lines describing how each dependency was resolved
   *  (or why a requirement degraded) — surfaced to console for the
   *  "show me the dependency graph" demo moment. */
  log: string[];
}

export function buildTaskGraph(missions: Mission[]): BuildTaskGraphResult {
  const log: string[] = [];
  const active = missions.filter(m => m.status !== "completed");

  // ── Step 1: classify + seed produces/requires ────────────────────────────
  const seeds = active.map(mission => {
    const workType = classifyWorkType(mission.calendarEventTitle ?? mission.title, mission.category);
    const profile = WORK_TYPE_PROFILES[workType];
    return { mission, workType, profile, anchorAt: anchorTime(mission) };
  });

  // ── Step 2: resolve dependencies by artifact matching ────────────────────
  const tasks: Task[] = seeds.map(seed => {
    const { mission, workType, profile, anchorAt } = seed;
    const dependencies = new Set<string>();
    let degradedInput: Task["degradedInput"] | undefined;

    const findProducer = (artifact: string): typeof seeds[number] | null => {
      const candidates = seeds.filter(
        other => other.mission.id !== mission.id &&
          other.profile.produces.includes(artifact) &&
          other.anchorAt <= anchorAt,
      );
      if (!candidates.length) return null;
      // Nearest predecessor — the one finishing closest before this task.
      return candidates.reduce((a, b) => (b.anchorAt > a.anchorAt ? b : a));
    };

    for (const required of profile.requires) {
      const producer = findProducer(required);
      if (producer) {
        dependencies.add(producer.mission.id);
        log.push(
          `[TaskGraph] "${mission.title}" requires ${required} → satisfied by "${producer.mission.title}"`,
        );
        continue;
      }
      // Try fallback artifact before declaring this requirement unmet.
      const fallback = profile.fallbackRequires?.find(f => findProducer(f));
      if (fallback) {
        const fallbackProducer = findProducer(fallback)!;
        dependencies.add(fallbackProducer.mission.id);
        degradedInput = { wanted: required, gotInstead: fallback };
        log.push(
          `[TaskGraph] "${mission.title}" requires ${required} but no producer found — ` +
          `falling back to ${fallback} from "${fallbackProducer.mission.title}" (degraded)`,
        );
      } else {
        degradedInput = { wanted: required, gotInstead: null };
        log.push(
          `[TaskGraph] "${mission.title}" requires ${required} — no producer found in today's ` +
          `workload at all. Proceeding without it (risk will be increased).`,
        );
      }
    }

    // Optional fan-in: documentation picks up a demo asset if one exists,
    // without failing the graph when it doesn't.
    if (workType === "documentation") {
      const demoProducer = findProducer(DOCUMENTATION_OPTIONAL_INPUT);
      if (demoProducer) {
        dependencies.add(demoProducer.mission.id);
        log.push(
          `[TaskGraph] "${mission.title}" also depends on "${demoProducer.mission.title}" ` +
          `(optional demo_asset fan-in)`,
        );
      }
    }

    // Explicit user-declared dependencies always win, merged in.
    for (const explicitId of mission.dependencies) {
      if (active.some(m => m.id === explicitId)) dependencies.add(explicitId);
    }

    const task: Task = {
      missionId:      mission.id,
      workType,
      goal:            goalPhrase(workType, mission.calendarEventTitle ?? mission.title),
      requiredInputs:  profile.requires,
      produces:        profile.produces,
      calendarAnchor:  mission.calendarScheduled && mission.calendarEventId && mission.calendarEventStart
        ? { eventId: mission.calendarEventId, start: mission.calendarEventStart, title: mission.calendarEventTitle ?? mission.title }
        : undefined,
      estimatedMinutes: mission.estimatedMinutes,
      dependencies:    Array.from(dependencies),
      dependents:      [], // filled below
      deadline:        mission.deadline,
      risk:            0,  // filled by propagateTaskRisk()
      degradedInput,
    };
    return task;
  });

  // ── Step 3: fill inverse edges ───────────────────────────────────────────
  const byId = new Map(tasks.map(t => [t.missionId, t]));
  for (const task of tasks) {
    for (const depId of task.dependencies) {
      byId.get(depId)?.dependents.push(task.missionId);
    }
  }

  // ── Step 4: topological sort (Kahn's algorithm) ──────────────────────────
  // Guaranteed acyclic: edges only ever point from an earlier-anchored
  // producer to a later-anchored requirer.
  const inDegree = new Map(tasks.map(t => [t.missionId, t.dependencies.length]));
  const queue = tasks.filter(t => inDegree.get(t.missionId) === 0).map(t => t.missionId);
  const sorted: Task[] = [];
  const visited = new Set<string>();

  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const task = byId.get(id);
    if (!task) continue;
    sorted.push(task);
    for (const depId of task.dependents) {
      const remaining = (inDegree.get(depId) ?? 1) - 1;
      inDegree.set(depId, remaining);
      if (remaining <= 0) queue.push(depId);
    }
  }
  // Defensive: any task not reached (shouldn't happen given the DAG guarantee)
  // is appended at the end so nothing silently disappears from the plan.
  for (const task of tasks) {
    if (!visited.has(task.missionId)) sorted.push(task);
  }

  log.push(
    `[TaskGraph] Built ${sorted.length} tasks, topological order: ` +
    sorted.map(t => `"${t.goal}"`).join(" → "),
  );

  return { tasks: sorted, log };
}

// ============================================================================
// Risk propagation
// ============================================================================

/**
 * Recomputes each task's risk so that risk FLOWS through dependencies instead
 * of being calculated per-mission in isolation. A thin-buffer coding task
 * visibly inflates the risk of the demo/docs/deploy tasks chained after it.
 *
 * `ownRiskByMissionId` should come from localRiskAssessment()'s signals
 * (or the Gemini RiskEngine's signals) — this function only adds the
 * propagation layer on top.
 */
export function propagateTaskRisk(
  tasks: Task[],
  riskSignals: RiskSignal[],
): Task[] {
  const ownRisk = new Map(riskSignals.map(s => [s.missionId, s.score]));
  const byId = new Map(tasks.map(t => [t.missionId, t]));
  const resolvedRisk = new Map<string, number>();

  // tasks[] is already topologically sorted, so dependencies are always
  // resolved before the tasks that need them.
  for (const task of tasks) {
    const base = ownRisk.get(task.missionId) ?? 0.15;
    const degradedPenalty = task.degradedInput ? 0.15 : 0;
    const inherited = task.dependencies.length
      ? Math.max(...task.dependencies.map(id => resolvedRisk.get(id) ?? 0))
      : 0;
    const risk = Math.min(1, base + degradedPenalty + 0.5 * inherited);
    resolvedRisk.set(task.missionId, risk);
    const t = byId.get(task.missionId);
    if (t) t.risk = Math.round(risk * 100) / 100;
  }

  for (const task of tasks) {
    if (task.dependencies.length) {
      const inheritedFrom = task.dependencies
        .map(id => byId.get(id))
        .filter((d): d is Task => Boolean(d))
        .sort((a, b) => b.risk - a.risk)[0];
      if (inheritedFrom && inheritedFrom.risk > 0.4) {
        console.log(
          `[TaskGraph] "${task.goal}" risk ${task.risk} — inherits from "${inheritedFrom.goal}" (risk ${inheritedFrom.risk})`,
        );
      }
    }
  }

  return tasks;
}
