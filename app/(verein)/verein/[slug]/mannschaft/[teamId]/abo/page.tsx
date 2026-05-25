import { redirect } from "next/navigation";

/**
 * Team-Scope /abo ist aktuell ein Redirect auf die Club-Level /abo-Page.
 *
 * Hintergrund: Subscription + Stripe-Customer leben auf Club-Ebene (eine
 * Subscription pro Club, n Team-Licenses dranhängend). Für basic/pro-User,
 * die nur eine Mannschaft haben, gibt es keinen funktionalen Unterschied
 * zwischen Team- und Club-Abo — Stripe-Checkout, Plan-Wechsel, Cancel
 * passieren alle auf /verein/[slug]/abo.
 *
 * Wird der Tab im team-sub-nav.tsx aus dem Nav für basic/pro gefiltert
 * sobald das hier konkrete Team-spezifische UI bekommt (z.B. License-
 * Status der einzelnen Mannschaft im Vereinslizenz-Bündel).
 */
export default async function TeamAboPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/verein/${slug}/abo`);
}
