import Link from "next/link";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Verein anlegen · KickPact" };

export default function SignupPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-3xl tracking-wide">Verein anlegen</CardTitle>
          <CardDescription>
            Du legst KickPact für deinen Verein an und kannst dann Sponsoren einladen. 30 Tage gratis testen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MagicLinkForm mode="signup" />
          <p className="mt-6 text-sm text-neutral-500">
            Schon dabei?{" "}
            <Link href="/login" className="font-medium text-accent hover:underline">
              Login
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
