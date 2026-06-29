// ============================================================================
// Nexus OS — Unified Workload Builder
//
// Merges Firestore missions with Google Calendar work events into a single
// prioritised Mission[] that every agent consumes.
//
// Why this exists:
//   Before this module, calendar events were used ONLY as time-slot blockers.
//   The planner had no way to know that "complete nexus coding at 1 PM" on
//   the calendar IS the same work as the "Finalize Nexus AI orchestration
//   layer" Firestore mission. This caused duplicate / disconnected output.
//
// Contract:
//   • Calendar events tagged source="nexus" or isBlocked=true are NEVER
//     treated as work items — they're Nexus-managed blockers.
//   • All remaining calendar events are considered potential work items.
//   • Title-similarity matching deduplicates calendar items vs missions.
//   • Matched missions get `calendarScheduled: true` + the event metadata
//     so agents can generate "prepares you for your 1 PM 'event'" copy.
//   • Unmatched calendar events become pseudo-missions so the planner
//     schedules prep time for them too.
//   • Pure meetings (no prep needed) are kept as blockers only — they're
//     identified by duration >= MEETING_THRESHOLD_MINS with no matching
//     mission and a title that looks like a meeting.
// ============================================================================

import type { Mission, CalendarEvent, Priority } from "@/types/domain";
import { nowISO } from "@/lib/utils";
import { classifyWorkType, WORK_TYPE_PROFILES } from "@/ai/work-types";

// ── Config ────────────────────────────────────────────────────────────────────

/** Events longer than this that don't match a mission are treated as meetings
 *  (blockers only, not converted to pseudo-missions). */
const MEETING_THRESHOLD_MINS = 45;

/** Title-match word-overlap threshold (0–1). */
const MATCH_THRESHOLD = 0.45;

// ── Title normalisation & matching ───────────────────────────────────────────

