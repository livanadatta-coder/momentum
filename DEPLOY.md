# Deploying Momentum to Google Cloud Run

Momentum is a static Vite/React SPA — Firebase Auth/Firestore and the Gemini
API are called directly from the browser, so there's no backend service to
deploy separately. Cloud Run just needs to serve the built `dist/` output.

Vite env vars (`VITE_*`) are baked into the JS bundle at **build time**, not
read at runtime — so they must be passed in as build args, not as Cloud Run
environment variables on the running service.

## 0. One-time setup

```sh
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

## 1. Build the image with Cloud Build (no local Docker needed)

Pull the values from your `.env.local` — same project you already use for
the dev server.

```sh
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

This pushes `gcr.io/YOUR_PROJECT_ID/momentum:latest`.

(If you'd rather build locally: `docker build --build-arg VITE_FIREBASE_API_KEY=... [...] -t gcr.io/YOUR_PROJECT_ID/momentum .` then `docker push gcr.io/YOUR_PROJECT_ID/momentum`.)

## 2. Deploy to Cloud Run

```sh
gcloud run deploy momentum \
  --image gcr.io/YOUR_PROJECT_ID/momentum:latest \
  --platform managed \
  --region asia-east1 \
  --allow-unauthenticated \
  --port 8080
```

`gcloud` prints the public `*.run.app` URL when this finishes — that's your
submission link.

## 3. Required manual step — Firebase Auth authorized domain

Google sign-in (`signInWithPopup`) will fail on the deployed URL until you
allow it:

**Firebase Console → Authentication → Settings → Authorized domains → Add domain** →
paste the `*.run.app` domain Cloud Run gave you.

## 4. Redeploying after a code change

Re-run step 1 (rebuilds the image with the same substitutions) then step 2
(`gcloud run deploy` with the same image tag) — or bump the tag
(`:v2`, etc.) if you want to keep old revisions around.

## Known limitation (by design, not a deploy bug)

`VITE_GEMINI_API_KEY` ends up in the public JS bundle since there's no
backend to proxy it through — this mirrors the existing architecture
(`calendar.service.ts`'s comments already call out the no-backend choice).
Acceptable for a hackathon submission; restrict the key's API scope in
Google Cloud Console (Gemini API only, HTTP referrer restriction to your
`*.run.app` domain) rather than leaving it fully open.
