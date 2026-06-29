import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";
import { app } from "@/lib/firebase";
import { sanitizeForFirestore } from "@/services/firestore.service";

export const auth = getAuth(app);
const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
googleProvider.addScope("email");
googleProvider.addScope("profile");
// Calendar scope â€” needed so Nexus can read today's events and write
// AI-generated focus blocks back to the user's real calendar.
googleProvider.addScope("https://www.googleapis.com/auth/calendar.events");

// ── Calendar access token ──────────────────────────────────────────────────
// Firebase Auth's web SDK does not expose a refresh token for security
// reasons, so this access token only lives for the current browser
// session and expires after ~1 hour (Google's standard OAuth token life).
// When it expires, the simplest correct fix at this stage is asking the
// user to sign in again (handled by isCalendarTokenValid() below) —
// a silent background-refresh flow would need a server component, which
// is explicitly "later" on the project's own roadmap (Cloud Functions).
let calendarAccessToken: string | null = null;
let calendarTokenExpiresAt: number | null = null;

function storeCalendarToken(token: string | null) {
  calendarAccessToken = token;
  calendarTokenExpiresAt = token ? Date.now() + 55 * 60 * 1000 : null; // refresh 5min early
}

/** The current Calendar OAuth access token, or null if absent/expired. */
export function getCalendarAccessToken(): string | null {
  if (!calendarAccessToken || !calendarTokenExpiresAt) return null;
  if (Date.now() >= calendarTokenExpiresAt) return null;
  return calendarAccessToken;
}

export function hasCalendarAccess(): boolean {
  return getCalendarAccessToken() !== null;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  providerId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  lastLoginAt?: unknown;
}

export async function signInWithGoogle(): Promise<User> {
  await setPersistence(auth, browserLocalPersistence);
  const result = await signInWithPopup(auth, googleProvider);

  const credential = GoogleAuthProvider.credentialFromResult(result);
  storeCalendarToken(credential?.accessToken ?? null);

  await ensureUserProfile(result.user);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  storeCalendarToken(null);
  await signOut(auth);
}

export async function ensureUserProfile(user: User): Promise<void> {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const timestamp = serverTimestamp();

  const profile: UserProfile = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    emailVerified: user.emailVerified,
    providerId: user.providerData[0]?.providerId ?? "google.com",
    updatedAt: timestamp,
    lastLoginAt: timestamp,
  };

  await setDoc(
    ref,
    sanitizeForFirestore(snap.exists() ? profile : { ...profile, createdAt: timestamp }),
    { merge: true },
  );
}


