import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "E-Mail prüfen · KickPact" };

export default function VerifyPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-3xl tracking-wide">
            Check deine Mails
          </CardTitle>
          <CardDescription>
            Wir haben dir einen Login-Link geschickt. Der Link gilt 15 Minuten.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-500">
            Falls die Mail nicht ankommt, prüfe deinen Spam-Ordner oder versuche es{" "}
            <Link href="/login" className="font-medium text-accent hover:underline">
              erneut
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
