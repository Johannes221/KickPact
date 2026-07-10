"use client";

import { useCallback, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Generischer Bestätigungs-Dialog (UI-Standard: destruktive Aktionen brauchen
 * eine Bestätigung — NIE natives `window.confirm()`, das im iOS-WebView als
 * System-Alert erscheint und keine Marken-States/Danger-Styling kennt).
 *
 * Promise-basierte Nutzung als Drop-in für `window.confirm`:
 *
 *   const { confirm, confirmDialog } = useConfirm();
 *   ...
 *   if (!(await confirm({ title: "Wirklich löschen?", danger: true }))) return;
 *   ...
 *   return (<>{confirmDialog}{/* restliche UI *​/}</>);
 */
export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setOpts(null);
  }, []);

  const confirmDialog = opts ? (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{opts.title}</DialogTitle>
          {opts.description ? (
            <DialogDescription>{opts.description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => settle(false)}>
            {opts.cancelLabel ?? "Abbrechen"}
          </Button>
          <Button
            variant={opts.danger ? "destructive" : "default"}
            onClick={() => settle(true)}
          >
            {opts.confirmLabel ?? "Bestätigen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  return { confirm, confirmDialog };
}
