import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// iOS-Status-Badge: pill, soft getönter Hintergrund + saturierter Text. Bewusst
// NICHT in Tint-Grün für „neutral/info" — die Tones tragen Bedeutung:
//   success = positiv (bezahlt, bestätigt) · warning = wartet · danger = Fehler
//   accent  = interaktiver/Marken-Hinweis · info = neutral-blau · neutral = grau
// Alle Farben kommen aus den zentralen Tokens (kein Inline-Hex, keine Roh-Greys).
const badgeVariants = cva(
  "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-ios-caption font-semibold leading-none",
  {
    variants: {
      tone: {
        neutral: "bg-ios-fill-tertiary text-ios-label-secondary",
        accent: "bg-accent/12 text-accent-dark",
        success: "bg-success/12 text-success-dark",
        warning: "bg-warning/15 text-warning-dark",
        danger: "bg-brand-alert-red/12 text-brand-alert-red",
        info: "bg-ios-blue/12 text-ios-blue",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}

export { Badge, badgeVariants }
