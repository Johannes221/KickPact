import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  /** Kleines Uppercase-Label über dem Wert. */
  label: string;
  /** Primärwert (Zahl/Status). Mono-Tabular für saubere Ziffern-Ausrichtung. */
  value: React.ReactNode;
  /** Optionale Zusatzzeile unter dem Wert. */
  hint?: string;
  className?: string;
}

/**
 * Einheitliche Kennzahl-Karte. Ersetzt die vier zuvor pro Seite (Pledge-Detail,
 * Charges, Pledges, Abrechnungen) inline kopierten StatCard-Definitionen. Padding,
 * Radius und Schatten kommen ausschließlich aus der Card-Komponente + Tokens.
 */
export function StatCard({ label, value, hint, className }: StatCardProps) {
  return (
    <Card className={cn("p-4", className)}>
      <div className="text-ios-caption font-semibold uppercase tracking-widest text-ios-label-tertiary">
        {label}
      </div>
      <div className="mt-1 font-display text-ios-title3 tabular-nums text-ios-label">
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-ios-footnote text-ios-label-secondary">{hint}</div>
      ) : null}
    </Card>
  );
}
