import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY not set");
}

if (!process.env.MAIL_FROM) {
  // Hart failen statt auf onboarding@resend.dev fallback'en — sonst werden
  // Mails an alle Empfänger außer der Resend-Account-Email stumm abgelehnt
  // (Sandbox-Limit, HTTP 403 "validation_error").
  throw new Error(
    "MAIL_FROM not set. Use a verified domain, e.g. 'KickPact <noreply@kickpact.com>'."
  );
}

export const resend = new Resend(process.env.RESEND_API_KEY);

export const MAIL_FROM = process.env.MAIL_FROM;
