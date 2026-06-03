import { Suspense } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Goal, Building2, HandCoins, type LucideIcon } from "lucide-react";
import { MagicLinkForm, type SignupRole } from "@/components/auth/magic-link-form";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { RoleChooser, type RoleTile } from "@/components/auth/role-chooser";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isAppleConfigured } from "@/lib/auth/apple-client-secret";
import { getServerSession } from "@/lib/auth/session";
import { isPlatformAdminEmail } from "@/lib/auth/admin";
import { getUserIdentities } from "@/lib/db/queries/user-identities";
import { getActiveDraftForUser } from "@/lib/db/queries/onboarding-draft";
import { pickAuthenticatedSignupDestination } from "@/lib/auth/signup-destination";

export const metadata = { title: "Bei KickPact starten · KickPact" };

const ROLE_META: Record<
  SignupRole,
  { icon: LucideIcon; title: string; tagline: string; bullets: string[] }
> = {
  mannschaft: {
    icon: Goal,
    title: "Als Mannschaft",
    tagline:
      "Du willst Sponsoring für eine einzelne Mannschaft — Sponsoren versprechen pro Tor, Sieg, Comeback. Geld direkt in eure Kasse.",
    bullets: [
      "Onboarding in 90 Sek. — wir finden eure Mannschaft automatisch",
      "Einladungslink → Sponsoren legen Pacts selbst fest",
      "30 Tage gratis, danach 5 € / Mon."
    ]
  },
  verein: {
    icon: Building2,
    title: "Als Verein",
    tagline:
      "Du repräsentierst einen ganzen Verein mit mehreren Mannschaften. Du wählst die Vereinslizenz im Plan-Schritt.",
    bullets: [
      "Mehrere Mannschaften unter einem Dach",
      "Vereinslogo auf PDF-Rechnungen, CSV-Export",
      "Per Mannschaft buchbar — Teams einzeln aktivieren"
    ]
  },
  sponsor: {
    icon: HandCoins,
    title: "Als Sponsor",
    tagline:
      "Du willst eine Mannschaft unterstützen — pro Tor, pro Sieg, pro Comeback. Du behältst die Kontrolle mit optionalem Cap.",
    bullets: [
      "Frei wählbare Pacts — von 1 € pro Tor bis 50 € pro Sieg",
      "100 % geht an die Mannschaft — wir zwacken nichts ab",
      "Du brauchst keinen Einladungslink, kannst aber einen verwenden"
    ]
  }
};

// Kurz-Taglines für die kompakten Chooser-Tiles (eine Zeile, kein Bullet-Block).
const ROLE_SHORT: Record<SignupRole, string> = {
  mannschaft: "Direkt in eure Kasse",
  verein: "Mehrere Teams, ein Dach",
  sponsor: "Performance-basiert fördern"
};

const SIGNUP_ROLES = ["mannschaft", "verein", "sponsor"] as const;

function isSignupRole(v: string | undefined): v is SignupRole {
  return v === "mannschaft" || v === "verein" || v === "sponsor";
}

/**
 * Mapping für eingeloggte User mit 0 Identities: welche Rolle führt zu welchem
 * Onboarding-Wizard? Wird im Auth-aware-Add-Role-Chooser genutzt.
 */
const ADD_ROLE_HREF: Record<SignupRole, string> = {
  mannschaft: "/onboarding/mannschaft/verein",
  verein: "/onboarding/verein/verein",
  sponsor: "/sponsor/onboarding"
};

