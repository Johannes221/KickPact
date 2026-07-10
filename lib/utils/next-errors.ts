/**
 * Next.js signalisiert `redirect()` und `notFound()` über geworfene Fehler mit
 * einem speziellen `digest`. Ein breites `try/catch { return { error } }` in
 * einer Server-Action verschluckt diese Kontrollfluss-Fehler und liefert dem
 * Client ein nutzloses `{ error: "NEXT_REDIRECT" }` statt tatsächlich
 * umzuleiten. Diesen Helper am ANFANG jedes solchen catch aufrufen, damit
 * echte Redirects/notFounds weiter propagieren.
 */
export function rethrowIfControlFlow(e: unknown): void {
  if (
    e &&
    typeof e === "object" &&
    "digest" in e &&
    typeof (e as { digest?: unknown }).digest === "string"
  ) {
    const digest = (e as { digest: string }).digest;
    if (
      digest.startsWith("NEXT_REDIRECT") ||
      digest === "NEXT_NOT_FOUND" ||
      digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")
    ) {
      throw e;
    }
  }
}
