/**
 * Gemeinsame Feld-Bausteine für die Pact-Regel-Editoren (Builder `new/` und
 * Inline-Editor `[id]/`). Ziel: einheitliche Höhe, Border und Radius über alle
 * Controls — `Input` ist 50px hoch (iOS-Feld), native `<select>` waren vorher
 * 36–40px → sichtbar verschiedene Größen. `RULE_SELECT_CLASS` spiegelt exakt das
 * Input-Styling, damit Dropdowns und Textfelder identisch aussehen.
 */

/**
 * Select-Styling, deckungsgleich mit `components/ui/input.tsx` (h-[50px],
 * rounded-xl, hairline iOS-Border, Brand-Fokusring). In beiden Editoren als
 * `className` für native `<select>` genutzt.
 */
export const RULE_SELECT_CLASS =
  "flex h-[50px] w-full rounded-xl border border-ios-separator-opaque bg-white px-4 text-[17px] text-brand-night-navy ring-offset-white transition-[border-color,box-shadow] focus-visible:border-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-50";

/** Einheitliches Feld-Label über jedem Control. */
export const RULE_FIELD_LABEL_CLASS = "text-xs font-medium text-brand-night-navy/60";
