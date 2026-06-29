# ============================================================================
# Momentum — Cloud Run deployment image
#
# This is a static Vite/React SPA with no backend of its own (Firebase +
# Gemini are called directly from the browser). Cloud Run just needs to
# serve the built `dist/` output over HTTP on $PORT — nginx does that.
#
# Vite env vars are compile-time: anything prefixed VITE_ must be present as
# a build ARG (and merged into ENV) BEFORE `npm run build` runs, or it will
# be missing from the bundle entirely. Pass these via --build-arg or a
# cloudbuild.yaml substitution — see DEPLOY.md.
# ============================================================================

FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_APP_MEASUREMENT_ID
ARG VITE_GEMINI_API_KEY

ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET \
    VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID \
    VITE_FIREBASE_APP_MEASUREMENT_ID=$VITE_FIREBASE_APP_MEASUREMENT_ID \
    VITE_GEMINI_API_KEY=$VITE_GEMINI_API_KEY

RUN npm run build

FROM nginx:alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
