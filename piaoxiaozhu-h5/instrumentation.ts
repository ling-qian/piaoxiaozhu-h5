// Sentry instrumentation — only activates when NEXT_PUBLIC_SENTRY_DSN is set
// If you want to enable Sentry, set the env var and uncomment below

export function register() {
  // No-op when Sentry DSN is not configured
  // To enable: set NEXT_PUBLIC_SENTRY_DSN in Vercel env vars
  // and uncomment the following:
  //
  // import * as Sentry from "@sentry/nextjs";
  // Sentry.init({
  //   dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  //   tracesSampleRate: 0.1,
  //   replaysSessionSampleRate: 0,
  //   replaysOnErrorSampleRate: 1.0,
  //   environment: process.env.VERCEL_ENV || "development",
  // });
}
