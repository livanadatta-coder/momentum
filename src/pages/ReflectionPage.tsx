import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, CircleDashed, X, Sparkles } from "lucide-react";
import { Button }       from "@/components/ui/Button";
import { PageIntro }    from "@/components/nexus/PageIntro";
import { SpecCard }     from "@/components/nexus/SpecCard";
import { useNexusData } from "@/providers/NexusDataProvider";
import { saveReflection, loadReflection, loadMemory, saveMemory } from "@/services/firestore.service";
import { MemoryEngine } from "@/ai/memory/memory.engine";
import { localMemoryUpdate } from "@/ai/local-fallback";
import { extractReflectionInsights, generateLearningInsights, type ReflectionInsight } from "@/ai/learning/behavioral-learning";
import { nowISO } from "@/lib/utils";
import type { BehavioralMemory } from "@/types/domain";

const memoryEngine = new MemoryEngine();

// ── Guided reflection option sets ───────────────────────────────────────────

const DAILY_OUTCOMES = ["Everything completed", "Mostly completed", "Some completed", "Very little completed"] as const;
type DailyOutcome = typeof DAILY_OUTCOMES[number];

const PRODUCTIVITY_PERIODS = ["Morning", "Late Morning", "Afternoon", "Evening", "Night"] as const;
type ProductivityPeriod = typeof PRODUCTIVITY_PERIODS[number];

const INTERRUPTIONS = ["Meetings", "Fatigue", "Phone", "Unexpected work", "Context switching", "Nothing"] as const;
type Interruption = typeof INTERRUPTIONS[number];

type TaskReviewAnswer = "completed" | "partially_completed" | "skipped";

/** Turns the guided structured answers into sentences that match the same
 *  REFLECTION_RULES regex the free-text box is parsed with — so a guided
 *  click produces exactly the same kind of structured insight a sentence
 *  would, instead of running through a second, parallel extraction path. */
