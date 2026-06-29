import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  auth,
  ensureUserProfile,
  hasCalendarAccess,
  signInWithGoogle,
  signOutUser,
} from "@/auth/auth.service";
import { seedDemoWorkspaceIfNeeded } from "@/data/demo-workspace";

const DEMO_MODE_STORAGE_KEY = "momentum_demo_mode_active";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
  /** True once a Calendar-scoped access token is held in memory for this session. */
  hasCalendarAccess: boolean;
  /** Demo Workspace — a first-class, no-OAuth data source. Not a fake
   *  Firebase User: callers that need to know "who is the current actor"
   *  check `isDemoMode` alongside `user`, the same way they'd check
   *  `calendarSource` today. */
  isDemoMode: boolean;
  enterDemoMode: () => Promise<void>;
  exitDemoMode: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Re-checked after sign-in/out since the token lives outside React state
  // (see auth.service.ts) â€” this just lets components re-render on change.
  const [calendarReady, setCalendarReady] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(
    () => localStorage.getItem(DEMO_MODE_STORAGE_KEY) === "true",
  );

  const enterDemoMode = useCallback(async () => {
    await seedDemoWorkspaceIfNeeded();
    localStorage.setItem(DEMO_MODE_STORAGE_KEY, "true");
    setIsDemoMode(true);
  }, []);

  const exitDemoMode = useCallback(() => {
    localStorage.removeItem(DEMO_MODE_STORAGE_KEY);
    setIsDemoMode(false);
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, async (nextUser) => {
      setLoading(true);
      setError(null);

      try {
        if (nextUser) {
          await ensureUserProfile(nextUser);
        } else {
          setCalendarReady(false);
        }
        setUser(nextUser);
      } catch (err) {
        setUser(nextUser);
        setError(`Profile persistence failed: ${getErrorMessage(err)}`);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const signIn = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      setCalendarReady(hasCalendarAccess());
      // Switching to live Google Calendar always clears Demo Workspace —
      // "connect Google" and "Demo Workspace" are mutually exclusive data
      // providers, never layered.
      localStorage.removeItem(DEMO_MODE_STORAGE_KEY);
      setIsDemoMode(false);
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        setLoading(false);
        return;
      }
      setError(getErrorMessage(err));
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await signOutUser();
      setCalendarReady(false);
    } catch (err) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user, loading, error, signIn, signOut, clearError,
      hasCalendarAccess: calendarReady,
      isDemoMode, enterDemoMode, exitDemoMode,
    }),
    [user, loading, error, signIn, signOut, clearError, calendarReady, isDemoMode, enterDemoMode, exitDemoMode],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
}


