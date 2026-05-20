import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY not set");
}

export const resend = new Resend(process.env.RESEND_API_KEY);

export const MAIL_FROM = process.env.MAIL_FROM ?? "KickPact <onboarding@resend.dev>";
