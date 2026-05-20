import { HeaderUserMenu } from "@/components/auth/header-user-menu";
import { Logo } from "@/components/shared/logo";

export function AppHeader() {
  return (
    <header className="border-b border-brand-neutral/40 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Logo variant="full" />
        <HeaderUserMenu />
      </div>
    </header>
  );
}
