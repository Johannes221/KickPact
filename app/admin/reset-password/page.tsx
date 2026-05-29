import { Suspense } from "react";
import { OperatorResetForm } from "@/components/admin/operator-reset-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Passwort zurücksetzen · KickPact Operator" };

export default function OperatorResetPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <Card>
        <CardHeader>
          <p className="text-xs uppercase tracking-widest font-semibold text-neutral-400">
            KickPact Operator
          </p>
          <CardTitle className="font-display text-3xl tracking-wide">Neues Passwort</CardTitle>
          <CardDescription>Setze ein neues Passwort für deinen Operator-Account.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="h-40" />}>
            <OperatorResetForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
