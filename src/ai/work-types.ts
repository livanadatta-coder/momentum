// ============================================================================
// Nexus OS — Work-Type Artifact Table
//
// Declarative only. No scheduling, no ordering, no time logic here.
//
// Every kind of work either PRODUCES an artifact (what exists once it's done)
// or REQUIRES one (what it needs before it can start). buildTaskGraph()
// resolves dependencies by matching one task's `requires` against another
// task's `produces` — a task is never told "you come after X" directly,
// it is told "you need implementation," and the graph figures out which
// task in TODAY's actual workload satisfies that.
//
// This is what makes the dependency graph reasoning instead of a fixed
// keyword chain: drop "testing" from the calendar and `deployment` simply
// falls back to requiring raw `implementation` instead of breaking.
// ============================================================================

export type WorkType =
  | "meeting"
  | "execution"
  | "testing"
  | "demo"
  | "documentation"
  | "deployment"
  | "learning"
  | "admin"
  | "personal";

export interface WorkTypeProfile {
  /** Artifact names this work type yields once completed. */
  produces: string[];
  /** Best-case artifacts this work type needs as input. */
  requires: string[];
  /** Degraded input accepted when the best-case artifact isn't in today's workload. */
  fallbackRequires?: string[];
  /** Emoji + display label used as the focus block title. */
  blockLabel: string;
  /** Fixed commitments (meetings, interviews, calls) cannot move — they are
   *  hard constraints the planner schedules around. Everything else is
   *  movable: the planner is free to place its execution block anywhere in
   *  the day (before its own deadline), not pinned to wherever it happened
   *  to land on the calendar. */
  movable: boolean;
  /**
   * True only when the scheduled block fully REPLACES the calendar entry —
   * i.e. the block IS the committed work, just relocated (execution/coding:
   * the calendar event "1 PM Complete Momentum Coding" and the "💻 Deep Work"
   * block are the same work, so showing both would be a stale duplicate).
   * False for work types whose block is PREPARATION supporting a calendar
   * commitment that still happens separately at its own time (testing
   * before a demo, doc review before a submission, etc.) — those keep the
   * original calendar entry on the timeline alongside the prep block.
   */
  replacesCalendarEvent: boolean;
}

export const WORK_TYPE_PROFILES: Record<WorkType, WorkTypeProfile> = {
  meeting: {
    produces: [],
    requires: [],
    blockLabel: "📅 Meeting",
    movable: false,
    replacesCalendarEvent: false,
  },
  execution: {
    produces: ["implementation"],
    requires: [],
    blockLabel: "💻 Momentum • Deep Work",
    movable: true,
    replacesCalendarEvent: true,
  },
  testing: {
    produces: ["verified_implementation"],
    requires: ["implementation"],
    blockLabel: "🧪 Momentum • Testing",
    movable: true,
    replacesCalendarEvent: false,
  },
  demo: {
    produces: ["demo_asset"],
    requires: ["verified_implementation"],
    fallbackRequires: ["implementation"],
    blockLabel: "🎥 Momentum • Demo Preparation",
    movable: true,
    replacesCalendarEvent: false,
  },
  documentation: {
    produces: ["documentation"],
    // implementation is mandatory; demo_asset is opportunistic (fan-in),
    // resolved separately in buildTaskGraph since it's optional, not a fallback.
    requires: ["implementation"],
    blockLabel: "📝 Momentum • Documentation",
    movable: true,
    replacesCalendarEvent: false,
  },
  deployment: {
    produces: ["shipped"],
    requires: ["verified_implementation"],
    fallbackRequires: ["implementation"],
    blockLabel: "🚀 Momentum • Deployment",
    movable: true,
    replacesCalendarEvent: false,
  },
  learning: {
    produces: [],
    requires: [],
    blockLabel: "📚 Momentum • Learning",
    movable: true,
    replacesCalendarEvent: false,
  },
  admin: {
    produces: [],
    requires: [],
    blockLabel: "🔍 Momentum • Review",
    movable: true,
    replacesCalendarEvent: false,
  },
  personal: {
    produces: [],
    requires: [],
    blockLabel: "☕ Personal",
    movable: false,
    replacesCalendarEvent: false,
  },
};

/** Optional fan-in artifact documentation should pick up if it exists today,
 *  without making the workload invalid when it's absent. */
export const DOCUMENTATION_OPTIONAL_INPUT = "demo_asset";

export const BUFFER_BLOCK_LABEL = "📦 Momentum • Buffer";
export const RECOVERY_BLOCK_LABEL = "☕ Momentum • Recovery";

const WORK_TYPE_RULES: Array<{ test: RegExp; type: WorkType }> = [
  // Checked FIRST and regardless of category — a calendar entry like "buy
  // kuro gift" or "cut kuro cake" is unambiguously personal no matter what
  // category the pseudo-mission was stamped with. Without this rule these
  // fell through to the work-fallback below (defaults to "execution" for any
  // calendar-derived item), which wrongly made them eligible to satisfy
  // OTHER tasks' "implementation" requirement via artifact matching — e.g.
  // "push to github" would silently treat "buy kuro gift" as one of its
  // dependency inputs purely because both got tagged producible/work-type,
  // with no semantic relation at all. personal.produces = [] in
  // WORK_TYPE_PROFILES, so correctly classifying these here also fixes that
  // bogus chaining for free.
  { test: /\b(birthday|anniversary|party|celebrat\w*|cake|gift|dinner|lunch date|brunch|wedding|holiday|vacation|trip|movie|game night|hangout|date night)\b/i, type: "personal" },
  { test: /\b(meeting|standup|sync|call|interview|ceremony|retro|planning session|mentor)\b/i, type: "meeting" },
  { test: /\b(code|coding|implement|implementation|build|develop|dev|feature|bug|refactor|finalize|orchestration|orchestrator|layer|module|pipeline|architecture|integrate|integration|backend|frontend|api|service|engine|component|system)\b/i, type: "execution" },
  { test: /\b(test|testing|qa|verify|verification)\b/i, type: "testing" },
  { test: /\b(demo|record|video|walkthrough|presentation|present)\b/i, type: "demo" },
  { test: /\b(doc|docs|document|documentation|write-up|writeup|report|google doc)\b/i, type: "documentation" },
  { test: /\b(push|deploy|deployment|release|ship|github|git|merge|publish|submission|submit)\b/i, type: "deployment" },
  { test: /\b(learn|course|study|tutorial|read)\b/i, type: "learning" },
  { test: /\b(admin|review|email|paperwork|invoice)\b/i, type: "admin" },
];

/**
 * Classifies a title into a WorkType. The title keyword match is the primary
 * signal. When NOTHING matches, defaulting to "personal" unconditionally is
 * wrong: a real, substantive work/academic item with an unusual title (e.g.
 * "Finalize Momentum AI orchestration layer") would silently produce nothing,
 * breaking every dependency chain that should have flowed through it. So the
 * fallback uses the mission's own category: "work"/"academic" items default
 * to "execution" (they're presumed to produce something other tasks may need)
 * — only genuinely personal/admin/health items default to "personal".
 */
export function classifyWorkType(title: string, category?: string): WorkType {
  const rule = WORK_TYPE_RULES.find(r => r.test.test(title));
  return rule ? rule.type : (category === "work" || category === "academic" ? "execution" : "personal");
}
