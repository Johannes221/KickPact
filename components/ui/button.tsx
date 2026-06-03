import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// iOS-native button: pill-shaped (rounded-full), tactile press-scale, tightened
// tracking. `link` is the exception — it stays inline text, no pill, no scale.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-[15px] font-semibold tracking-[-0.01em] ring-offset-white transition-[transform,opacity,background-color,box-shadow] duration-100 ease-out active:scale-[0.97] active:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-brand-night-navy text-white hover:bg-brand-night-navy/90",
        destructive:
          "bg-brand-alert-red text-white hover:bg-brand-alert-red/90",
        outline:
          "border border-ios-separator-opaque bg-white hover:bg-brand-off-white hover:text-brand-night-navy",
        secondary:
          "bg-ios-fill-tertiary text-brand-night-navy hover:bg-ios-fill",
        ghost: "hover:bg-ios-fill-tertiary hover:text-brand-night-navy",
        link: "rounded-none text-accent-dark underline-offset-4 hover:underline active:scale-100 active:opacity-70",
        accent: "bg-accent text-white shadow-ios-card hover:bg-accent/95",
        dark: "bg-black text-white hover:bg-black/90",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 px-4 text-[14px]",
        // Primary CTA per spec: 50px pill, 17px semibold.
        lg: "h-[50px] px-6 text-[17px]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
