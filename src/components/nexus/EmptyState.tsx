import { CalendarDays, CheckCircle2 } from "lucide-react";
import { SpecCard } from "@/components/nexus/SpecCard";

export function EmptyStates() {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <SpecCard className="p-8 text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-[14px] bg-soft text-stone">
          <CalendarDays className="h-5 w-5" />
        </div>
        <h3 className="font-serif text-2xl text-ink">No events yet</h3>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-stone">
          Connect your calendar and Momentum will fill this space with intention.
        </p>
      </SpecCard>
      <SpecCard className="p-8 text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#eef6ef] text-sage">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <h3 className="font-serif text-2xl text-ink">All clear for now</h3>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-stone">
          You are on track. Momentum will keep watching quietly.
        </p>
      </SpecCard>
    </div>
  );
}
