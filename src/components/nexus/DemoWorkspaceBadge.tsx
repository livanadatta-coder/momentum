// ============================================================================
// Momentum — Demo Workspace badge
//
// "Do NOT make the demo look fake." A small, honest label — not a banner
// apologizing for sample data — plus a one-click path to the real thing.
// ============================================================================

import { Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNexusData } from "@/providers/NexusDataProvider";

export function DemoWorkspaceBadge() {
  const { isDemoMode } = useNexusData();
  const { signIn } = useAuth();

  if (!isDemoMode) return null;

  return (
    <div className="flex items-center gap-3 rounded-full border border-coral/25 bg-coral/5 px-4 py-2 text-xs text-stone">
      <span className="flex items-center gap-1.5 font-medium text-coral">
        <Sparkles className="h-3.5 w-3.5" />
        Interactive Demo Workspace
      </span>
      <span className="hidden sm:inline">
        This workspace uses realistic sample data to demonstrate Momentum's AI capabilities.
      </span>
      <button
        onClick={signIn}
        className="ml-auto shrink-0 rounded-full border border-line px-3 py-1 text-ink transition hover:bg-soft"
      >
        Connect Google Calendar
      </button>
    </div>
  );
}
