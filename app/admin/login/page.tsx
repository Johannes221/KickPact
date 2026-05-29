import { redirect } from "next/navigation";
import { OperatorLoginForm } from "@/components/admin/operator-login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerSession } from "@/lib/auth/session";
import { isPlatformAdminEmail } from "@/lib/auth/admin";

export const metadata = { title: "Operator-Login · KickPact" };

export default async function OperatorLoginPage() {
  const session = await getServerSession();
  if (session?.user && (await isPlatformAdminEmail(session.user.email))) {
    redirect("/admin/dashboard");
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <Card>
        <CardHeader>
          <p className="text-xs uppercase tracking-widest font-semibold text-neutral-400">
            KickPact Operator
          </p>
          <CardTitle className="font-display text-3xl tracking-wide">Backoffice-Login</CardTitle>
          <CardDescription>Nur für Plattform-Betreiber. Anmeldung mit E-Mail und Passwort.</CardDescription>
        </CardHeader>
        <CardContent>
          <OperatorLoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
