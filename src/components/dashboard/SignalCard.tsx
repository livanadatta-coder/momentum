import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import type { OperatingSignal } from "@/types/nexus";

interface SignalCardProps {
  signal: OperatingSignal;
}

export function SignalCard({ signal }: SignalCardProps) {
  const positive = signal.state === "stable";

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">{signal.label}</p>
          <Badge state={signal.state}>{signal.state}</Badge>
        </div>
        <div className="flex items-end justify-between gap-3">
          <p className="text-2xl font-semibold">{signal.value}</p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {positive ? <ArrowDownRight className="h-3.5 w-3.5 text-emerald-300" /> : <ArrowUpRight className="h-3.5 w-3.5 text-amber-200" />}
            {signal.delta}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