function normalise(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_WORDS = new Set([
  "a","an","the","and","or","but","to","for","of","in","on","at","with",
  "my","our","your","do","be","is","was","are","will","has","have","this",
  "that","it","i","we","you","not","no","by","up","as","if","so","from",
]);

function significantWords(title: string): string[] {
  return normalise(title)
    .split(" ")
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

/** Returns true when two titles are similar enough to represent the same work. */
export function titlesMatch(a: string, b: string): boolean {
  const na = normalise(a);
  const nb = normalise(b);

  // Exact normalised match
  if (na === nb) return true;

  // One is a substring of the other
  if (na.includes(nb) || nb.includes(na)) return true;

  // Significant-word overlap
  const wa = significantWords(a);
  const wb = significantWords(b);
  if (wa.length === 0 || wb.length === 0) return false;
  const [shorter, longer] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  const overlap = shorter.filter(w => longer.includes(w));
  return overlap.length / shorter.length >= MATCH_THRESHOLD;
}

// ── Calendar event helpers ────────────────────────────────────────────────────

function durationMins(ev: CalendarEvent): number {
  return Math.round(
    (new Date(ev.end).getTime() - new Date(ev.start).getTime()) / 60_000,
  );
}

function looksLikeMeeting(ev: CalendarEvent): boolean {
  // Heuristic: long events with meeting-style words that have no matching mission
  const meetingWords = /\b(meeting|standup|sync|call|interview|review|session|ceremony|retro|planning)\b/i;
  return durationMins(ev) >= MEETING_THRESHOLD_MINS && meetingWords.test(ev.title);
}

// ── Work-type classification ─────────────────────────────────────────────────
// Work-type classification itself (the keyword signal) and the produces/
// requires/blockLabel knowledge live in work-types.ts — that declarative
// table is what the Task Graph (task-graph.ts) uses for dependency
// resolution. This module only needs the resulting display label.

/** Converts a calendar event to a pseudo-Mission so the planner can schedule
 *  prep time for it. The event start becomes the deadline. */
function calendarEventToMission(ev: CalendarEvent): Mission {
  const mins = durationMins(ev);
  // Prep time ≈ half the event duration, capped 20–60 min
  const prepMins = Math.min(60, Math.max(20, Math.round(mins / 2)));

  const workType = classifyWorkType(ev.title, "work");
  const prepFocusTitle = WORK_TYPE_PROFILES[workType].blockLabel;

  return {
    id:                `cal-${ev.id}`,
    title:             ev.title,
    description:       `From your Google Calendar at ${new Date(ev.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.`,
    deadline:          ev.start,           // event start IS the deadline
    priority:          derivePriority(ev),
    status:            "not_started",
    estimatedMinutes:  prepMins,
    category:          "work",
    dependencies:      [],
    tags:              ["calendar"],
    createdAt:         nowISO(),
    updatedAt:         nowISO(),
    // workload metadata
    calendarEventId:    ev.id,
    calendarEventTitle: ev.title,
    calendarEventStart: ev.start,
    calendarScheduled:  true,
    // Legacy display fallback — the Task Graph (task-graph.ts) now drives
    // the real block title/reason; this just keeps old call sites working.
    prepFocusTitle,
  };
}

/** Derive priority from time-to-event: within 3 h = critical, 12 h = high, etc. */
function derivePriority(ev: CalendarEvent): Priority {
  const hoursUntil = (new Date(ev.start).getTime() - Date.now()) / 3_600_000;
  if (hoursUntil <= 3)  return "critical";
  if (hoursUntil <= 12) return "high";
  if (hoursUntil <= 48) return "medium";
  return "low";
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface UnifiedWorkloadResult {
  /** Merged, deduplicated mission list — pass this to every agent. */
  missions: Mission[];
  /**
   * Map from CalendarEvent.id → Mission.id for events that were matched to
   * an existing Firestore mission.  Used by agents to generate explanations
   * like "prepares you for your 1 PM 'complete nexus coding'".
   */
  calendarToMissionMap: Map<string, string>;
}

export function buildUnifiedWorkload(
  firestoreMissions: Mission[],
  calendarEvents: CalendarEvent[],
  now: Date,
): UnifiedWorkloadResult {
  console.log(
    `[Workload] Calendar events received: ${calendarEvents.length} ` +
    `(${calendarEvents.filter(e => e.source === "google").length} from Google Calendar)`,
  );
  calendarEvents.forEach(ev =>
    console.log(`[Workload]   "${ev.title}" — ${ev.start} → ${ev.end} [${ev.source}]`),
  );

  // Work events only: exclude nexus-protected blocks, past events, and blocked slots
  const workEvents = calendarEvents.filter(ev =>
    ev.source !== "nexus" &&
    !ev.isBlocked &&
    new Date(ev.start) > now,
  );

  const calendarToMissionMap = new Map<string, string>();

  // Start with a copy of all Firestore missions
  const merged: Mission[] = firestoreMissions.map(m => ({ ...m }));

  for (const ev of workEvents) {
    // Find an existing mission that matches this calendar event
    const matchIdx = merged.findIndex(m => titlesMatch(m.title, ev.title));

    if (matchIdx !== -1) {
      // Annotate the matched mission with calendar metadata
      const mission = merged[matchIdx];
      if (!mission.calendarScheduled) {
        merged[matchIdx] = {
          ...mission,
          calendarEventId:    ev.id,
          calendarEventTitle: ev.title,
          calendarEventStart: ev.start,
          calendarScheduled:  true,
          // Tighten the deadline to the calendar event start if it's sooner
          deadline: new Date(ev.start) < new Date(mission.deadline)
            ? ev.start
            : mission.deadline,
        };
        calendarToMissionMap.set(ev.id, mission.id);
        console.log(
          `[Workload] Duplicate detected — matched calendar "${ev.title}" → ` +
          `existing Firestore mission "${mission.title}" (merged, not duplicated)`,
        );
      }
    } else if (!looksLikeMeeting(ev)) {
      // No matching mission and not a pure meeting → add as pseudo-mission
      const pseudo = calendarEventToMission(ev);
      merged.push(pseudo);
      calendarToMissionMap.set(ev.id, pseudo.id);
      console.log(
        `[Workload] No existing mission matched "${ev.title}" — added as pseudo-mission ` +
        `with prep block "${pseudo.prepFocusTitle}" (${pseudo.estimatedMinutes}m)`,
      );
    } else {
      console.log(
        `[Workload] "${ev.title}" treated as blocker-only (meeting heuristic)`,
      );
    }
  }

  console.log(
    `[Workload] Unified workload after merge: ${merged.length} total work items ` +
    `(${firestoreMissions.length} Firestore + ${calendarToMissionMap.size} from calendar)`,
  );

  return { missions: merged, calendarToMissionMap };
}
