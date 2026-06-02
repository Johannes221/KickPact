import type { Metadata } from "next";
import { IntroWizard } from "./_components/intro-wizard";

export const metadata: Metadata = {
  title: "Willkommen · KickPact"
};

/**
 * App-Einstieg (WS-8). Ziel des Middleware-Redirects für ausgeloggte Nutzer
 * der nativen App. Im Browser normal erreichbar, aber nicht verlinkt.
 */
export default function WillkommenPage() {
  return <IntroWizard />;
}
