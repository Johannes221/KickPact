"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ensureSponsorInviteLink } from "../_actions/invite";

interface Props {
  teamId: string;
  slug: string;
  /** Offener Einladungs-Token (oder null, falls noch keiner existiert). */
  initialToken: string | null;
  /** Verifizierung der relevanten Entität gesetzt? Steuert das Einladen-Gate. */
  isVerified: boolean;
  /** Trainer/Admin? Nur dann darf eingeladen werden. */
  canInvite: boolean;
  /**
   * Verifikations-Scope: „Mannschaft" (Einzel-Team, basic/pro) oder „Verein"
   * (Vereinslizenz). Steuert Label + Ziel-Link des Gates.
   */
  verifyEntity: "Mannschaft" | "Verein";
  /** Ziel-URL des „… verifizieren"-Links. */
  verifyHref: string;
}

/**
 * Karte im Sponsoren-Tab: Einladungslink + Kopieren. Vor der Verifizierung
 * ausgegraut mit CTA „erst … verifizieren" — schützt Sponsoren davor, an
 * unverifizierte Mannschaften/Vereine zu zahlen (Spec 2026-05-29 §3.5).
 */
export function SponsorInviteCard({
  teamId,
  slug: _slug,
  initialToken,
  isVerified,
  canInvite,
  verifyEntity,
  verifyHref
}: Props) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [pending, startTransition] = useTransition();

  const inviteUrl = token ? `${getOrigin()}/einladung/${token}` : null;

  function copy() {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    toast.success("Link kopiert");
  }

  function createLink() {
    startTransition(async () => {
      const res = await ensureSponsorInviteLink(teamId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setToken(res.token);
      toast.success("Einladungslink erstellt");
    });
  }

  // ── Gate: nicht verifiziert → Einladen gesperrt ────────────────────────────
  if (!isVerified) {
    const article = verifyEntity === "Mannschaft" ? "deine" : "dein";
    const plural = verifyEntity === "Mannschaft" ? "Mannschaften" : "Vereine";
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
        <div className="flex items-start gap-3">
          <span className="text-amber-600 text-lg shrink-0" aria-hidden>🔒</span>
          <div className="flex-1">
            <h3 className="font-display font-bold text-base md:text-lg tracking-tight text-brand-night-navy">
              Erst {verifyEntity} verifizieren
            </h3>
            <p className="mt-1 text-sm text-brand-night-navy/70">
              Schützt deine Sponsoren — kein Geld an unverifizierte {plural}. Sobald{" "}
              {article} {verifyEntity} verifiziert ist, kannst du Sponsoren einladen.
            </p>
            <Link
              href={verifyHref}
              className="mt-3 inline-flex items-center text-sm font-semibold text-accent hover:underline"
            >
              {verifyEntity} verifizieren →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-accent/40 bg-accent/5 p-5">
      <h3 className="font-display font-bold text-base md:text-lg tracking-tight text-brand-night-navy">
        Sponsoren einladen
      </h3>
      <p className="mt-1 text-sm text-brand-night-navy/70">
        Teile diesen Link — per WhatsApp, Mail, am Stammtisch. Sponsoren registrieren sich
        selbst und legen ihre Pacts fest (z.B. „5 € pro Tor").
      </p>

      {inviteUrl ? (
        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          <input
            readOnly
            value={inviteUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 min-w-0 rounded-lg border border-brand-neutral/40 bg-white px-3 py-2 text-sm text-brand-night-navy/80 font-mono truncate"
          />
          <Button variant="accent" onClick={copy} className="shrink-0">
            Kopieren
          </Button>
        </div>
      ) : canInvite ? (
        <div className="mt-4">
          <Button variant="accent" onClick={createLink} disabled={pending}>
            {pending ? "Erstelle Link…" : "Einladungslink erstellen"}
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-brand-night-navy/50">
          Nur Trainer oder Admins können einen Einladungslink erstellen.
        </p>
      )}
    </div>
  );
}

/** SSR-sicherer Origin (clientseitig window, sonst leer → relativer Fallback). */
function getOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}
