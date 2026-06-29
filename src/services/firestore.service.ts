// ============================================================================
// Nexus OS — Firestore Service
// Persists BehavioralMemory and OrchestratorOutput.
// Everything else (missions, calendar) stays in mock-data until you're ready
// to migrate. Swap one collection at a time.
// ============================================================================

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  orderBy,
  limit as fsLimit,
  getDocs,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { app } from "@/lib/firebase"; // your existing Firebase app init
import type { BehavioralMemory, OrchestratorOutput, ExecutionRecord } from "@/types/domain";
import { defaultMemory } from "@/ai/memory/memory.engine";
import { nowISO } from "@/lib/utils";

const db = getFirestore(app);

// ── Demo Workspace persistence ──────────────────────────────────────────────
// Demo Workspace is a first-class data source, not a hack: every persistence
// function below takes the SAME userId parameter Google-mode callers use.
// When that userId is the fixed demo id, read/write a localStorage mirror
// instead of Firestore — every caller (useNexus, useExecutionTracking,
// ReflectionPage) is unmodified and has no idea which backend it's hitting.
// This is the ONLY place demo-vs-live branches; the planner, risk engine,
// execution tracking, and behavioral learning code never check this.
export const DEMO_USER_ID = "demo-workspace";

export function isDemoUser(userId: string): boolean {
  return userId === DEMO_USER_ID;
}

const DEMO_LS_PREFIX = "momentum_demo:";

function demoKey(...parts: string[]): string {
  return DEMO_LS_PREFIX + parts.join(":");
}

function lsGetJSON<T>(key: string): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function lsSetJSON(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

/** Wipes every piece of demo-mode local state — used when re-seeding or
 *  letting a judge reset the workspace back to its original story. */
export function resetDemoWorkspaceStorage(): void {
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(DEMO_LS_PREFIX)) toRemove.push(key);
  }
  toRemove.forEach(k => localStorage.removeItem(k));
}

type FirestoreSerializable =
  | string
  | number
  | boolean
  | null
  | Date
  | Timestamp
  | FirestoreSerializable[]
  | { [key: string]: FirestoreSerializable | unknown };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

export function sanitizeForFirestore<T>(value: T): T {
  if (value === undefined) return null as T;

  if (Array.isArray(value)) {
    return value.map(item => sanitizeForFirestore(item)) as T;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const sanitized: Record<string, FirestoreSerializable | unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue;
    sanitized[key] = sanitizeForFirestore(entry);
  }

  return sanitized as T;
}

// ── Collection paths ────────────────────────────────────────────────────────
//   users/{uid}/memory          — BehavioralMemory document
//   users/{uid}/sessions/{sid}  — OrchestratorOutput per run

// ── BehavioralMemory ────────────────────────────────────────────────────────

export async function loadMemory(userId: string): Promise<BehavioralMemory> {
  if (isDemoUser(userId)) {
    const existing = lsGetJSON<BehavioralMemory>(demoKey("memory"));
    if (existing) return existing;
    const fresh = { ...defaultMemory(userId), userId };
    lsSetJSON(demoKey("memory"), fresh);
    return fresh;
  }

  const ref = doc(db, "users", userId, "memory", "profile");
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    // First visit — seed with defaults and write to Firestore
    const fresh = { ...defaultMemory(userId), userId };
    await setDoc(ref, sanitizeForFirestore({ ...fresh, _createdAt: serverTimestamp() }));
    return fresh;
  }

  const data = snap.data() as BehavioralMemory & { _createdAt?: Timestamp };
  // Strip Firestore internals before returning
  const { _createdAt, ...memory } = data;
  void _createdAt;
  return { ...memory, userId };
}

export async function saveMemory(memory: BehavioralMemory): Promise<void> {
  if (isDemoUser(memory.userId)) {
    lsSetJSON(demoKey("memory"), { ...memory, updatedAt: nowISO() });
    return;
  }

  const ref = doc(db, "users", memory.userId, "memory", "profile");
  await setDoc(
    ref,
    sanitizeForFirestore({ ...memory, _updatedAt: serverTimestamp() }),
    { merge: true },
  );
}

