import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema/auth";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { magicLinkEmail } from "@/lib/mail/templates/magic-link";

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
  socialProviders:
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET
          }
        }
      : undefined,
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
