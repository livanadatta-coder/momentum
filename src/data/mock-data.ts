// ============================================================================
// Nexus OS — Mock Data
// Realistic enough that Gemini produces meaningful agent output.
// Swap individual exports for Firestore queries as you build each layer.
// experienceSteps stays here — it's UI-only, not domain data.
// ============================================================================

import {
  Brain,
  Calendar,
  Eye,
  RefreshCcw,
  Zap,
} from "lucide-react";
import type { Mission, CalendarEvent, BehavioralMemory } from "@/types/domain";

// ── Helper ─────────────────────────────────────────────────────────────────

function daysFromNow(days: number, hour = 23, minute = 59): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function todayAt(hour: number, minute = 0): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

// ── Missions ───────────────────────────────────────────────────────────────
// Intentionally varied: mix of urgent, comfortable, and overdue.
// This gives Risk Engine something real to flag and Planner something to schedule.

export const missions: Mission[] = [
  {
    id: "m1",
    title: "Finalize Momentum AI orchestration layer",
    description:
      "Complete the agent pipeline, wire Gemini integration, test end-to-end with mock data, and prepare the demo script.",
    deadline: daysFromNow(1, 20, 0), // tomorrow evening — tight
    priority: "critical",
    status: "in_progress",
    estimatedMinutes: 180,
    category: "work",
    dependencies: [],
    tags: ["hackathon", "AI", "demo"],
    createdAt: daysFromNow(-2),
    updatedAt: daysFromNow(-1),
  },
  {
    id: "m2",
    title: "Write project submission document",
    description:
      "Google Doc with problem statement, solution overview, key features, technologies used, and Google technologies section.",
    deadline: daysFromNow(2, 14, 0), // submission deadline
    priority: "critical",
    status: "not_started",
    estimatedMinutes: 90,
    category: "work",
    dependencies: ["m1"],
    tags: ["hackathon", "submission"],
    createdAt: daysFromNow(-1),
    updatedAt: daysFromNow(-1),
  },
  {
    id: "m3",
    title: "Deploy to Google Cloud Run",
    description:
      "Containerize the application, push to Artifact Registry, deploy to Cloud Run, verify public URL is stable.",
    deadline: daysFromNow(2, 12, 0),
    priority: "high",
    status: "not_started",
    estimatedMinutes: 120,
    category: "work",
    dependencies: ["m1"],
    tags: ["hackathon", "deployment", "google-cloud"],
    createdAt: daysFromNow(-1),
    updatedAt: daysFromNow(-1),
  },
  {
    id: "m4",
    title: "Record demo walkthrough video",
    description:
      "Screen record a 3-minute demo showing app open → AI thinking → Today's Execution Brief → risk signals → calendar integration.",
    deadline: daysFromNow(2, 13, 0),
    priority: "high",
    status: "not_started",
    estimatedMinutes: 45,
    category: "work",
    dependencies: ["m1", "m3"],
    tags: ["hackathon", "demo"],
    createdAt: daysFromNow(-1),
    updatedAt: daysFromNow(-1),
  },
  {
    id: "m5",
    title: "Firestore persistence layer",
    description:
      "Wire BehavioralMemory and OrchestratorOutput to Firestore so state persists across sessions.",
    deadline: daysFromNow(1, 18, 0),
    priority: "medium",
    status: "not_started",
    estimatedMinutes: 90,
    category: "work",
    dependencies: ["m1"],
    tags: ["firestore", "persistence"],
    createdAt: daysFromNow(0),
    updatedAt: daysFromNow(0),
  },
];

// ── Calendar Events ─────────────────────────────────────────────────────────
// Mix of real commitments and Momentum-protected blocks.

export const calendarEvents: CalendarEvent[] = [
  {
    id: "ce1",
    title: "Mentor session — Vibe2Ship",
    start: todayAt(16),
    end: todayAt(18),
    isBlocked: false,
    source: "manual",
  },
  {
    id: "ce2",
    title: "🎯 Momentum • Deep Work: AI orchestration",
    start: todayAt(9),
    end: todayAt(11, 30),
    isBlocked: true,
    source: "nexus",
    missionId: "m1",
  },
  {
    id: "ce3",
    title: "Sleep / off hours",
    start: todayAt(23),
    end: daysFromNow(1, 7, 0),
    isBlocked: true,
    source: "manual",
  },
  {
    id: "ce4",
    title: "🎯 Focus: Cloud Run deployment",
    start: daysFromNow(1, 9, 0),
    end: daysFromNow(1, 11, 0),
    isBlocked: true,
    source: "nexus",
    missionId: "m3",
  },
];

// ── Behavioral Memory ───────────────────────────────────────────────────────
// Seeded with realistic student/hackathon-builder patterns.
// This gets Firestore-persisted and updated by MemoryEngine over time.

export const seedMemory: BehavioralMemory = {
  userId: "", // filled at runtime with real Firebase uid
  updatedAt: new Date().toISOString(),
  preferredWorkHours: [
    { start: "09:00", end: "13:00" },
    { start: "16:00", end: "20:00" },
  ],
  averageSessionMinutes: 50,
  peakProductivityHour: 10,
  estimationBias: 1.35,        // underestimates by 35% (typical for builders)
  procrastinationPatterns: [
    { category: "documentation", note: "Documentation sessions have historically overrun — they're usually deferred to the last possible moment." },
    { category: "deployment", note: "Deployment steps tend to start later than planned." },
  ],
  burnoutIndicators: [],
  schedulingHabits: [
    { category: "execution", note: "Most productive coding work happens before 1 PM." },
    "Tends to over-commit on final day before deadlines",
  ],
  missedDeadlineRate: 0.1,
  onTimeCompletionRate: 0.82,
};

// ── UI-only data (not domain) ───────────────────────────────────────────────

export const experienceSteps = [
  { label: "Observe your workload and deadlines", icon: Eye },
  { label: "Predict risks before they happen", icon: Brain },
  { label: "Plan your execution schedule", icon: Calendar },
  { label: "Execute with protected focus time", icon: Zap },
  { label: "Recover automatically when plans break", icon: RefreshCcw },
];

// ── UI mock data re-exports ─────────────────────────────────────────────────
// Pages import from "@/data/mock-data" — this keeps all those paths working
// without changing any page file. The actual data lives in ui-mock-data.ts.
export {
  navigationItems,
  timeline,
  calendarBlocks,
  designPrinciples,
  systemModules,
  whyChanges,
} from "./ui-mock-data";

export type {
  NavItem,
  TimelineItem,
  CalendarBlock,
  DesignPrinciple,
  SystemModule,
  WhyChange,
} from "./ui-mock-data";