export async function updateMemoryField(
  userId: string,
  fields: Partial<BehavioralMemory>
): Promise<void> {
  if (isDemoUser(userId)) {
    const current = lsGetJSON<BehavioralMemory>(demoKey("memory")) ?? { ...defaultMemory(userId), userId };
    lsSetJSON(demoKey("memory"), { ...current, ...fields, updatedAt: nowISO() });
    return;
  }

  const ref = doc(db, "users", userId, "memory", "profile");
  await updateDoc(
    ref,
    sanitizeForFirestore({ ...fields, updatedAt: nowISO(), _updatedAt: serverTimestamp() }),
  );
}

// ── OrchestratorOutput (session history) ────────────────────────────────────

export async function saveSession(
  userId: string,
  output: OrchestratorOutput
): Promise<string> {
  if (isDemoUser(userId)) {
    const id = `demo-session-${Date.now()}`;
    const sessions = lsGetJSON<Record<string, OrchestratorOutput>>(demoKey("sessions")) ?? {};
    sessions[id] = output;
    lsSetJSON(demoKey("sessions"), sessions);
    return id;
  }

  const col = collection(db, "users", userId, "sessions");
  const ref = await addDoc(col, sanitizeForFirestore({
    ...output,
    _savedAt: serverTimestamp(),
  }));
  return ref.id;
}

export async function loadLatestSession(
  userId: string
): Promise<OrchestratorOutput | null> {
  if (isDemoUser(userId)) {
    const latestId = lsGetJSON<string>(demoKey("latestSessionId"));
    if (!latestId) return null;
    const sessions = lsGetJSON<Record<string, OrchestratorOutput>>(demoKey("sessions")) ?? {};
    return sessions[latestId] ?? null;
  }

  // Firestore doesn't support orderBy + limit(1) without a composite index,
  // so we store the latest session id on the memory doc for fast lookup.
  const memRef = doc(db, "users", userId, "memory", "profile");
  const memSnap = await getDoc(memRef);
  if (!memSnap.exists()) return null;

  const latestSessionId = memSnap.data()?._latestSessionId as string | undefined;
  if (!latestSessionId) return null;

  const sessionRef = doc(db, "users", userId, "sessions", latestSessionId);
  const sessionSnap = await getDoc(sessionRef);
  if (!sessionSnap.exists()) return null;

  const { _savedAt, ...output } = sessionSnap.data() as OrchestratorOutput & {
    _savedAt?: Timestamp;
  };
  void _savedAt;
  return output;
}

export async function markLatestSession(
  userId: string,
  sessionId: string
): Promise<void> {
  if (isDemoUser(userId)) {
    lsSetJSON(demoKey("latestSessionId"), sessionId);
    return;
  }

  const ref = doc(db, "users", userId, "memory", "profile");
  await updateDoc(ref, sanitizeForFirestore({ _latestSessionId: sessionId }));
}

// ── Daily cache (users/{uid}/daily/{YYYY-MM-DD}) ─────────────────────────────
// One document per user per calendar day.  setDoc is idempotent — safe to call
// on every fresh Gemini run.  loadTodaySession is a single getDoc, no index needed.

function todayDateKey(): string {
  // Use local date so cache aligns with the user's calendar day.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function saveTodaySession(
  userId: string,
  output: OrchestratorOutput
): Promise<void> {
  if (isDemoUser(userId)) {
    lsSetJSON(demoKey("daily", todayDateKey()), { ...output, fromCache: false, cachedAt: nowISO() });
    return;
  }

  const dateKey = todayDateKey();
  const ref = doc(db, "users", userId, "daily", dateKey);
  await setDoc(
    ref,
    sanitizeForFirestore({
      ...output,
      fromCache: false,          // written as "live" — consumer flips on read
      cachedAt: nowISO(),
      _savedAt: serverTimestamp(),
    }),
  );
}

