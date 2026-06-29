// ============================================================================
// Nexus OS — Schedule diff
//
// "Every plan must explain WHY it changed." This compares the focusWindows
// of the previous in-session plan against the new one, missionId by
// missionId, and produces concrete sentences — moved later/earlier,
// shortened/lengthened, or a new recovery block inserted. Nothing here is
// invented; every sentence traces back to an actual before/after diff.
// ============================================================================

import type { FocusWindow } from "@/types/domain";

function minutesBetween(aISO: string, bISO: string): number {
  return Math.round((new Date(bISO).getTime() - new Date(aISO).getTime()) / 60_000);
}

function durationMins(w: FocusWindow): number {
  return Math.round((new Date(w.window.end).getTime() - new Date(w.window.start).getTime()) / 60_000);
}

export function computeScheduleDiff(
  prev: FocusWindow[] | null | undefined,
  next: FocusWindow[],
): string[] {
  if (!prev || prev.length === 0) return [];

  const prevByMission = new Map(prev.filter(w => w.missionId).map(w => [w.missionId!, w]));
  const nextByMission = new Map(next.filter(w => w.missionId).map(w => [w.missionId!, w]));

  const explanations: string[] = [];

  for (const [missionId, nextWindow] of nextByMission) {
    const prevWindow = prevByMission.get(missionId);

    if (!prevWindow) {
      // New block that didn't exist before — most useful case is recovery,
      // since deadline buffers churn naturally as placements shift.
      if (nextWindow.blockType === "recovery") {
        explanations.push(`Momentum inserted a recovery block: "${nextWindow.title}".`);
      }
      continue;
    }

    const startShift = minutesBetween(prevWindow.window.start, nextWindow.window.start);
    if (Math.abs(startShift) >= 10) {
      const direction = startShift > 0 ? "later" : "earlier";
      explanations.push(
        `"${nextWindow.title}" moved ${Math.abs(startShift)} minutes ${direction} — ${nextWindow.reason}`,
      );
      continue; // a moved block already explains itself; don't also report duration noise
    }

    const durShift = durationMins(nextWindow) - durationMins(prevWindow);
    if (Math.abs(durShift) >= 10) {
      const verb = durShift > 0 ? "lengthened" : "shortened";
      explanations.push(`"${nextWindow.title}" was ${verb} by ${Math.abs(durShift)} minutes — ${nextWindow.reason}`);
    }
  }

  // Disappeared blocks (completed work is never replanned, so a missing
  // missionId here means it was completed/cancelled, not silently dropped —
  // only worth surfacing for recovery blocks that simply became unnecessary).
  for (const [missionId, prevWindow] of prevByMission) {
    if (!nextByMission.has(missionId) && prevWindow.blockType === "recovery") {
      explanations.push(`The recovery block after "${(prevWindow.title ?? "a meeting").replace(/^☕\s*/, "")}" is no longer needed.`);
    }
  }

  return explanations.slice(0, 4);
}
