import { CircleDot } from "lucide-react";
import { timeline } from "@/data/mock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

export function OperatingTimeline() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Operating Loop</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          {timeline.map((item) => (
            <div key={item.id} className="grid grid-cols-[72px_1fr] gap-4">
              <p className="pt-0.5 text-xs text-muted-foreground">{item.time}</p>
              <div className="relative pb-5 last:pb-0">
                <div className="absolute left-[7px] top-6 h-full w-px bg-white/10 last:hidden" />
                <div className="flex gap-3">
                  <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
