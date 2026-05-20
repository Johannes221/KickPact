import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-oklch(0.922 0 0) bg-oklch(1 0 0) px-3 py-2 text-base ring-offset-oklch(1 0 0) file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-oklch(0.145 0 0) placeholder:text-oklch(0.556 0 0) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oklch(0.708 0 0) focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:border-oklch(1 0 0 / 10%) dark:border-oklch(1 0 0 / 15%) dark:bg-oklch(0.145 0 0) dark:ring-offset-oklch(0.145 0 0) dark:file:text-oklch(0.985 0 0) dark:placeholder:text-oklch(0.708 0 0) dark:focus-visible:ring-oklch(0.556 0 0)",
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
