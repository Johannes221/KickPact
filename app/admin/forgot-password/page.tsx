import { OperatorForgotForm } from "@/components/admin/operator-forgot-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Passwort vergessen · KickPact Operator" };

export default function OperatorForgotPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <Card>
        <CardHeader>
          <p className="text-xs uppercase tracking-widest font-semibold text-neutral-400">
            KickPact Operator
          </p>
          <CardTitle className="font-display text-3xl tracking-wide">Passwort vergessen</CardTitle>
          <CardDescription>Wir schicken dir einen Link zum Zurücksetzen.</CardDescription>
        </CardHeader>
        <CardContent>
          <OperatorForgotForm />
        </CardContent>
      </Card>
    </main>
  );
}
