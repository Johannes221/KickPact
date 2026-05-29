"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth/client";

export function OperatorLogoutButton() {
  const router = useRouter();
  async function handle() {
    await signOut();
    router.push("/admin/login");
    router.refresh();
  }
  return (
    <button
      type="button"
      onClick={handle}
      className="rounded-xl px-3 py-1.5 text-sm font-semibold text-brand-night-navy/60 hover:text-brand-night-navy hover:bg-white/70 transition-colors"
    >
      Abmelden
    </button>
  );
}
