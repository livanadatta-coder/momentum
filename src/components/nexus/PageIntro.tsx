import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageIntroProps {
  eyebrow: string;
  title: ReactNode;
  description?: string;
  className?: string;
}

export function PageIntro({ eyebrow, title, description, className }: PageIntroProps) {
  return (
    <section className={cn("max-w-3xl", className)}>
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-coral">{eyebrow}</p>
      <h1 className="font-serif text-5xl leading-[1.02] tracking-[-0.035em] text-ink sm:text-6xl lg:text-7xl">
        {title}
      </h1>
      {description ? (
        <p className="mt-6 max-w-2xl text-lg leading-8 text-stone sm:text-xl sm:leading-9">{description}</p>
      ) : null}
    </section>
  );
}
