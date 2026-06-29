// ============================================================================
// Nexus OS — Behavioural Learning Engine
//
// Pure functions that derive BehavioralMemory fields strictly from real
// ExecutionRecord history. Nothing here invents a number or an insight —
// every value/sentence traces back to actual completed/skipped/partial
// records. Below a minimum sample size, a metric is simply omitted rather
// than reported with false confidence.
// ============================================================================

import type { ExecutionRecord } from "@/types/domain";

const MIN_SAMPLES = 2;

const TERMINAL = new Set(["completed", "partially_completed", "skipped"]);

function terminalRecords(records: ExecutionRecord[]): ExecutionRecord[] {
  return records.filter(r => TERMINAL.has(r.status));
}

export function computeCompletionRateByWorkType(records: ExecutionRecord[]): Record<string, number> {
  const byType = new Map<string, { done: number; total: number }>();
  for (const r of terminalRecords(records)) {
    const bucket = byType.get(r.workType) ?? { done: 0, total: 0 };
    bucket.total += 1;
    if (r.status === "completed") bucket.done += 1;
    else if (r.status === "partially_completed") bucket.done += 0.5;
    byType.set(r.workType, bucket);
  }
  const out: Record<string, number> = {};
  for (const [type, b] of byType) {
    if (b.total >= MIN_SAMPLES) out[type] = Math.round((b.done / b.total) * 100) / 100;
  }
  return out;
}

export function computeEstimationBiasByWorkType(records: ExecutionRecord[]): Record<string, number> {
  const byType = new Map<string, number[]>();
  for (const r of terminalRecords(records)) {
    if (!r.actualDuration || !r.estimatedDuration) continue;
    const ratios = byType.get(r.workType) ?? [];
    ratios.push(r.actualDuration / r.estimatedDuration);
    byType.set(r.workType, ratios);
  }
  const out: Record<string, number> = {};
  for (const [type, ratios] of byType) {
    if (ratios.length >= MIN_SAMPLES) {
      out[type] = Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100) / 100;
    }
  }
  return out;
}

export function computeCompletionRateByHour(records: ExecutionRecord[]): Record<number, number> {
  const byHour = new Map<number, { done: number; total: number }>();
  for (const r of terminalRecords(records)) {
    const hour = new Date(r.plannedStart).getHours();
    const bucket = byHour.get(hour) ?? { done: 0, total: 0 };
    bucket.total += 1;
    if (r.status === "completed") bucket.done += 1;
    else if (r.status === "partially_completed") bucket.done += 0.5;
    byHour.set(hour, bucket);
  }
  const out: Record<number, number> = {};
  for (const [hour, b] of byHour) {
    if (b.total >= MIN_SAMPLES) out[hour] = Math.round((b.done / b.total) * 100) / 100;
  }
  return out;
}

/** Burnout signal — strictly from a real declining trend in the most recent
 *  terminal records vs. the ones before them. Requires enough samples in
 *  BOTH windows so one bad afternoon can't trigger a false signal. */
export function computeBurnoutIndicators(records: ExecutionRecord[]): string[] {
  const terminal = terminalRecords(records)
    .slice()
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (terminal.length < 8) return [];

  const scoreOf = (r: ExecutionRecord) =>
    r.status === "completed" ? 1 : r.status === "partially_completed" ? 0.5 : 0;

  const windowSize = Math.min(5, Math.floor(terminal.length / 2));
  const recent = terminal.slice(-windowSize);
  const prior = terminal.slice(-windowSize * 2, -windowSize);

  const avg = (rs: ExecutionRecord[]) => rs.reduce((a, r) => a + scoreOf(r), 0) / rs.length;
  const recentAvg = avg(recent);
  const priorAvg = avg(prior);

  const indicators: string[] = [];
  if (priorAvg - recentAvg >= 0.3) {
    indicators.push(
      `Completion rate dropped from ${Math.round(priorAvg * 100)}% to ${Math.round(recentAvg * 100)}% over your last ${windowSize} tasks.`,
    );
  }

  const trailingSkips = [...terminal].reverse().findIndex(r => r.status !== "skipped");
  if (trailingSkips >= 3 || (trailingSkips === -1 && terminal.length >= 3)) {
    indicators.push(`${trailingSkips === -1 ? terminal.length : trailingSkips} tasks in a row were skipped.`);
  }

  return indicators;
}

