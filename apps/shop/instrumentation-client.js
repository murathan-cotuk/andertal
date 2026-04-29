// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://358d148bbc5d3fff71871cae743477ec@o4510747557822464.ingest.de.sentry.io/4510747562475600",

  // Add optional integrations for additional features
  integrations: [
    Sentry.replayIntegration(),
    Sentry.browserTracingIntegration(),
  ],

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production.
  // Learn more: https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#tracessamplerate
  tracesSampleRate: 1.0,

  // Distributed Tracing Configuration
  // Define which URLs should have trace propagation headers attached
  // This helps track requests across services for distributed tracing
  tracePropagationTargets: [
    "localhost",
    /^https:\/\/.*\.railway\.app\/api/,
    /^https:\/\/andertal.*\.vercel\.app\/api/,
    /^\/api/,
  ],
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
