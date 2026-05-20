import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./server";

export async function getServerSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session;
}

export async function requireUser() {
  const session = await getServerSession();
  if (!session?.user) {
    redirect("/login");
  }
  return session.user;
}