function composeStructuredReflectionText(
  productivity: ProductivityPeriod | null,
  interruptions: Interruption[],
): string {
  const sentences: string[] = [];
  if (productivity === "Afternoon") sentences.push("I focus much better in the afternoon.");
  if (interruptions.includes("Meetings")) sentences.push("I lose focus after meetings.");
  if (interruptions.includes("Context switching")) sentences.push("I keep switching between tasks.");
  return sentences.join(" ");
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Closes the learning loop: Reflection → Behavioral Memory → tomorrow's plan.
 *  Returns the updated memory so the caller can show "What Momentum Learned"
 *  immediately, instead of waiting for the next page load. */
async function updateMemoryFromReflection(
  userId: string,
  completedToday: import("@/types/domain").Mission[],
  reflectionText: string,
  extraInsights: ReflectionInsight[],
): Promise<{ memory: BehavioralMemory; newInsights: ReflectionInsight[] }> {
  let currentMemory = await loadMemory(userId);

  const extracted = [...extractReflectionInsights(reflectionText), ...extraInsights];
  if (extracted.length) {
    currentMemory = {
      ...currentMemory,
      procrastinationPatterns: [...currentMemory.procrastinationPatterns, ...extracted],
    };
    console.log(`[ReflectionPage] Extracted ${extracted.length} structured insight(s) from reflection:`, extracted);
  }

  const result = await memoryEngine.update({
    userId,
    currentMemory,
    completedMissions: completedToday,
    currentDatetime: nowISO(),
  });
  const updated = result.success && result.data
    ? result.data
    : localMemoryUpdate({ userId, currentMemory, completedMissions: completedToday, currentDatetime: nowISO() });

  await saveMemory(updated);
  console.log("[ReflectionPage] Behavioral Memory updated from today's reflection + completions.");
  return { memory: updated, newInsights: extracted };
}

export function ReflectionPage() {
  const {
    userId, missions, output, executionStates,
    completeTask, partialTask, skipTask,
    replanAfterReflection,
  } = useNexusData();

  const [dailyOutcome, setDailyOutcome]   = useState<DailyOutcome | null>(null);
  const [productivity, setProductivity]   = useState<ProductivityPeriod | null>(null);
  const [interruptions, setInterruptions] = useState<Interruption[]>([]);
  const [freeText, setFreeText]           = useState("");
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved,     setSaved]     = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [learned,   setLearned]   = useState<string[] | null>(null);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    loadReflection(userId, todayKey())
      .then(text => { if (text) { setFreeText(text); setSaved(true); } })
      .catch(err => console.warn("[ReflectionPage] Load failed:", err))
      .finally(() => setLoading(false));
  }, [userId]);

  const tasksToday = useMemo(() => output?.taskGraph ?? [], [output]);

  const toggleInterruption = (item: Interruption) => {
    setInterruptions(prev =>
      prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item],
    );
    if (saved) setSaved(false);
  };

  const reviewTask = (taskId: string, answer: TaskReviewAnswer) => {
    if (answer === "completed") void completeTask(taskId);
    else if (answer === "partially_completed") void partialTask(taskId);
    else void skipTask(taskId);
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const structuredText = composeStructuredReflectionText(productivity, interruptions);
      const sections: string[] = [];
      if (dailyOutcome) sections.push(`Daily outcome: ${dailyOutcome}.`);
      if (productivity) sections.push(`Most productive: ${productivity}.`);
      if (interruptions.length) sections.push(`Interruptions: ${interruptions.join(", ")}.`);
      if (structuredText) sections.push(structuredText);
      if (freeText.trim()) sections.push(freeText.trim());
      const fullText = sections.join(" ");

      await saveReflection(userId, todayKey(), fullText);
      setSaved(true);

      const extraInsights: ReflectionInsight[] = [];
      if (productivity) {
        extraInsights.push({
          category: "general",
          note: `You reported being most productive in the ${productivity.toLowerCase()} — Momentum will weight that period as higher-confidence.`,
        });
      }

      const completedToday = missions.filter(m => m.status === "completed");
      const { memory: updatedMemory, newInsights } = await updateMemoryFromReflection(
        userId, completedToday, fullText, extraInsights,
      );

      // "What Momentum Learned" — built from the same real aggregates the
      // Dashboard card uses, plus the literal sentences just extracted from
      // this reflection, never invented copy.
      const fromAggregates = generateLearningInsights(
        updatedMemory.completionRateByWorkType ?? {},
        updatedMemory.estimationBiasByWorkType ?? {},
        updatedMemory.completionRateByHour ?? {},
      );
      const fromThisReflection = newInsights.map(i => i.note);
      setLearned([...fromThisReflection, ...fromAggregates].slice(0, 5));

      replanAfterReflection();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed. Please try again.";
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-12 lg:grid-cols-[0.7fr_1fr]">
      <PageIntro
        eyebrow="Reflection"
        title="A small pause makes tomorrow easier."
        description="Reflection is not a productivity score. It is how Momentum learns your rhythm without becoming noisy."
        className="lg:sticky lg:top-10 lg:self-start"
      />

      <div className="space-y-6">
        {/* ── Daily Outcome ──────────────────────────────────────────────── */}
        <SpecCard className="p-6 sm:p-7">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-coral">Daily Outcome</h3>
          <p className="mt-2 text-base text-ink">How did today go?</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {DAILY_OUTCOMES.map(o => (
              <button
                key={o}
                onClick={() => { setDailyOutcome(o); setSaved(false); }}
                className={`rounded-full border px-3.5 py-1.5 text-sm transition
                  ${dailyOutcome === o ? "border-coral bg-coral/10 text-coral" : "border-line text-stone hover:bg-soft"}`}
              >
                {o}
              </button>
            ))}
          </div>
        </SpecCard>

        {/* ── Task Review ────────────────────────────────────────────────── */}
        {tasksToday.length > 0 && (
          <SpecCard className="p-6 sm:p-7">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-coral">Task Review</h3>
            <p className="mt-2 text-base text-ink">How did each task go?</p>
            <div className="mt-4 space-y-3">
              {tasksToday.map(task => {
                const state = executionStates[task.missionId]?.status ?? "not_started";
                const isTerminal = ["completed", "partially_completed", "skipped", "cancelled"].includes(state);
                return (
                  <div key={task.missionId} className="flex items-center justify-between gap-3 rounded-[12px] border border-line p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{task.goal}</p>
                      <p className="text-xs text-stone">{state.replace("_", " ")}</p>
                    </div>
                    {!isTerminal && (
                      <div className="flex shrink-0 gap-1.5">
                        <button onClick={() => reviewTask(task.missionId, "completed")}
                          className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-sage hover:bg-soft">
                          <Check className="h-3 w-3" /> Done
                        </button>
                        <button onClick={() => reviewTask(task.missionId, "partially_completed")}
                          className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-amber hover:bg-soft">
                          <CircleDashed className="h-3 w-3" /> Partial
                        </button>
                        <button onClick={() => reviewTask(task.missionId, "skipped")}
                          className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-coral hover:bg-soft">
                          <X className="h-3 w-3" /> Skipped
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </SpecCard>
        )}

        {/* ── Productivity ───────────────────────────────────────────────── */}
        <SpecCard className="p-6 sm:p-7">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-coral">Productivity</h3>
          <p className="mt-2 text-base text-ink">When were you most productive?</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {PRODUCTIVITY_PERIODS.map(p => (
              <button
                key={p}
                onClick={() => { setProductivity(p); setSaved(false); }}
                className={`rounded-full border px-3.5 py-1.5 text-sm transition
                  ${productivity === p ? "border-coral bg-coral/10 text-coral" : "border-line text-stone hover:bg-soft"}`}
              >
                {p}
              </button>
            ))}
          </div>
        </SpecCard>

        {/* ── Interruptions ──────────────────────────────────────────────── */}
        <SpecCard className="p-6 sm:p-7">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-coral">Interruptions</h3>
          <p className="mt-2 text-base text-ink">What interrupted your work?</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {INTERRUPTIONS.map(i => (
              <button
                key={i}
                onClick={() => toggleInterruption(i)}
                className={`rounded-full border px-3.5 py-1.5 text-sm transition
                  ${interruptions.includes(i) ? "border-coral bg-coral/10 text-coral" : "border-line text-stone hover:bg-soft"}`}
              >
                {i}
              </button>
            ))}
          </div>
        </SpecCard>

        {/* ── Estimation Accuracy ────────────────────────────────────────── */}
        {tasksToday.some(t => executionStates[t.missionId]?.actualDuration !== undefined) && (
          <SpecCard className="p-6 sm:p-7">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-coral">Estimation Accuracy</h3>
            <p className="mt-2 text-base text-ink">Estimated vs. actual time spent.</p>
            <div className="mt-4 space-y-2">
              {tasksToday.filter(t => executionStates[t.missionId]?.actualDuration !== undefined).map(t => {
                const rec = executionStates[t.missionId];
                const over = rec.actualDuration! > rec.estimatedDuration;
                return (
                  <div key={t.missionId} className="flex items-center justify-between text-sm">
                    <span className="truncate text-ink">{t.goal}</span>
                    <span className={over ? "text-coral" : "text-sage"}>
                      {rec.estimatedDuration}m est. → {rec.actualDuration}m actual
                    </span>
                  </div>
                );
              })}
            </div>
          </SpecCard>
        )}

        {/* ── Free Reflection ─────────────────────────────────────────────── */}
        <SpecCard className="p-7 sm:p-9">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-coral">Free Reflection</h3>
          <h2 className="mt-2 font-serif text-3xl leading-tight tracking-[-0.03em]">
            What should Momentum remember about today?
          </h2>
          <textarea
            value={loading ? "" : freeText}
            onChange={e => { setFreeText(e.target.value); if (saved) setSaved(false); if (saveError) setSaveError(null); }}
            placeholder={loading ? "Loading…" : "Write a few thoughts..."}
            disabled={loading}
            className="mt-6 min-h-[180px] w-full resize-none rounded-[18px] border border-line
                       bg-[#fffdf9] p-5 text-sm text-ink placeholder:text-stone/50
                       focus:outline-none focus:ring-1 focus:ring-coral/30
                       transition-shadow disabled:opacity-60"
          />
          {saveError && <p className="mt-3 text-xs text-coral">{saveError}</p>}
          <Button className="mt-6 w-full" onClick={handleSave} disabled={saving || loading}>
            {saving ? "Saving…" : saved ? "Saved" : "Save reflection"}
          </Button>
        </SpecCard>

        {/* ── What Momentum Learned ──────────────────────────────────────── */}
        <AnimatePresence>
          {learned && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-[18px] border border-sage/30 bg-sage/5 p-6 sm:p-7"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-sage" />
                <h3 className="text-sm font-semibold text-ink">What Momentum Learned</h3>
              </div>
              {learned.length === 0 ? (
                <p className="mt-3 text-sm text-stone">
                  Not enough history yet to learn from — Momentum will start drawing insights as you complete more tasks.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {learned.map((insight, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm leading-6 text-ink">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sage" />
                      {insight}
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
