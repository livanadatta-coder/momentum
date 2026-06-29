import { LogOut } from "lucide-react";
import { EmptyStates } from "@/components/nexus/EmptyState";
import { PageIntro } from "@/components/nexus/PageIntro";
import { SpecCard } from "@/components/nexus/SpecCard";
import { Button } from "@/components/ui/Button";
import { designPrinciples, systemModules } from "@/data/mock-data";
import { useAuth } from "@/hooks/useAuth";

export function SettingsPage() {
  const { user, signOut, loading, isDemoMode, exitDemoMode } = useAuth();

  return (
    <div className="space-y-14">
      <PageIntro
        eyebrow="Preferences"
        title="Momentum should feel personal, not configurable."
        description="This page keeps settings human: principles, learned patterns, and quiet states."
      />

      <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {designPrinciples.map((principle) => (
          <SpecCard key={principle.label} className="p-6">
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-[14px] bg-soft text-coral">
              <principle.icon className="h-5 w-5" />
            </div>
            <h2 className="font-serif text-2xl tracking-[-0.025em]">{principle.label}</h2>
            <p className="mt-3 text-sm leading-6 text-stone">{principle.body}</p>
          </SpecCard>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        {systemModules.map((module) => (
          <SpecCard key={module.label} className="p-6">
            <div className="mb-4 flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#eef6ef] text-sage">
                <module.icon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-serif text-2xl tracking-[-0.025em]">{module.label}</h2>
                <p className="text-xs text-coral">{module.status}</p>
              </div>
            </div>
            <p className="text-sm leading-7 text-stone">{module.description}</p>
          </SpecCard>
        ))}
      </section>

      <section>
        <SpecCard className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <h2 className="font-serif text-2xl tracking-[-0.025em]">Account</h2>
            <p className="mt-1 text-sm text-stone">
              {isDemoMode ? "Demo Workspace — sample data, no account connected" : `Signed in as ${user?.email ?? "—"}`}
            </p>
          </div>
          <Button variant="secondary" onClick={isDemoMode ? exitDemoMode : signOut} disabled={loading}>
            <LogOut className="h-4 w-4" />
            {isDemoMode ? "Exit Demo Workspace" : loading ? "Signing out…" : "Sign out"}
          </Button>
        </SpecCard>
      </section>

      <EmptyStates />
    </div>
  );
}


