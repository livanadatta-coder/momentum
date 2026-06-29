// ============================================================================
// Nexus OS — "Last Updated" + replan notification
//
// Momentum should always tell the user when it has reacted: a ticking
// relative-time badge ("2 seconds ago") plus a transient toast naming the
// specific trigger ("...because you completed X"). Both read straight off
// NexusDataContext — no local re-derivation of plan state.
// ============================================================================

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useNexusData } from "@/providers/NexusDataProvider";

function relativeTime(iso: string | null, now: number): string {
  if (!iso) return "not yet run";
  const diffSec = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec} seconds ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.round(diffMin / 60);
  return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
}

export function LastUpdatedBadge() {
  const { lastRunAt, replanReason } = useNexusData();
  const [now, setNow] = useState(() => Date.now());
  const [toastReason, setToastReason] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Surface each new replan reason as a transient toast, then auto-dismiss.
  useEffect(() => {
    if (!replanReason) return;
    setToastReason(replanReason);
    const id = setTimeout(() => setToastReason(null), 6000);
    return () => clearTimeout(id);
  }, [replanReason]);

  return (
    <>
      <span className="inline-flex items-center gap-1.5 text-xs text-stone/70">
        <span className="h-1.5 w-1.5 rounded-full bg-sage animate-pulse" />
        Last updated {relativeTime(lastRunAt, now)}
      </span>

      {/* Rendered via portal to document.body — a notification toast must
          float above every ancestor, including SpecCard's overflow-hidden
          panel, not be clipped by whatever happens to contain the badge. */}
      {createPortal(
        <AnimatePresence>
          {toastReason && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              className="fixed right-5 top-5 z-50 flex w-[min(90vw,22rem)] items-start gap-2
                         rounded-[14px] border border-coral/25 bg-white p-3 shadow-lg"
            >
              <Sparkles className="h-4 w-4 shrink-0 text-coral mt-0.5" />
              <p className="text-xs leading-5 text-ink">{toastReason}</p>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