function readableWorkType(type: string): string {
  return type === "execution" ? "coding" : type;
}

/** Human-readable insights for the "Momentum Learning" dashboard card —
 *  every sentence is generated directly from the aggregates above, never
 *  invented copy. Newest/most-significant first, capped at 4. */
export function generateLearningInsights(
  completionByType: Record<string, number>,
  biasByType: Record<string, number>,
  completionByHour: Record<number, number>,
  burnoutIndicators: string[] = [],
  meetingRecoveryMinutes?: number,
): string[] {
  const insights: string[] = [];

  for (const indicator of burnoutIndicators) {
    insights.push(`Momentum noticed: ${indicator} Today's workload risk has been raised and lower-priority work will be deferred first.`);
  }
  if (meetingRecoveryMinutes) {
    insights.push(`Work scheduled right after your meetings is completed less reliably — Momentum will protect ${meetingRecoveryMinutes} minutes of recovery time after meetings.`);
  }

  for (const [type, rate] of Object.entries(completionByType)) {
    const pct = Math.round(rate * 100);
    if (pct >= 80) {
      insights.push(`Momentum has learned that you complete ${pct}% of ${readableWorkType(type)} tasks.`);
    } else if (pct <= 50) {
      insights.push(`You complete only ${pct}% of ${readableWorkType(type)} tasks scheduled so far — Momentum will start placing them earlier.`);
    }
  }

  for (const [type, bias] of Object.entries(biasByType)) {
    const pctOver = Math.round((bias - 1) * 100);
    if (pctOver >= 15) {
      insights.push(`${readableWorkType(type).replace(/^./, c => c.toUpperCase())} tasks take ${pctOver}% longer than your estimates.`);
    } else if (pctOver <= -15) {
      insights.push(`${readableWorkType(type).replace(/^./, c => c.toUpperCase())} tasks finish ${Math.abs(pctOver)}% faster than estimated — Momentum will tighten future estimates.`);
    }
  }

  const hourEntries = Object.entries(completionByHour).map(([h, r]) => [Number(h), r] as const);
  if (hourEntries.length >= 2) {
    const best = hourEntries.reduce((a, b) => (b[1] > a[1] ? b : a));
    const worst = hourEntries.reduce((a, b) => (b[1] < a[1] ? b : a));
    if (best[1] - worst[1] >= 0.3) {
      const fmt = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString("en-US", { hour: "numeric" });
      insights.push(`You complete significantly more work around ${fmt(best[0])} than around ${fmt(worst[0])}.`);
    }
  }

  return insights.slice(0, 4);
}

// ── Reflection → structured insight extraction ──────────────────────────────
// Free-text reflection isn't learning on its own — it has to become a
// structured signal the scheduler can actually act on. This is intentionally
// a small, explicit rule set (not an LLM call) so it's deterministic and
// auditable: every extracted insight is traceable to the literal phrase that
// triggered it.

export interface ReflectionInsight {
  category: string;     // WorkType this note applies to, or "general"
  note: string;
}

