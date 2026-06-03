import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "E-Mail prüfen · KickPact" };

export default function VerifyPage() {
  return (
    <main className="mx-auto max-w-md px-5 md:px-6 py-10 md:py-16">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-[26px] md:text-[28px] font-bold tracking-[-0.01em] text-brand-night-navy">
            Check deine Mails
          </CardTitle>
          <CardDescription className="text-[15px] text-ios-label-secondary">
            Wir haben dir einen Login-Link geschickt. Der Link gilt 15 Minuten.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-[15px] text-ios-label-secondary">
            Falls die Mail nicht ankommt, prüfe deinen Spam-Ordner oder versuche es{" "}
            <Link href="/login" className="font-medium text-accent-dark hover:underline">
              erneut
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
