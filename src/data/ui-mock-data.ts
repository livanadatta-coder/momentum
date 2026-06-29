// ============================================================================
// Nexus OS â€” UI Mock Data
// Field names match exactly what each component accesses.
// ============================================================================

import {
  LayoutDashboard,
  Calendar,
  RefreshCcw,
  Settings,
  HelpCircle,
  Brain,
  Eye,
  Zap,
  Shield,
  Database,
  Sun,
  BookOpen,
  type LucideIcon,
} from "lucide-react";

// â”€â”€ Navigation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Sidebar.tsx and MobileNav.tsx access: item.path, item.label, item.icon
// Fixed: /systems was redirecting to /calendar â€” now points directly
// Fixed: /day and /reflection were unreachable â€” added to nav

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export const navigationItems: NavItem[] = [
  { label: "Dashboard",  path: "/dashboard",  icon: LayoutDashboard },
  { label: "Day",        path: "/day",         icon: Sun             },
  { label: "Calendar",   path: "/calendar",    icon: Calendar        },
  { label: "Recovery",   path: "/recovery",    icon: RefreshCcw      },
  { label: "Why",        path: "/why",         icon: HelpCircle      },
  { label: "Reflection", path: "/reflection",  icon: BookOpen        },
  { label: "Settings",   path: "/settings",    icon: Settings        },
];

// â”€â”€ Timeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// OperatingTimeline.tsx accesses: item.id, item.time, item.title, item.description
// DayTimeline.tsx accesses:       item.id, item.time, item.title, item.description

export interface TimelineItem {
  id: string;
  time: string;
  title: string;
  description: string;
  type: "focus" | "meeting" | "break" | "buffer" | "task";
  duration: string;
  protected: boolean;
  missionId?: string;
  /** Current execution lifecycle state — only set for real (focus) tasks. */
  executionState?: "not_started" | "in_progress" | "paused" | "completed" |
    "partially_completed" | "skipped" | "cancelled";
}

export const timeline: TimelineItem[] = [
  {
    id: "tl1",
    time: "9:00 AM",
    title: "Deep work â€” Momentum AI orchestration",
    description: "Peak productivity window. Protected by Momentum.",
    type: "focus",
    duration: "2h 30m",
    protected: true,
    missionId: "m1",
  },
  {
    id: "tl2",
    time: "11:30 AM",
    title: "Break",
    description: "Scheduled recovery time.",
    type: "break",
    duration: "30m",
    protected: false,
  },
  {
    id: "tl3",
    time: "12:00 PM",
    title: "Write submission document",
    description: "Depends on AI orchestration layer being complete.",
    type: "task",
    duration: "1h 30m",
    protected: true,
    missionId: "m2",
  },
  {
    id: "tl4",
    time: "1:30 PM",
    title: "Lunch / recovery buffer",
    description: "Momentum added buffer to absorb overruns.",
    type: "buffer",
    duration: "1h",
    protected: false,
  },
  {
    id: "tl5",
    time: "2:30 PM",
    title: "Cloud Run deployment",
    description: "Containerize and deploy to Google Cloud Run.",
    type: "focus",
    duration: "2h",
    protected: true,
    missionId: "m3",
  },
  {
    id: "tl6",
    time: "4:00 PM",
    title: "Mentor session â€” Vibe2Ship",
    description: "Cannot be moved. Registered event.",
    type: "meeting",
    duration: "2h",
    protected: false,
  },
  {
    id: "tl7",
    time: "6:00 PM",
    title: "Demo recording",
    description: "Record 3-minute walkthrough after deployment is stable.",
    type: "task",
    duration: "45m",
    protected: true,
    missionId: "m4",
  },
];

// â”€â”€ Calendar Blocks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// CalendarPage.tsx accesses: block.title, block.time, block.tone, block.detail

export interface CalendarBlock {
  id: string;
  title: string;
  time: string;
  tone: string;
  detail: string;
  date: string;
  type: "focus" | "meeting" | "break" | "deadline" | "buffer";
  protected: boolean;
  missionId?: string;
}

function dateStr(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
}

export const calendarBlocks: CalendarBlock[] = [
  {
    id: "cb1",
    title: "Focus: Momentum AI layer",
    time: "9:00 AM",
    tone: "cream",
    detail: "Peak focus window protected by Momentum.",
    date: dateStr(0),
    type: "focus",
    protected: true,
    missionId: "m1",
  },
  {
    id: "cb2",
    title: "Mentor session",
    time: "4:00 PM",
    tone: "sky",
    detail: "Vibe2Ship mentor walkthrough.",
    date: dateStr(0),
    type: "meeting",
    protected: false,
  },
  {
    id: "cb3",
    title: "Focus: Cloud Run deploy",
    time: "9:00 AM",
    tone: "cream",
    detail: "Containerize and deploy to Google Cloud Run.",
    date: dateStr(1),
    type: "focus",
    protected: true,
    missionId: "m3",
  },
  {
    id: "cb4",
    title: "Submission deadline",
    time: "2:00 PM",
    tone: "lilac",
    detail: "Vibe2Ship final submission â€” hard cutoff.",
    date: dateStr(2),
    type: "deadline",
    protected: false,
  },
  {
    id: "cb5",
    title: "Demo recording",
    time: "6:00 PM",
    tone: "sage",
    detail: "Record 3-minute walkthrough after deployment is stable.",
    date: dateStr(1),
    type: "focus",
    protected: true,
    missionId: "m4",
  },
  {
    id: "cb6",
    title: "Recovery buffer",
    time: "1:00 PM",
    tone: "sage",
    detail: "Momentum added this buffer to absorb overruns.",
    date: dateStr(1),
    type: "buffer",
    protected: false,
  },
];

