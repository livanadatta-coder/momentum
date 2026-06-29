import { Card, CardContent } from "@/components/ui/Card";
import { systemModules } from "@/data/mock-data";

export function SystemsPage() {
  return (
    <div className="space-y-12 pb-12">
      <section className="max-w-4xl pt-4 sm:pt-8">
        <p className="mb-4 text-sm font-medium text-[#7f9eb8]">Calendar</p>
        <h1 className="text-5xl font-semibold leading-[1.04] tracking-[-0.035em] sm:text-6xl">
          A quiet map of the day, designed around attention.
        </h1>
        <p className="mt-7 max-w-2xl text-xl leading-9 tracking-[-0.01em] text-[#5f584f]">
          These surfaces are still mock-only, but they show where calendar, preferences, reflection, and companion context will live.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {systemModules.map((module) => (
          <Card key={module.label} className="bg-white/82">
            <CardContent className="flex gap-5 p-6">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#eef4fa] text-[#6e94b5]">
                <module.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-[-0.015em]">{module.label}</h2>
                  <span className="rounded-md border border-[#e7ded2] bg-[#fbfaf7] px-2 py-1 text-xs text-muted-foreground">
                    {module.status}
                  </span>
                </div>
                <p className="text-sm leading-7 text-muted-foreground">{module.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
