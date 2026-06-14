import * as Sentry from "@sentry/nextjs";

export function onRequestError() {
  // Sentry will automatically capture errors if SENTRY_DSN is set
}

export function initSentry() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    debug: false,
    environment: process.env.VERCEL_ENV || "development",
  });
}
