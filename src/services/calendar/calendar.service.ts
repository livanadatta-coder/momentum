// ============================================================================
// Nexus OS â€” Calendar Service
// Thin wrapper around the Google Calendar REST API (called directly via
// fetch + the OAuth access token captured at sign-in â€” no `googleapis`
// package needed, that's a Node-oriented SDK and overkill for browser use).
//
// All functions take the access token explicitly rather than reading it
// from a module-level singleton here, so this file has no dependency on
// how/where the token is stored (kept in @/auth/auth.service.ts).
// ============================================================================

import type { CalendarEvent } from "@/types/domain";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";
const PRIMARY_CALENDAR = "primary";

export class CalendarServiceError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "CalendarServiceError";
  }
}

// â”€â”€ Google Calendar API shapes (subset of fields we actually use) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface GoogleEventDateTime {
  dateTime?: string; // timed events
  date?: string;      // all-day events ("YYYY-MM-DD")
}

interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  start: GoogleEventDateTime;
  end: GoogleEventDateTime;
  status?: string;
  extendedProperties?: { private?: Record<string, string> };
}

interface GoogleEventsListResponse {
  items?: GoogleCalendarEvent[];
}

// â”€â”€ Mapping: Google event â†” domain CalendarEvent â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function toISOString(dt: GoogleEventDateTime): string {
  // All-day events only have `date`; normalize to midnight local ISO so
  // every CalendarEvent has a usable start/end for the orchestrator.
  return dt.dateTime ?? new Date(`${dt.date}T00:00:00`).toISOString();
}

function fromGoogleEvent(event: GoogleCalendarEvent): CalendarEvent {
  const nexusMissionId = event.extendedProperties?.private?.nexusMissionId;
  const isNexusProtected = event.extendedProperties?.private?.nexusProtected === "true";
  return {
    id: event.id,
    title: event.summary || "(untitled event)",
    start: toISOString(event.start),
    end: toISOString(event.end),
    isBlocked: isNexusProtected,
    // All-day events use `date` only (no `dateTime`) — birthdays, holidays.
    // Informational, never a real time commitment.
    allDay: Boolean(event.start.date && !event.start.dateTime),
    // CRITICAL: an event Nexus itself wrote to the calendar (tagged
    // nexusProtected at creation) must come back tagged source: "nexus",
    // never "google". Every busy-time calculation and the shared timeline
    // filter on `source !== "nexus"` to exclude Nexus's own prior output —
    // if this were "google", a previously-accepted plan's focus blocks
    // would be treated as real immovable commitments on every later run,
    // eating up preferred-hours slots and cascading into false "could not
    // fit, risk elevated" placements for every subsequent block.
    source: isNexusProtected ? "nexus" : "google",
    missionId: nexusMissionId,
  };
}

// â”€â”€ Fetch helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function calendarFetch<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${CALENDAR_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new CalendarServiceError(
      `Google Calendar API error (${response.status}): ${body || response.statusText}`,
      response.status,
    );
  }

  // 204 No Content (e.g. some delete responses) has no body to parse
  if (response.status === 204) return {} as T;
  return response.json() as Promise<T>;
}

// â”€â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Fetch events across an arbitrary date range from the user's primary Google
 * Calendar. `startISO` and `endISO` are RFC 3339 strings (inclusive/exclusive).
 * maxResults is raised to 250 to cover a multi-day planning horizon reliably.
 */
export async function fetchEventsForRange(
  accessToken: string,
  startISO: string,
  endISO: string,
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: startISO,
    timeMax: endISO,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });

  const data = await calendarFetch<GoogleEventsListResponse>(
    accessToken,
    `/calendars/${PRIMARY_CALENDAR}/events?${params.toString()}`,
  );

  return (data.items ?? [])
    .filter(event => event.status !== "cancelled")
    .map(fromGoogleEvent);
}

/**
 * Fetch today's events only — kept for backward compatibility with UI components
 * that still display a single-day view (CalendarPage, DayPage).
 * The orchestrator should use fetchEventsForRange with the full planning horizon.
 */
export async function fetchTodayEvents(accessToken: string): Promise<CalendarEvent[]> {
  const now        = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay   = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  return fetchEventsForRange(accessToken, startOfDay.toISOString(), endOfDay.toISOString());
}

/**
 * Creates a focus-block event on the user's primary calendar from a Nexus
 * FocusWindow. Tags it via extendedProperties so a later fetch recognises
 * it as Nexus-protected (isBlocked: true) rather than a generic event.
 */
export async function createFocusBlockEvent(
  accessToken: string,
  block: { title: string; start: string; end: string; missionId?: string; reason?: string },
): Promise<CalendarEvent> {
  const body = {
    summary: block.title,
    description: block.reason,
    start: { dateTime: block.start },
    end: { dateTime: block.end },
    extendedProperties: {
      private: {
        nexusProtected: "true",
        ...(block.missionId ? { nexusMissionId: block.missionId } : {}),
      },
    },
  };

  const created = await calendarFetch<GoogleCalendarEvent>(
    accessToken,
    `/calendars/${PRIMARY_CALENDAR}/events`,
    { method: "POST", body: JSON.stringify(body) },
  );

  return fromGoogleEvent(created);
}

/** Creates multiple focus-block events sequentially, collecting any failures. */
export async function createFocusBlockEvents(
  accessToken: string,
  blocks: Array<{ title: string; start: string; end: string; missionId?: string; reason?: string }>,
): Promise<{ created: CalendarEvent[]; failed: number }> {
  const created: CalendarEvent[] = [];
  let failed = 0;

  for (const block of blocks) {
    try {
      created.push(await createFocusBlockEvent(accessToken, block));
    } catch (err) {
      failed += 1;
      console.error("[CalendarService] Failed to create focus block:", block.title, err);
    }
  }

  return { created, failed };
}

/**
 * Deletes every Nexus-protected event (tagged via extendedProperties at
 * creation time) within a date range. Call this BEFORE writing a fresh set
 * of focus blocks so a previous "Accept plan" run never leaves stale/legacy
 * titled events sitting on the user's real calendar — there is exactly one
 * write path for planner-generated events, and it always replaces, never
 * accumulates.
 */
export async function deleteNexusEventsInRange(
  accessToken: string,
  startISO: string,
  endISO: string,
): Promise<{ deleted: number; failed: number }> {
  const params = new URLSearchParams({
    timeMin: startISO,
    timeMax: endISO,
    singleEvents: "true",
    privateExtendedProperty: "nexusProtected=true",
    maxResults: "250",
  });

  const data = await calendarFetch<GoogleEventsListResponse>(
    accessToken,
    `/calendars/${PRIMARY_CALENDAR}/events?${params.toString()}`,
  );

  let deleted = 0;
  let failed = 0;
  for (const event of data.items ?? []) {
    try {
      await calendarFetch<void>(
        accessToken,
        `/calendars/${PRIMARY_CALENDAR}/events/${event.id}`,
        { method: "DELETE" },
      );
      deleted += 1;
    } catch (err) {
      failed += 1;
      console.error("[CalendarService] Failed to delete stale Nexus event:", event.id, err);
    }
  }
  return { deleted, failed };
}
