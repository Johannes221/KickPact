import Link from "next/link";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Login · KickPact" };

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-3xl tracking-wide">Login</CardTitle>
          <CardDescription>Wir schicken dir einen Magic-Link per Mail.</CardDescription>
        </CardHeader>
        <CardContent>
          <MagicLinkForm mode="login" />
          <p className="mt-6 text-sm text-neutral-500">
            Noch keinen Account?{" "}
            <Link href="/signup" className="font-medium text-accent hover:underline">
              Verein anlegen
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
