// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

// DSN resolution order: env var (preferred) → temporary hardcoded fallback
// (kept during S1.4b transition so production Sentry never goes dark while
// env vars are being wired in deploy targets). Once NEXT_PUBLIC_SENTRY_DSN
// is set on every deploy target, the fallback should be removed entirely.
const HARDCODED_FALLBACK_DSN_TRANSITION =
  "https://358d148bbc5d3fff71871cae743477ec@o4510747557822464.ingest.de.sentry.io/4510747562475600";
const SENTRY_DSN =
  process.env.SENTRY_DSN ||
  process.env.NEXT_PUBLIC_SENTRY_DSN ||
  HARDCODED_FALLBACK_DSN_TRANSITION;

if (
  SENTRY_DSN === HARDCODED_FALLBACK_DSN_TRANSITION &&
  process.env.NODE_ENV === "production"
) {
  console.warn(
    "[sentry.server] Using hardcoded fallback DSN. Set SENTRY_DSN or NEXT_PUBLIC_SENTRY_DSN in production env."
  );
}

Sentry.init({
  dsn: SENTRY_DSN,

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production.
  // Learn more: https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#tracessamplerate
  tracesSampleRate: 1.0,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,

  // Filter out common non-critical errors
  beforeSend(event, hint) {
    const error = hint.originalException || hint.syntheticException;
    
    // Ignore EPIPE errors (broken pipe - happens when client disconnects)
    if (error && error.code === 'EPIPE') {
      return null; // Don't send to Sentry
    }
    
    // Ignore invalid source map warnings
    if (error && error.message && error.message.includes('Invalid source map')) {
      return null; // Don't send to Sentry
    }
    
    return event;
  },
});