const REFLECTION_RULES: Array<{ test: RegExp; build: (match: RegExpMatchArray) => ReflectionInsight }> = [
  {
    test: /underestimat\w*\s+(the\s+)?documentation|documentation\s+(took|takes)\s+longer/i,
    build: () => ({ category: "documentation", note: "You reported underestimating documentation — future documentation blocks will be reserved with extra time." }),
  },
  {
    test: /underestimat\w*\s+(the\s+)?(coding|implementation)|coding\s+(took|takes)\s+longer/i,
    build: () => ({ category: "execution", note: "You reported underestimating coding work — future coding blocks will be reserved with extra time." }),
  },
  {
    test: /focus(es)?\s+(much\s+)?better\s+(in\s+the\s+)?afternoon|after\s+lunch/i,
    build: () => ({ category: "general", note: "You reported focusing better after lunch — afternoon hours will be weighted as higher-confidence for demanding work." }),
  },
  {
    test: /lose\s+focus\s+after\s+(long\s+)?meetings?|drained\s+after\s+meetings?/i,
    build: () => ({ category: "meeting", note: "You reported losing focus after long meetings — Momentum will reduce scheduling confidence immediately after meetings and consider a recovery buffer." }),
  },
  {
    test: /switch(ed|ing)\s+between\s+tasks|context\s+switch/i,
    build: () => ({ category: "general", note: "You reported switching between tasks — Momentum will favor longer uninterrupted blocks going forward." }),
  },
];

export function extractReflectionInsights(text: string): ReflectionInsight[] {
  const insights: ReflectionInsight[] = [];
  for (const rule of REFLECTION_RULES) {
    const match = text.match(rule.test);
    if (match) insights.push(rule.build(match));
  }
  return insights;
}

export interface DerivedMemoryFields {
  completionRateByWorkType: Record<string, number>;
  estimationBiasByWorkType: Record<string, number>;
  completionRateByHour: Record<number, number>;
  learningInsights: string[];
  burnoutIndicators: string[];
  meetingRecoveryMinutes?: number;
}

export function deriveMemoryFromExecutionHistory(records: ExecutionRecord[]): DerivedMemoryFields {
  const completionRateByWorkType = computeCompletionRateByWorkType(records);
  const estimationBiasByWorkType = computeEstimationBiasByWorkType(records);
  const completionRateByHour = computeCompletionRateByHour(records);
  const burnoutIndicators = computeBurnoutIndicators(records);
  const meetingRecoveryMinutes = computeMeetingRecoveryMinutes(records);
  const learningInsights = generateLearningInsights(
    completionRateByWorkType, estimationBiasByWorkType, completionRateByHour, burnoutIndicators, meetingRecoveryMinutes,
  );
  return {
    completionRateByWorkType, estimationBiasByWorkType, completionRateByHour,
    learningInsights, burnoutIndicators, meetingRecoveryMinutes,
  };
}

/** Extra post-meeting recovery buffer, learned only from how often the task
 *  scheduled IMMEDIATELY after a meeting-anchored gap ends up skipped or
 *  partially completed vs. completed cleanly. A record counts as "post-meeting"
 *  when its planned start is within 15 minutes of another terminal record's
 *  planned end and that prior record's workType is "meeting". */
export function computeMeetingRecoveryMinutes(records: ExecutionRecord[]): number | undefined {
  const terminal = terminalRecords(records);
  const meetings = terminal.filter(r => r.workType === "meeting");
  if (meetings.length < MIN_SAMPLES) return undefined;

  const postMeeting: ExecutionRecord[] = [];
  for (const meeting of meetings) {
    const meetingEnd = new Date(meeting.plannedEnd).getTime();
    const next = terminal.find(r => {
      const start = new Date(r.plannedStart).getTime();
      return r.workType !== "meeting" && Math.abs(start - meetingEnd) <= 15 * 60_000;
    });
    if (next) postMeeting.push(next);
  }
  if (postMeeting.length < MIN_SAMPLES) return undefined;

  const impaired = postMeeting.filter(r => r.status !== "completed").length;
  const impairedRate = impaired / postMeeting.length;
  if (impairedRate < 0.4) return undefined;

  // Scale 15–30 minutes of buffer with how often post-meeting work suffers.
  return Math.round(15 + impairedRate * 15);
}
