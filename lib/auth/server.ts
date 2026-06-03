import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema/auth";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { magicLinkEmail } from "@/lib/mail/templates/magic-link";
import { adminPasswordResetEmail } from "@/lib/mail/templates/admin-password-reset";
import { maskEmail } from "@/lib/utils/log-pii";

// Social-Provider werden konditional registriert, damit fehlende Credentials
// nicht den Server-Boot blocken — z.B. lokal kann man ohne Apple-Keys arbeiten.
type SocialProviders = NonNullable<Parameters<typeof betterAuth>[0]["socialProviders"]>;
const socialProviders: SocialProviders = {};

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    // Nativer iOS-Login (GoogleAuth-Plugin) liefert ein idToken, dessen `aud`
    // die iOS-OAuth-Client-ID ist — NICHT die Web-Client-ID, gegen die
    // better-auth standardmäßig prüft (audience: options.clientId). Ohne diesen
    // Override schlägt der native Google-Login mit Audience-Mismatch fehl.
    // Wir akzeptieren beide Audiences (Web + iOS) und verifizieren ansonsten
    // exakt wie better-auth (Google-JWKS, Issuer, maxTokenAge). Greift NUR beim
    // idToken-Sign-in (signIn.social({ idToken })); der Web-OAuth-Code-Flow
    // nutzt diesen Pfad nicht.
    ...(process.env.GOOGLE_IOS_CLIENT_ID
      ? { verifyIdToken: googleVerifyIdToken }
      : {})
  };
}

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);

async function googleVerifyIdToken(
  token: string,
  nonce?: string
): Promise<boolean> {
  const audiences = [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID
  ].filter((a): a is string => Boolean(a));
  try {
    const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: audiences,
      maxTokenAge: "1h"
    });
    if (nonce && payload.nonce !== nonce) return false;
    return true;
  } catch {
    return false;
  }
}

// Apple Sign-in: clientSecret ist ein vor-generiertes ES256-JWT (max 6 Monate gültig).
// Erzeugt von scripts/generate-apple-jwt.mjs aus APPLE_TEAM_ID/KEY_ID/CLIENT_ID + .p8.
// Wird statisch via APPLE_CLIENT_SECRET in den ENV gehalten — kein Build-Time-Crypto-Aufruf,
// keine top-level-await Issues mit Next.js Page-Data-Collection.
if (process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET) {
  socialProviders.apple = {
    clientId: process.env.APPLE_CLIENT_ID,
    clientSecret: process.env.APPLE_CLIENT_SECRET,
    appBundleIdentifier: process.env.APPLE_BUNDLE_ID
  };
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications
    }
  }),
  // Email+Passwort ist NUR für Plattform-Operator-Accounts (/admin) gedacht.
  // disableSignUp:true verhindert, dass sich normale Nutzer ein Passwort-Konto
  // anlegen — Operator-Accounts werden manuell per Seed erstellt. Normale Nutzer
  // bleiben ausschließlich beim Magic-Link-Flow.
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    requireEmailVerification: false,
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url }) => {
      const mail = adminPasswordResetEmail({ url, email: user.email });
      const result = await resend.emails.send({
        from: MAIL_FROM,
        to: user.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text
      });
      if (result.error) {
        console.error("[adminPasswordReset] Resend send failed:", {
          to: maskEmail(user.email),
          error: result.error
        });
        throw new Error(`Reset-Mail konnte nicht verschickt werden: ${result.error.message}`);
      }
      console.log("[adminPasswordReset] sent", { to: maskEmail(user.email), id: result.data?.id });
    }
  },
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3003",
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3003"],
  socialProviders: Object.keys(socialProviders).length > 0 ? socialProviders : undefined,
  // Rate-Limit: Das GLOBALE max gilt für ALLE /api/auth/*-Endpoints — auch für
  // /get-session, das das Layout bei JEDEM Page-Load aufruft. Ein knappes Limit
  // (vorher max:5/60s) sperrte daher normale Navigation aus (429 nach ~5 Klicks
  // pro Minute, SSR rendert dann anonym). Deshalb: großzügiges globales Limit,
  // Spam-relevante Endpoints bekommen eigene strenge customRules. (Better-Auth
  // schützt /sign-in/* ohnehin eingebaut mit 3/10s.)
  rateLimit: {
    enabled: true,
    window: 60,
    max: 120,
    customRules: {
      // Magic-Link-Versand streng halten (Resend-Kostenangriff + Inbox-Spam).
      // Großzügig genug für legitime "habe Mail nicht bekommen"-Retries.
      "/sign-in/magic-link": { window: 60, max: 5 },
      // Session-Check ist ein read-only Hot-Path (jeder Page-Load) → nicht limitieren.
      "/get-session": false
    }
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        // Operator-Accounts dürfen sich NICHT per Magic-Link einloggen — sonst
        // wäre der passwortlose Pfad ein Bypass des Passwort-Logins für /admin.
        // Wir verweigern den Versand still (kein Account-Enumeration-Hinweis).
        const existing = await db
          .select({ isPlatformAdmin: schema.users.isPlatformAdmin })
          .from(schema.users)
          .where(eq(schema.users.email, email.toLowerCase()))
          .limit(1);
        if (existing[0]?.isPlatformAdmin === true) {
          console.warn("[magicLink] refused for platform-admin email", { to: maskEmail(email) });
          return;
        }
        const mail = magicLinkEmail({ url, email });
        const result = await resend.emails.send({
          from: MAIL_FROM,
          to: email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text
        });
        // Resend's SDK returnt { data, error } — wirft NICHT bei API-Fehlern.
        // Wir müssen das selbst tun, sonst sieht der User "Check deine Mails"
        // obwohl die Mail nie verschickt wurde (z.B. Sandbox-Limit).
        if (result.error) {
          console.error("[magicLink] Resend send failed:", {
            from: MAIL_FROM,
            to: maskEmail(email),
            error: result.error
          });
          throw new Error(`Magic-Link-Mail konnte nicht verschickt werden: ${result.error.message}`);
        }
        console.log("[magicLink] sent", { to: maskEmail(email), id: result.data?.id });
      },
      expiresIn: 60 * 15
    })
  ]
});

export type Session = typeof auth.$Infer.Session;
