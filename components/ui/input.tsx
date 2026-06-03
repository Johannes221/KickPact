import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // iOS text field: 50px tall, hairline border, 17px text (no zoom-on-
          // focus on iOS Safari), brand focus ring instead of grey.
          "flex h-[50px] w-full rounded-xl border border-ios-separator-opaque bg-white px-4 text-[17px] text-brand-night-navy ring-offset-white transition-[border-color,box-shadow] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-neutral-950 placeholder:text-ios-label-tertiary focus-visible:border-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
