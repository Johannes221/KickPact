"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { respondApprovalByToken } from "@/lib/actions/approvals";

type Result =
  | { kind: "idle" }
  | { kind: "confirmed" }
  | { kind: "disputed" }
  | { kind: "error"; message: string };

/**
 * SECURITY (L1): Die Mutation läuft ausschließlich über diesen expliziten
 * Button-Klick (Client → Server-Action), niemals beim GET-Render der Seite.
 */
export function ApproveAction({
  token,
  action
}: {
  token: string;
  action: "confirm" | "dispute";
}) {
  const [result, setResult] = useState<Result>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await respondApprovalByToken(token);
      if (!res.ok) {
        setResult({ kind: "error", message: res.error });
        return;
      }
      setResult({ kind: res.action === "confirm" ? "confirmed" : "disputed" });
    });
  }

  if (result.kind === "confirmed") {
    return (
      <Status
        status="confirmed"
        heading="Charge bestätigt"
        message="Charge bestätigt. Der Betrag erscheint auf der nächsten Monatsrechnung."
      />
    );
  }
  if (result.kind === "disputed") {
    return (
      <Status
        status="disputed"
        heading="Event bestritten"
        message="Event bestritten. Die Charge wurde storniert — der Verein wird informiert."
      />
    );
  }
  if (result.kind === "error") {
    return <Status status="error" heading="Fehler" message={result.message} />;
  }

  const isConfirm = action === "confirm";
  return (
    <div
      className={`rounded-xl border p-6 md:p-8 ${
        isConfirm
          ? "border-emerald-300 bg-emerald-50"
          : "border-brand-alert-red/30 bg-brand-alert-red/5"
      }`}
    >
      <p className="text-sm text-brand-night-navy/80 text-center mb-5">
        {isConfirm
          ? "Möchtest du diese Charge bestätigen? Der Betrag erscheint dann auf der nächsten Monatsrechnung."
          : "Möchtest du dieses gemeldete Ereignis bestreiten? Die zugehörige Charge wird storniert."}
      </p>
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className={`w-full rounded-lg px-4 py-3 font-display font-black tracking-tight text-white disabled:opacity-60 ${
          isConfirm ? "bg-emerald-600 hover:bg-emerald-700" : "bg-brand-alert-red hover:opacity-90"
        }`}
      >
        {pending ? "Wird verarbeitet …" : isConfirm ? "Charge bestätigen" : "Event bestreiten"}
      </button>
    </div>
  );
}

function Status({
  status,
  heading,
  message
}: {
  status: "confirmed" | "disputed" | "error";
  heading: string;
  message: string;
}) {
  const icon = status === "confirmed" ? "✅" : status === "disputed" ? "❌" : "⚠️";
  const headingColor =
    status === "confirmed"
      ? "text-emerald-700"
      : status === "disputed"
        ? "text-brand-alert-red"
        : "text-amber-700";
  const borderColor =
    status === "confirmed"
      ? "border-emerald-300 bg-emerald-50"
      : status === "disputed"
        ? "border-brand-alert-red/30 bg-brand-alert-red/5"
        : "border-amber-300 bg-amber-50";
  return (
    <div className={`rounded-xl border p-6 md:p-8 ${borderColor}`}>
      <div className="text-4xl mb-3 text-center">{icon}</div>
      <h1 className={`font-display font-black text-xl tracking-tight text-center mb-3 ${headingColor}`}>
        {heading}
      </h1>
      <p className="text-sm text-brand-night-navy/70 text-center">{message}</p>
      <div className="mt-6 flex justify-center gap-4 text-xs text-brand-night-navy/50">
        <Link href="/sponsor/inbox" className="hover:text-accent">
          Zur Inbox
        </Link>
        <Link href="/" className="hover:text-accent">
          Startseite
        </Link>
      </div>
    </div>
  );
}
