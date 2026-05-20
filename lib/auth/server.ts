import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema/auth";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { magicLinkEmail } from "@/lib/mail/templates/magic-link";

// Social-Provider werden konditional registriert, damit fehlende Credentials
// nicht den Server-Boot blocken — z.B. lokal kann man ohne Apple-Keys arbeiten.
type SocialProviders = NonNullable<Parameters<typeof betterAuth>[0]["socialProviders"]>;
const socialProviders: SocialProviders = {};

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET
  };
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
  emailAndPassword: { enabled: false },
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3003",
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3003"],
  socialProviders: Object.keys(socialProviders).length > 0 ? socialProviders : undefined,
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
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
            to: email,
            error: result.error
          });
          throw new Error(`Magic-Link-Mail konnte nicht verschickt werden: ${result.error.message}`);
        }
        console.log("[magicLink] sent", { to: email, id: result.data?.id });
      },
      expiresIn: 60 * 15
    })
  ]
});

export type Session = typeof auth.$Infer.Session;
