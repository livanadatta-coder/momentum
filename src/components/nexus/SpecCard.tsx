import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function SpecCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[18px] border border-line bg-white/82 shadow-[0_18px_50px_rgba(59,43,28,0.06)]",
        className,
      )}
      {...props}
    />
  );
}
