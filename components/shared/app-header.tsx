import Link from "next/link";
import { HeaderUserMenu } from "@/components/auth/header-user-menu";

export function AppHeader() {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="font-display text-2xl tracking-wide">
          KickPact
        </Link>
        <HeaderUserMenu />
      </div>
    </header>
  );
}
