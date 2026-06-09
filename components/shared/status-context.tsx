"use client";

import { createContext, useContext } from "react";
import type { StatusItem } from "./status-bar";

/**
 * Trägt die Status-/Hinweis-Items (Verifizierung, Trial, Zahlung) vom
 * Server-Layout zur nativen App-Bar (Glocke) — ohne Prop-Drilling durch die
 * verschachtelten Sub-Layouts. Default = leer (z.B. Sponsor-Bereich, Web).
 */
const StatusItemsContext = createContext<StatusItem[]>([]);

export function StatusItemsProvider({
  items,
  children
}: {
  items: StatusItem[];
  children: React.ReactNode;
}) {
  return (
    <StatusItemsContext.Provider value={items}>
      {children}
    </StatusItemsContext.Provider>
  );
}

export function useStatusItems(): StatusItem[] {
  return useContext(StatusItemsContext);
}
