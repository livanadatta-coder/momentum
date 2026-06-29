# Deploying Momentum

Momentum is a static Vite/React SPA — Firebase Auth, Cloud Firestore, the
Google Calendar API, and the Gemini API are all called directly from the
browser, so there's no backend service to deploy separately. Either deploy
path just needs to serve the built `dist/` output.

Vite env vars (`VITE_*`) are baked into the JS bundle at **build time**, not
read at runtime.

## Services this app depends on

| Service | Used for | Config |
|---|---|---|
| Firebase Auth | Google OAuth sign-in | `VITE_FIREBASE_*` vars |
| Cloud Firestore | Behavioural memory, sessions, execution history, reflections | `VITE_FIREBASE_PROJECT_ID` |
| Google Calendar API | Reading/writing the user's real calendar | Calendar scope requested at sign-in (`src/auth/auth.service.ts`) |
| Gemini API | Risk/Focus/Planner/Recovery/Memory agents | `VITE_GEMINI_API_KEY` |

All required env vars are listed in [.env.example](./.env.example).

---

## Option A — Firebase Hosting (used for the live demo, no billing account needed)

```bash
npm install
npm run build
firebase login
firebase deploy --only hosting
```

Prints a `https://<project-id>.web.app` URL. `*.web.app` and
`*.firebaseapp.com` domains are auto-authorized for Firebase Auth — no
manual step needed. This project's `firebase.json` already has a `hosting`
block (static SPA serve + rewrite-to-`index.html` for client-side routing).

## Option B — Google Cloud Run

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

Build (Cloud Build, no local Docker needed) — pull values from `.env.local`:

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=\
_VITE_FIREBASE_API_KEY="...",\
_VITE_FIREBASE_AUTH_DOMAIN="...",\
_VITE_FIREBASE_PROJECT_ID="...",\
_VITE_FIREBASE_STORAGE_BUCKET="...",\
_VITE_FIREBASE_MESSAGING_SENDER_ID="...",\
_VITE_FIREBASE_APP_ID="...",\
_VITE_FIREBASE_APP_MEASUREMENT_ID="...",\
_VITE_GEMINI_API_KEY="..."
```

Deploy:

```bash
gcloud run deploy momentum \
  --image gcr.io/YOUR_PROJECT_ID/momentum:latest \
  --platform managed \
  --region asia-east1 \
  --allow-unauthenticated \
  --port 8080
```

**Manual step required for this path**: Cloud Run's `*.run.app` domain is
NOT auto-authorized for Firebase Auth. Add it at **Firebase Console →
Authentication → Settings → Authorized domains**.

Note: Cloud Run requires a billing account linked to the GCP project (Cloud
Build/Cloud Run/Artifact Registry are paid APIs, even though usage at this
scale is free-tier). In some regions Google requires a one-time refundable
prepayment before the free trial activates — Firebase Hosting (Option A)
avoids this entirely and is what the submitted live demo uses.

---

## Redeploying after a code change

- Firebase: re-run `npm run build` then `firebase deploy --only hosting`.
- Cloud Run: re-run the build step then the deploy step (same image tag
  overwrites, or bump the tag for a new revision).

## Known limitation (by design, not a deploy bug)

`VITE_GEMINI_API_KEY` ends up in the public JS bundle since there's no
backend to proxy it through — this mirrors the existing architecture
(`calendar.service.ts`'s comments already call out the no-backend choice).
Acceptable for a hackathon submission; restrict the key's API scope in
Google Cloud Console (Gemini API only, HTTP referrer restriction to your
deployed domain) rather than leaving it fully open.
