import * as Sentry from "@sentry/nextjs";

const dsn =
  process.env.SENTRY_DSN ||
  process.env.NEXT_PUBLIC_SENTRY_DSN ||
  "";

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    sendDefaultPii: false,

    beforeSend(event, hint) {
      const error = hint?.originalException || hint?.syntheticException;
      if (error && error.code === "EPIPE") return null;
      if (error && typeof error.message === "string" && error.message.includes("Invalid source map")) {
        return null;
      }
      return event;
    },
  });
}
