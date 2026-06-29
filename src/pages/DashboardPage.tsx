// ============================================================================
// Nexus OS — DashboardPage
//
// Milestone 3: now consumes useNexusData() instead of managing its own
// calendar fetch and useNexus state. All data is shared via context.
// Only accept-plan UI state remains local.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight, CheckCircle2, Clock, Sparkles, AlertTriangle, CalendarCheck,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button }      from "@/components/ui/Button";
import { Landscape }   from "@/components/nexus/Landscape";
import { PageIntro }   from "@/components/nexus/PageIntro";
import { SpecCard }    from "@/components/nexus/SpecCard";
import { MomentumLearningCard } from "@/components/nexus/MomentumLearningCard";
import { LastUpdatedBadge } from "@/components/nexus/LastUpdatedBadge";
import { NexusThinking, AgentProgress, AgentPulse } from "@/components/ui/NexusThinking";
import {
  experienceSteps,
  missions as mockMissions,
} from "@/data/mock-data";
import { useNexusData } from "@/providers/NexusDataProvider";
import { useAuth }      from "@/hooks/useAuth";
import { getCalendarAccessToken } from "@/auth/auth.service";
import { createFocusBlockEvents, deleteNexusEventsInRange } from "@/services/calendar/calendar.service";
import type { OrchestratorOutput } from "@/types/domain";

// ── Derived display helpers ───────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5)  return "night";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function getTopMissionTitle(output: OrchestratorOutput | null): string {
  if (output?.brief?.topPriority) return output.brief.topPriority;
  return mockMissions[0]?.title ?? "Your top priority";
}

function getPeakWindowLabel(output: OrchestratorOutput | null): string {
  const peak = output?.summary.peakFocusWindow;
  if (!peak) return "10:00 AM - 12:30 PM";
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  return `${fmt(peak.window.start)} - ${fmt(peak.window.end)}`;
}

function getWhyReasoning(output: OrchestratorOutput | null): string {
  const peak = output?.summary.peakFocusWindow;
  if (peak?.reason) return peak.reason;
  return "Your focus score peaks in the late morning based on prior work patterns.";
}

function getCompletedList(output: OrchestratorOutput | null): string[] {
  if (output?.summary.completedActions.length) return output.summary.completedActions;
  return [
    "Protected 2h 30m of deep work",
    "Moved design sync to tomorrow",
    "Shortened your evening workload",
    "Added recovery buffer after 5 PM",
  ];
}

