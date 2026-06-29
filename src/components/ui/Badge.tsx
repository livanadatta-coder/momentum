import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/types/nexus";

const tone: Record<RiskLevel, string> = {
  stable: "border-[#cdddc7] bg-[#eef5eb] text-[#4f7045]",
  watch: "border-[#ead8ad] bg-[#fff5de] text-[#9a6b1f]",
  critical: "border-[#efc8bd] bg-[#fff0ec] text-[#a94e3a]",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  state?: RiskLevel;
}

export function Badge({ className, state = "stable", ...props }: BadgeProps) {
  return (
    <span
      className={cn("inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium", tone[state], className)}
      {...props}
    />
  );
}