export async function loadTodaySession(
  userId: string
): Promise<OrchestratorOutput | null> {
  if (isDemoUser(userId)) {
    const cached = lsGetJSON<OrchestratorOutput>(demoKey("daily", todayDateKey()));
    return cached ? { ...cached, fromCache: true } : null;
  }

  const dateKey = todayDateKey();
  console.log(`[Momentum] 6. Firestore path queried: users/${userId}/daily/${dateKey}`);
  const ref = doc(db, "users", userId, "daily", dateKey);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const { _savedAt, ...output } = snap.data() as OrchestratorOutput & {
    _savedAt?: Timestamp;
    cachedAt?: string;
  };
  void _savedAt;

  // Mark as cache hit so the UI can show the badge
  return { ...output, fromCache: true };
}


export async function loadUserProfile(userId: string) {
  if (isDemoUser(userId)) {
    return lsGetJSON<Record<string, unknown>>(demoKey("profile"));
  }
  const ref = doc(db, "users", userId);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

// ── Reflections (users/{uid}/reflections/{YYYY-MM-DD}) ──────────────────────
// One plain-text reflection per user per calendar day.

export async function saveReflection(
  userId: string,
  date: string,   // YYYY-MM-DD
  text: string,
): Promise<void> {
  if (isDemoUser(userId)) {
    const all = lsGetJSON<Record<string, string>>(demoKey("reflections")) ?? {};
    all[date] = text;
    lsSetJSON(demoKey("reflections"), all);
    return;
  }

  const ref = doc(db, "users", userId, "reflections", date);
  await setDoc(
    ref,
    sanitizeForFirestore({ text, savedAt: nowISO(), _savedAt: serverTimestamp() }),
    { merge: true },
  );
}

export async function loadReflection(
  userId: string,
  date: string,   // YYYY-MM-DD
): Promise<string | null> {
  if (isDemoUser(userId)) {
    const all = lsGetJSON<Record<string, string>>(demoKey("reflections")) ?? {};
    return all[date] ?? null;
  }

  const ref  = doc(db, "users", userId, "reflections", date);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return (snap.data() as { text?: string }).text ?? null;
}

// ── Execution History (users/{uid}/executionHistory/{id}) ───────────────────
// Append-only — every lifecycle transition (start, pause, complete, skip,
// expired-prompt answer) writes a NEW document. Never updates/overwrites a
// previous record. This is Momentum's permanent historical dataset; current
// state for "what is task X doing right now" is derived client-side by
// taking the most recent record per taskId, not by mutating one doc.

export async function appendExecutionRecord(
  userId: string,
  record: Omit<ExecutionRecord, "id">,
): Promise<string> {
  if (isDemoUser(userId)) {
    const all = lsGetJSON<ExecutionRecord[]>(demoKey("executionHistory")) ?? [];
    const id = `demo-rec-${Date.now()}-${all.length}`;
    all.push({ ...record, id });
    lsSetJSON(demoKey("executionHistory"), all);
    return id;
  }

  const col = collection(db, "users", userId, "executionHistory");
  const ref = await addDoc(col, sanitizeForFirestore({ ...record, _savedAt: serverTimestamp() }));
  return ref.id;
}

/** Most recent N records, newest first — enough to derive both "current
 *  state per task" and behavioral-memory aggregates without a composite
 *  index (single-field orderBy only). */
export async function loadExecutionHistory(
  userId: string,
  limitCount = 500,
): Promise<ExecutionRecord[]> {
  if (isDemoUser(userId)) {
    const all = lsGetJSON<ExecutionRecord[]>(demoKey("executionHistory")) ?? [];
    return [...all]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limitCount);
  }

  const col = collection(db, "users", userId, "executionHistory");
  const q = query(col, orderBy("timestamp", "desc"), fsLimit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const { _savedAt, ...data } = d.data() as ExecutionRecord & { _savedAt?: Timestamp };
    void _savedAt;
    return { ...data, id: d.id };
  });
}

export async function verifyUserPersistence(userId: string): Promise<{
  profile: boolean;
  memory: boolean;
  latestSession: boolean;
}> {
  const [profile, memory, latestSession] = await Promise.all([
    loadUserProfile(userId),
    loadMemory(userId),
    loadLatestSession(userId),
  ]);

  return {
    profile: Boolean(profile),
    memory: Boolean(memory),
    latestSession: Boolean(latestSession),
  };
}