// â”€â”€ Design Principles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SettingsPage.tsx accesses: principle.label, principle.icon, principle.body

export interface DesignPrinciple {
  id: string;
  label: string;
  icon: LucideIcon;
  body: string;
}

export const designPrinciples: DesignPrinciple[] = [
  {
    id: "dp1",
    label: "Proactive, not reactive",
    icon: Eye,
    body: "Momentum acts before problems occur. The user reviews decisions rather than making them from scratch.",
  },
  {
    id: "dp2",
    label: "Calm, not overwhelming",
    icon: Shield,
    body: "Information is surfaced only when it matters. The interface never competes for attention.",
  },
  {
    id: "dp3",
    label: "Explainable, not mysterious",
    icon: Brain,
    body: "Every AI decision includes a clear, concise reason. The user always understands why Momentum acted.",
  },
  {
    id: "dp4",
    label: "Behavioral, not generic",
    icon: Database,
    body: "Recommendations are based on this user's patterns â€” not averages. The Memory Engine personalises every output.",
  },
  {
    id: "dp5",
    label: "Human, not robotic",
    icon: HelpCircle,
    body: "Language is written like a calm, competent Chief of Staff â€” never a chatbot or a passive notification.",
  },
];

// â”€â”€ System Modules â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SettingsPage.tsx and SystemsPage.tsx access: module.label, module.icon, module.status, module.description

export interface SystemModule {
  id: string;
  label: string;
  icon: LucideIcon;
  status: string;
  description: string;
  agentName?: string;
}

export const systemModules: SystemModule[] = [
  {
    id: "sm1",
    label: "AI Orchestrator",
    icon: Brain,
    status: "Active",
    description: "Coordinates all agents. Decides which agents run and in what order.",
    agentName: "Orchestrator",
  },
  {
    id: "sm2",
    label: "Planner Agent",
    icon: Calendar,
    status: "Active",
    description: "Converts goals and deadlines into a realistic execution plan, accounting for estimation bias.",
    agentName: "PlannerAgent",
  },
  {
    id: "sm3",
    label: "Risk Engine",
    icon: Eye,
    status: "Active",
    description: "Predicts missed deadlines before they happen. Runs in parallel with the Focus Engine.",
    agentName: "RiskEngine",
  },
  {
    id: "sm4",
    label: "Focus Engine",
    icon: Zap,
    status: "Active",
    description: "Identifies peak productivity windows and protects them automatically in the calendar.",
    agentName: "FocusEngine",
  },
  {
    id: "sm5",
    label: "Recovery Agent",
    icon: RefreshCcw,
    status: "Active",
    description: "Triggered when risk reaches danger or critical. Rebuilds the schedule to minimise stress.",
    agentName: "RecoveryAgent",
  },
  {
    id: "sm6",
    label: "Memory Engine",
    icon: Database,
    status: "Active",
    description: "Builds a behavioral twin over time: estimation bias, peak hours, procrastination patterns.",
    agentName: "MemoryEngine",
  },
  {
    id: "sm7",
    label: "Firestore Persistence",
    icon: Database,
    status: "Active",
    description: "Persists BehavioralMemory, OrchestratorOutput, and daily reflections across sessions.",
  },
  {
    id: "sm8",
    label: "Google Calendar Integration",
    icon: Calendar,
    status: "Active",
    description: "Writes Momentum-protected focus blocks directly to the user's calendar via the Calendar API.",
  },
  {
    id: "sm9",
    label: "Firebase Authentication",
    icon: Shield,
    status: "Active",
    description: "Handles Google OAuth. Access tokens used for Calendar API write access.",
  },
];

// â”€â”€ Why Changes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// WhyPage.tsx accesses: change.title, change.body

export interface WhyChange {
  id: string;
  timestamp: string;
  title: string;
  body: string;
  agent: string;
  impact: "high" | "medium" | "low";
  reversible: boolean;
}

export const whyChanges: WhyChange[] = [
  {
    id: "wc1",
    timestamp: "Today, 8:47 AM",
    title: "Protected morning focus block",
    body: "Your deadline for the AI orchestration layer is tomorrow evening. Momentum identified this as the highest-risk mission and reserved your peak productivity window before it could be overwritten.",
    agent: "FocusEngine",
    impact: "high",
    reversible: true,
  },
  {
    id: "wc2",
    timestamp: "Today, 8:47 AM",
    title: "Flagged submission document as at-risk",
    body: "The submission document depends on the orchestration layer being complete, but has a hard deadline of 2:00 PM on Day 3. With your estimation bias of 1.35x, there is insufficient buffer without intervention.",
    agent: "RiskEngine",
    impact: "high",
    reversible: false,
  },
  {
    id: "wc3",
    timestamp: "Today, 8:48 AM",
    title: "Added recovery buffer at 1:30 PM",
    body: "Based on your scheduling history, deployment tasks typically run 40% longer than estimated. A 1-hour buffer was inserted after the submission writing block to absorb overruns without cascading into the mentor session.",
    agent: "RecoveryAgent",
    impact: "medium",
    reversible: true,
  },
  {
    id: "wc4",
    timestamp: "Today, 8:48 AM",
    title: "Scheduled demo recording after mentor session",
    body: "The demo recording depends on the deployment being live. Momentum scheduled it after the mentor session to ensure the Cloud Run URL is stable before recording.",
    agent: "PlannerAgent",
    impact: "medium",
    reversible: true,
  },
  {
    id: "wc5",
    timestamp: "Yesterday, 11:30 PM",
    title: "Updated estimation bias to 1.35x",
    body: "Analysis of your last 3 completed tasks shows actual time exceeded estimates by an average of 35%. Momentum updated your behavioral profile to apply this correction factor to all future planning.",
    agent: "MemoryEngine",
    impact: "medium",
    reversible: false,
  },
];


