"use client";

/**
 * Mobile Floating Action Button for Vereins-pages.
 * Shows bottom-right on small screens (hidden on md+).
 *
 * Three possible actions, shown based on role:
 *  - Manuelles Ereignis melden  (admin or trainer)
 *  - Sponsor einladen           (admin or trainer)
 *  - Mannschaft hinzufügen      (admin only)
 */

import { useState } from "react";
import { Plus, CalendarPlus, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";

interface VereinFABProps {
  slug: string;
  /** Club membership role of the current user. */
  clubRole: "admin" | "trainer" | "viewer";
}

export function VereinFAB({ slug, clubRole }: VereinFABProps) {
  const [open, setOpen] = useState(false);

  const isAdmin = clubRole === "admin";
  const isTrainerOrAbove = clubRole === "admin" || clubRole === "trainer";

  const actions = [
    {
      label: "Ereignis melden",
      description: "Manuelles Sponsoring-Ereignis erfassen",
      icon: CalendarPlus,
      href: `/verein/${slug}/ereignisse`,
      show: isTrainerOrAbove
    },
    {
      label: "Trainer / Viewer einladen",
      description: "Einladungslink für ein Vereinsmitglied erstellen",
      icon: UserPlus,
      href: `/verein/${slug}/einstellungen/mitglieder`,
      show: isTrainerOrAbove
    },
    {
      label: "Mannschaft hinzufügen",
      description: "Neue Mannschaft im Verein anlegen",
      icon: Users,
      href: `/verein/${slug}/mannschaften/neu`,
      show: isAdmin
    }
  ].filter((a) => a.show);

  // Viewers see no actions → don't render FAB at all
  if (actions.length === 0) return null;

  return (
    <>
      {/* Fixed FAB — mobile only (hidden md+) */}
      {/* Über der Bottom-Tab-Bar positioniert (bar ~56px + safe-area). */}
      <div className="md:hidden fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-5 z-40">
        <Button
          size="icon"
          className="h-14 w-14 rounded-full shadow-xl bg-accent hover:bg-accent-dark text-white transition-transform active:scale-95"
          onClick={() => setOpen(true)}
          aria-label="Schnellaktionen"
        >
          <Plus className="h-6 w-6" strokeWidth={2.5} />
        </Button>
      </div>

      {/* Bottom sheet with action links */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
          <SheetHeader className="mb-5 text-left">
            <SheetTitle className="font-display font-bold text-lg tracking-tight text-brand-night-navy">
              Was möchtest du tun?
            </SheetTitle>
          </SheetHeader>
          <nav className="space-y-2 pb-4">
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3.5 rounded-2xl border border-brand-neutral/40 px-4 py-3.5 bg-white hover:bg-brand-off-white active:bg-brand-neutral/20 transition-colors"
              >
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <action.icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-semibold text-brand-night-navy text-sm leading-tight">
                    {action.label}
                  </span>
                  <span className="block text-xs text-brand-night-navy/50 mt-0.5 leading-tight">
                    {action.description}
                  </span>
                </span>
              </Link>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
