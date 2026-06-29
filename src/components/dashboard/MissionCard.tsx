import { Clock3, MoveRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import type { Mission } from "@/types/nexus";

interface MissionCardProps {
  mission: Mission;
}

export function MissionCard({ mission }: MissionCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">{mission.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{mission.context}</p>
          </div>
          <Badge state={mission.risk}>{mission.risk}</Badge>
        </div>
        <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" />
          {mission.deadline}
        </div>
        <div className="mb-4 h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full bg-primary" style={{ width: `${mission.progress}%` }} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs leading-5 text-muted-foreground">{mission.nextAction}</p>
          <Button size="icon" variant="secondary" aria-label={`Open ${mission.title}`}>
            <MoveRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
