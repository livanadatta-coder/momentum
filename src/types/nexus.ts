import type { LucideIcon } from "lucide-react";

export type SystemState = "observe" | "predict" | "plan" | "execute" | "recover";
export type RiskLevel = "stable" | "watch" | "critical";

export interface OperatingSignal {
  id: string;
  label: string;
  value: string;
  delta: string;
  state: RiskLevel;
}

export interface Mission {
  id: string;
  title: string;
  context: string;
  deadline: string;
  progress: number;
  risk: RiskLevel;
  nextAction: string;
}

export interface TimelineItem {
  id: string;
  time: string;
  title: string;
  description: string;
  state: SystemState;
}

export interface NavigationItem {
  label: string;
  path: string;
  icon: LucideIcon;
}
