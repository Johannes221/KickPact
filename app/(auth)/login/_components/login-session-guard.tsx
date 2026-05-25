"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/client";

/**
 * Client-side Safety-Net für die Login-Page.
 *
 * Problem (siehe User-Report 2026-05-25): Manche User landeten auf `/login`
 * obwohl sie eingeloggt waren — der Server-Header-Dropdown zeigte korrekt
 * "ANGEMELDET ALS …", aber die Login-Form war trotzdem sichtbar. Ursache:
 * `getServerSession()` lieferte beim SSR-Render `null` (vermutlich Cookie-
 * Sync-Race nach Magic-Link-Callback, oder Header die `Cookie`-Header nicht
 * forwarden), während `useSession()` clientseitig sofort die echte Session sah.
 *
 * Fix: Wenn der Client eine valide Session erkennt, redirected er sofort zur
 * `/dashboard` (dort entscheidet der Smart-Dispatcher weiter). Der SSR-Redirect
 * bleibt als Fast-Path bestehen — das hier ist der Fallback für die Race.
 */
export function LoginSessionGuard() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (isPending) return;
    if (session?.user) {
      router.replace("/dashboard");
    }
  }, [session?.user?.id, isPending, router]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