function getEstimatedFinish(output: OrchestratorOutput | null): string {
  if (!output?.summary.estimatedFinishTime) return "6:20 PM";
  return new Date(output.summary.estimatedFinishTime).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ThinkingOverlay({
  step,
  activeAgent,
}: {
  step: string | null;
  activeAgent: ReturnType<typeof useNexusData>["activeAgent"];
}) {
  return (
    <AnimatePresence>
      {step && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 z-10 flex flex-col justify-end p-7 sm:p-10
                     bg-white/55 backdrop-blur-[2px] rounded-[inherit]"
        >
          <NexusThinking step={step} activeAgent={activeAgent} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function RiskBanner({ output }: { output: OrchestratorOutput | null }) {
  if (!output) return null;
  const flagged = output.summary.atRiskSignals;
  if (!flagged.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 rounded-[14px] border border-amber/30
                 bg-amber/5 p-4 mt-4"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-ink">
          {flagged.length === 1 ? "1 mission at risk" : `${flagged.length} missions at risk`}
        </p>
        <p className="mt-1 text-xs leading-5 text-stone">{flagged[0].reason}</p>
        {flagged[0].recommendations?.[0] && (
          <p className="mt-1 text-xs text-coral font-medium">
            {flagged[0].recommendations[0]}
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { user, error: authError } = useAuth();

  const {
    status,
    output,
    thinkingStep,
    activeAgent,
    error,
    persistenceError,
    fromCache,
    forceRefresh,
    calendarSource,
    calendarNotice,
    refreshCalendar,
    displayName,
  } = useNexusData();

  const userId = user?.uid ?? "";

  useEffect(() => {
    console.log("[Momentum] 1. Dashboard mounted");
  }, []);

  useEffect(() => {
    if (user !== undefined) {
      console.log(`[Momentum] 2. Auth state resolved`);
      console.log(`[Momentum] 3. User authenticated: uid=${userId}`);
    }
  }, [user, userId]);

  useEffect(() => {
    if (status === "ready") {
      console.log(`[Momentum] 13. Dashboard render source: ${fromCache ? "Cache" : "Gemini"}`);
    }
  }, [status, fromCache]);

  // ── Accept plan: write AI focus blocks to Calendar ────────────────────────
  const [acceptStatus, setAcceptStatus]     = useState<"idle" | "writing" | "done" | "error">("idle");
  const [acceptedSessionId, setAcceptedSessionId] = useState<string | null>(null);
  const [acceptNotice, setAcceptNotice]     = useState<string | null>(null);

  useEffect(() => {
    if (output?.sessionId && output.sessionId !== acceptedSessionId) {
      setAcceptStatus("idle");
    }
  }, [output?.sessionId, acceptedSessionId]);

  const handleAccept = useCallback(async () => {
    if (!output?.focusWindows?.length) return;
    if (output.sessionId === acceptedSessionId) return;

    const token = getCalendarAccessToken();
    if (!token) {
      setAcceptNotice("Connect your Google Calendar (sign in again) to accept this plan.");
      return;
    }

    setAcceptStatus("writing");
    try {
      // There is exactly one write path for planner-generated events. Before
      // writing the current plan, delete every Nexus-protected event already
      // on the calendar across the same span — otherwise a previous "Accept
      // plan" run (potentially from before a planner fix landed) leaves
      // stale/legacy-titled events sitting there forever, accumulating
      // alongside the new ones instead of being replaced by them.
      if (output.focusWindows.length > 0) {
        const starts = output.focusWindows.map(fw => fw.window.start).sort();
        const ends   = output.focusWindows.map(fw => fw.window.end).sort();
        const rangeStart = new Date(new Date(starts[0]).getTime() - 24 * 3_600_000).toISOString();
        const rangeEnd   = new Date(new Date(ends[ends.length - 1]).getTime() + 24 * 3_600_000).toISOString();
        const { deleted } = await deleteNexusEventsInRange(token, rangeStart, rangeEnd);
        console.log(`[Dashboard] Cleared ${deleted} stale Nexus event(s) before writing the current plan.`);
      }

      // Use the planner's own block title/reason directly — it already
      // carries the real work-type label (e.g. "💻 Deep Work") and
      // dependency-grounded explanation. There is no other source of truth
      // for what gets written to the calendar.
      const { created, failed } = await createFocusBlockEvents(
        token,
        output.focusWindows.map(fw => ({
          title: fw.title ?? "🎯 Momentum • Deep Work",
          start: fw.window.start,
          end: fw.window.end,
          missionId: fw.missionId,
          reason: fw.reason,
        })),
      );

      setAcceptNotice(
        failed > 0
          ? `Added ${created.length} focus block${created.length === 1 ? "" : "s"} to your calendar (${failed} failed).`
          : `Added ${created.length} focus block${created.length === 1 ? "" : "s"} to your calendar.`,
      );
      setAcceptStatus(failed > 0 && created.length === 0 ? "error" : "done");
      if (created.length > 0) setAcceptedSessionId(output.sessionId);

      await refreshCalendar();
    } catch (err) {
      console.error("[Dashboard] Accept plan failed:", err);
      setAcceptNotice("Couldn't write the plan to your calendar. Please try again.");
      setAcceptStatus("error");
    }
  }, [output, refreshCalendar]);

  const handleForceRefresh = useCallback(() => forceRefresh(), [forceRefresh]);

  // ── Derived display values ────────────────────────────────────────────────
  const isThinking    = status === "thinking" || status === "loading_memory";
  const topTitle      = getTopMissionTitle(output);
  const peakWindow    = getPeakWindowLabel(output);
  const whyReasoning  = getWhyReasoning(output);
  const completedList = getCompletedList(output);
  const finishTime    = getEstimatedFinish(output);
  const isPeakWindow  = Boolean(output?.summary.peakFocusWindow);

  return (
    <div className="space-y-14">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="grid gap-10 lg:grid-cols-[0.62fr_1fr] lg:items-start">

        {/* Left col */}
        <div className="space-y-8">
          <div>
            <div className="flex items-center gap-4">
              <h1 className="font-serif text-6xl tracking-[-0.045em] text-ink sm:text-7xl">
                Momentum
              </h1>
              <Sparkles className="h-8 w-8 text-coral" />
            </div>
            <p className="mt-5 text-lg leading-8 text-stone">
              AI Companion. Your day, intelligently orchestrated.
            </p>
          </div>

          <section>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-coral">
              Product Vision
            </p>
            <p className="max-w-sm text-lg leading-8 text-ink">
              Momentum is your autonomous AI Chief of Staff. It plans your day, protects your
              focus, predicts risks, and adapts in real time so you can do your best work
              and still have a life.
            </p>
          </section>

          <section>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-coral">
              Core Promise
            </p>
            <p className="max-w-sm text-lg leading-8 text-ink">
              Before you ask, Momentum has already thought it through.
            </p>
          </section>

          {status === "ready" && output && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-stone">
                Agents executed
              </p>
              <AgentPulse agents={output.executedAgents} />
              <p className="mt-3 text-xs text-stone/60">
                {calendarSource === "google"
                  ? "Calendar: live from Google Calendar"
                  : "Calendar: sample schedule"}
              </p>
            </motion.div>
          )}

          {status === "error" && error && (
            <p className="text-xs text-stone bg-soft rounded-lg p-3 border border-line">
              Momentum encountered an issue: {error}. Showing cached data.
            </p>
          )}
          {authError && (
            <p className="text-xs text-stone bg-soft rounded-lg p-3 border border-line">
              {authError}
            </p>
          )}
          {persistenceError && (
            <p className="text-xs text-stone bg-soft rounded-lg p-3 border border-line">
              Firestore save failed: {persistenceError}
            </p>
          )}
          {calendarNotice && (
            <p className="text-xs text-stone bg-soft rounded-lg p-3 border border-line">
              {calendarNotice}
            </p>
          )}
          {acceptNotice && (
            <p className="text-xs text-stone bg-soft rounded-lg p-3 border border-line">
              {acceptNotice}
            </p>
          )}
        </div>

        {/* Right col — SpecCard */}
        <SpecCard className="relative overflow-hidden">
          <ThinkingOverlay step={thinkingStep} activeAgent={activeAgent} />

          <div className="p-7 sm:p-10">
            <div className="mb-5 flex items-center justify-between gap-3">
              <p className="text-sm text-stone">
                Good {greeting()}, {displayName}
              </p>
              <LastUpdatedBadge />
            </div>

            <h2 className="max-w-2xl font-serif text-5xl leading-[1.02] tracking-[-0.04em] sm:text-6xl">
              Here is your day,{" "}
              <span className="text-coral">already thought</span> through.
            </h2>

            <AnimatePresence mode="wait">
              {output?.brief?.summary ? (
                <motion.p
                  key="live-summary"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-6 max-w-xl text-lg leading-8 text-stone"
                >
                  {output.brief.summary}
                </motion.p>
              ) : (
                <motion.p
                  key="static-summary"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-6 max-w-xl text-lg leading-8 text-stone"
                >
                  You have one important decision.
                </motion.p>
              )}
            </AnimatePresence>

            {isThinking && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-5"
              >
                <AgentProgress activeAgent={activeAgent} />
              </motion.div>
            )}

            {status === "ready" && <RiskBanner output={output} />}

            <AnimatePresence mode="wait">
              <motion.div
                key={status === "ready" ? "live-card" : "static-card"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: status === "ready" ? 0.15 : 0 }}
                className="mt-8 max-w-xl rounded-[18px] border border-line bg-white p-5 shadow-sm"
              >
                <p className="text-base font-semibold text-ink">
                  {topTitle} before lunch.
                </p>

                <div className="mt-4 flex flex-wrap gap-2 text-xs text-stone">
                  <span className="rounded-full bg-soft px-3 py-1.5">
                    Focus window
                  </span>
                  <span className="rounded-full bg-soft px-3 py-1.5">
                    {peakWindow}
                  </span>
                  {isPeakWindow && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="rounded-full bg-coral/10 px-3 py-1.5 text-coral"
                    >
                      Peak productivity
                    </motion.span>
                  )}
                </div>

                <p className="mt-5 text-sm font-semibold text-ink">Why this?</p>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={whyReasoning}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-2 text-sm leading-6 text-stone"
                  >
                    {whyReasoning}
                  </motion.p>
                </AnimatePresence>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Button
                    onClick={handleAccept}
                    disabled={
                      status !== "ready" ||
                      acceptStatus === "writing" ||
                      output?.sessionId === acceptedSessionId
                    }
                  >
                    {acceptStatus === "writing" && "Adding to calendar..."}
                    {acceptStatus === "done" && (
                      <span className="flex items-center gap-2">
                        <CalendarCheck className="h-4 w-4" /> Added to calendar
                      </span>
                    )}
                    {(acceptStatus === "idle" || acceptStatus === "error") && "Accept plan"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleForceRefresh}
                    disabled={isThinking}
                  >
                    {isThinking ? "Thinking..." : "Refresh AI Plan"}
                  </Button>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <Landscape />
        </SpecCard>
      </header>

      {/* ── Experience steps ──────────────────────────────────────────────── */}
      <section className="grid gap-6 border-y border-line py-8 md:grid-cols-5">
        {experienceSteps.map((step, index) => (
          <motion.div
            key={step.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: index * 0.04 }}
            className="flex gap-4 md:block"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                            border border-coral/30 bg-white text-sm text-coral">
              {index + 1}
            </div>
            <step.icon className="mt-4 hidden h-5 w-5 text-stone md:block" />
            <p className="mt-0 max-w-[160px] text-sm font-medium leading-5 text-ink md:mt-4">
              {step.label}
            </p>
          </motion.div>
        ))}
      </section>

      {/* ── "What Momentum already did" ──────────────────────────────────────── */}
      <section className="grid gap-10 lg:grid-cols-[0.7fr_1fr]">
        <PageIntro
          eyebrow="What Momentum already did"
          title="A quieter morning, before you touched the app."
          description="The product should feel useful before it asks for attention. This page shows that promise immediately."
        />
        <div className="space-y-3">
          <AnimatePresence>
            {completedList.map((item, i) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.07 }}
                className="flex items-center gap-4 rounded-[18px] bg-white/76 p-4
                           shadow-sm ring-1 ring-line"
              >
                <CheckCircle2 className="h-5 w-5 shrink-0 text-sage" />
                <span className="text-sm font-medium text-ink">{item}</span>
              </motion.div>
            ))}
          </AnimatePresence>

          {output && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-stone/60 pt-1"
            >
              {fromCache
                ? `Loaded from cache - no API call - cached at ${output.cachedAt ? new Date(output.cachedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "today"}`
                : `Analyzed in ${(output.processingMs / 1000).toFixed(1)}s across ${output.executedAgents.length} agents${output.firestoreSessionId ? ` - saved session ${output.firestoreSessionId}` : ""}`
              }
            </motion.p>
          )}

          <div className="mt-6 flex items-center gap-3 text-sm text-stone">
            <Clock className="h-4 w-4 text-coral" />
            Estimated workday finish: {finishTime}
          </div>

          <Button className="mt-2" variant="secondary" onClick={handleForceRefresh}>
            {fromCache ? "Regenerate plan" : "See why it changed things"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      <section className="mt-2">
        <MomentumLearningCard />
      </section>

    </div>
  );
}
