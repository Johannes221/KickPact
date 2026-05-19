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
        await resend.emails.send({
          from: MAIL_FROM,
          to: email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text
        });
      },
      expiresIn: 60 * 15
    })
  ]
});

export type Session = typeof auth.$Infer.Session;
