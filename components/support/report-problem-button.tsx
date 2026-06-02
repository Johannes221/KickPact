"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { ReportProblemForm, type ReportContext } from "./report-problem-form";

type Ctx = Omit<ReportContext, "contextUrl">;
type Category = "frage" | "bug" | "abrechnung" | "spieldaten" | "sonstiges";

/**
 * Kontextbezogener „Problem melden"-Button (für alle Rollen). Öffnet einen
 * Dialog mit dem Report-Formular; die aktuelle Seite (`contextUrl`) wird
 * automatisch über `usePathname()` angehängt.
 */
export function ReportProblemButton({
  label = "Problem melden",
  title = "Problem melden",
  description,
  defaults,
  defaultCategory = "frage",
  context,
  variant = "outline",
  size = "sm",
  className
}: {
  label?: string;
  title?: string;
  description?: string;
  defaults?: { name?: string; email?: string };
  defaultCategory?: Category;
  context?: Ctx;
  variant?: "outline" | "ghost" | "accent" | "default";
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const fullContext: ReportContext = {
    ...context,
    contextType: context?.contextType ?? "page",
    contextUrl: pathname ?? null
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <LifeBuoy aria-hidden />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ??
              "Beschreib kurz, was nicht stimmt — wir kümmern uns drum und melden uns per E-Mail."}
          </DialogDescription>
        </DialogHeader>
        <ReportProblemForm
          defaults={defaults}
          defaultCategory={defaultCategory}
          context={fullContext}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