export default async function SignupPage({
  searchParams
}: {
  searchParams: Promise<{ role?: string; from?: string; add?: string }>;
}) {
  const { role: roleParam, from: fromParam, add: addParam } = await searchParams;
  const role = isSignupRole(roleParam) ? roleParam : null;
  // `add=1` kommt vom „Neue Rolle hinzufügen"-Menüpunkt: der User WILL bewusst
  // eine weitere Rolle/Mannschaft anlegen. Ohne dieses Flag würde ein User mit
  // bestehender Identity sofort aufs Dashboard zurück-redirected (→ „nichts
  // passiert"). Mit dem Flag zeigen wir immer den Rollen-Chooser.
  const wantsAddRole = addParam === "1";
  // `from=chooser` markiert: User kam vom 3-Wege-Chooser auf dieser Seite. Nur
  // dann zeigen wir den „← Andere Rolle wählen"-Back-Link. Bei direktem Deep-
  // Link (z.B. "Mannschaft anlegen"-CTA von Landing) hat der User die Rolle
  // explizit gewählt — kein Back-Link, der das wieder relativiert.
  const fromChooser = fromParam === "chooser";

  // ── Auth-aware: eingeloggter User darf niemals die Signup-Form sehen ──────
  // Bug-Fix für „bin als Verein eingeloggt, klick auf signup?role=mannschaft
  // und sehe wieder Google/Apple-Buttons". Wir laden die Identity-Snapshot,
  // entscheiden rolle-aware wohin der User gehört, und redirecten dorthin.
  const session = await getServerSession();
  if (session?.user) {
    // Operator-Accounts haben keine Nutzer-Rolle und dürfen keine anlegen → /admin.
    if (await isPlatformAdminEmail(session.user.email)) redirect("/admin");
    // Erst Draft-Check: User hat noch einen offenen Onboarding-Wizard →
    // direkt zum Resume-Dispatcher. Ohne diesen Check würde getUserIdentities
    // (das Draft-Clubs filtert!) 0 Identities zurückgeben und der User sieht
    // "Wie willst du starten?" obwohl er eigentlich Schritt 2 oder 3 noch
    // abschließen muss.
    const draft = await getActiveDraftForUser(session.user.id);
    if (draft) redirect("/onboarding");

    const identities = await getUserIdentities(session.user.id);
    // „Neue Rolle hinzufügen" (add=1) → IMMER den Chooser zeigen, auch mit
    // bestehenden Identities. Sonst greift der Smart-Dispatch und wirft den
    // User zurück aufs Dashboard.
    if (!wantsAddRole) {
      const destination = pickAuthenticatedSignupDestination(identities, role);
      if (destination !== "/signup") {
        redirect(destination);
      }
    }
    // Chooser: entweder 0-Identity-Erstwahl ODER bewusstes „Rolle hinzufügen".
    // Die Tiles springen direkt in den jeweiligen Onboarding-Wizard (eine
    // weitere Mannschaft = eigener Container, siehe Identity-Logik).
    const total =
      identities.clubs.length +
      identities.teamOnly.length +
      (identities.sponsor ? 1 : 0);
    return <AuthenticatedRoleChooser addMode={wantsAddRole && total > 0} />;
  }

  // Google blockt OAuth in eingebetteten WebViews → in der nativen App ausblenden
  // (bis nativer Google-Flow existiert). Apple nativ, Magic-Link als Mail-Weg.
  const isNativeApp = ((await headers()).get("user-agent") ?? "").includes("KickPactApp");
  const oauthEnabled = {
    // Web: immer (wenn Web-Creds da). Native iOS: nur wenn der iOS-OAuth-Client
    // konfiguriert ist (GOOGLE_IOS_CLIENT_ID) — die Env wird erst gesetzt, NACHDEM
    // ein App-Build mit dem GoogleAuth-Plugin installiert ist, damit der Button
    // nie in einem Build ohne Plugin auftaucht.
    google:
      Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) &&
      (!isNativeApp || Boolean(process.env.GOOGLE_IOS_CLIENT_ID)),
    apple: isAppleConfigured()
  };
  const anyOauth = oauthEnabled.google || oauthEnabled.apple;

  // Kein Role-Param → 3-Wege-Chooser anzeigen (kompakt, ein Screen)
  if (!role) {
    const tiles: RoleTile[] = SIGNUP_ROLES.map((r) => ({
      icon: ROLE_META[r].icon,
      title: ROLE_META[r].title,
      tagline: ROLE_SHORT[r],
      href: `/signup?role=${r}&from=chooser`
    }));
    return (
      <RoleChooser
        heading="KickPact starten"
        subline="Wähle, wie du startest — später jederzeit erweiterbar."
        tiles={tiles}
        footer={
          <p className="text-center text-sm text-brand-night-navy/55">
            Schon einen Account?{" "}
            <Link href="/login" className="font-medium text-accent hover:underline">
              Login
            </Link>
          </p>
        }
      />
    );
  }

  // Role gewählt → MagicLinkForm + OAuth mit passendem Kontext
  const meta = ROLE_META[role];
  return (
    <main className="mx-auto max-w-md px-6 py-12 md:py-16">
      {fromChooser && (
        <div className="mb-3">
          <Link
            href="/signup"
            className="press -ml-1 inline-flex items-center text-[15px] font-medium text-accent-dark"
          >
            ‹ Andere Rolle wählen
          </Link>
        </div>
      )}
      <Card>
        <CardHeader>
          <span className="mb-2 grid h-12 w-12 place-items-center rounded-xl bg-accent/10 text-accent-dark">
            <meta.icon className="h-6 w-6" aria-hidden />
          </span>
          <CardTitle className="font-display text-[26px] md:text-[28px] font-bold tracking-[-0.01em] text-brand-night-navy">
            {meta.title} registrieren
          </CardTitle>
          <CardDescription className="text-[15px] text-ios-label-secondary">{meta.tagline}</CardDescription>
        </CardHeader>
        <CardContent>
          {anyOauth && (
            <>
              <Suspense fallback={<div className="h-20" />}>
                <OAuthButtons mode="signup" enabled={oauthEnabled} role={role} />
              </Suspense>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-ios-separator" />
                </div>
                <div className="relative flex justify-center text-[12px] font-medium uppercase tracking-[0.08em]">
                  <span className="bg-white px-3 text-ios-label-tertiary">oder per Mail</span>
                </div>
              </div>
            </>
          )}
          <Suspense fallback={<div className="h-32" />}>
            <MagicLinkForm mode="signup" role={role} />
          </Suspense>
          <p className="mt-6 text-center text-[15px] text-ios-label-secondary">
            Schon dabei?{" "}
            <Link href="/login" className="font-medium text-accent-dark hover:underline">
              Login
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

/**
 * Special-case-View: User ist bereits eingeloggt **und** hat noch 0 Identities
 * (Account erstellt, aber Onboarding nie abgeschlossen). Wir zeigen die
 * 3 Rollen-Tiles, aber die Links springen direkt in den jeweiligen
 * Onboarding-Wizard — kein erneutes Magic-Link/OAuth-Theater.
 */
function AuthenticatedRoleChooser({ addMode = false }: { addMode?: boolean }) {
  const tiles: RoleTile[] = SIGNUP_ROLES.map((r) => ({
    icon: ROLE_META[r].icon,
    title: ROLE_META[r].title,
    tagline: ROLE_SHORT[r],
    href: ADD_ROLE_HREF[r]
  }));
  return (
    <RoleChooser
      badge={addMode ? "Weitere Rolle" : "Account vorhanden"}
      heading={addMode ? "Was willst du hinzufügen?" : "KickPact starten"}
      subline={
        addMode
          ? "Lege eine weitere Mannschaft, einen Verein oder eine Sponsor-Rolle an."
          : "Du bist eingeloggt — wähle, wie du startest. Später jederzeit erweiterbar."
      }
      tiles={tiles}
    />
  );
}
