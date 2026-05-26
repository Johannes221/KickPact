// Next.js 15 instrumentation entrypoint.
// Wird von Next.js automatisch geladen, bevor Code in Server-/Edge-Routes läuft.
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Erfasst React Server Component Errors automatisch (Next.js 15+).
export { captureRequestError as onRequestError } from "@sentry/nextjs";
