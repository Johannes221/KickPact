import { redirect } from "next/navigation";

/**
 * Legacy-Redirect. Frühere Marketing-Links (`/onboarding/verein/1?plan=...`)
 * landeten hier — neuer Default ist der Resume-Dispatcher, der den User entweder
 * in seinen aktiven Draft, in sein Dashboard oder in `/signup` schickt.
 */
export default function OnboardingVereinIndex() {
  redirect("/onboarding");
}
