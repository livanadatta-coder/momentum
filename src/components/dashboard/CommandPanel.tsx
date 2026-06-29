import { CalendarPlus, ListChecks, RotateCcw, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";

const actions = [
  { label: "Compress scope", icon: ListChecks },
  { label: "Protect focus block", icon: CalendarPlus },
  { label: "Replan timeline", icon: RotateCcw },
];

export function CommandPanel() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Chief of Staff Briefing</h2>
            <p className="text-sm text-muted-foreground">Your system is stable, but the deployment path is under-protected.</p>
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 p-4">
          <p className="text-sm leading-6 text-muted-foreground">
            Momentum recommends finishing the product shell before adding integrations. This keeps the demo premium while reserving backend work for clear, high-impact moments.
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {actions.map((action) => (
            <Button key={action.label} variant="secondary">
              <action.icon className="h-4 w-4" />
              {action.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
