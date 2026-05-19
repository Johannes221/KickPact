"use client"

import {
  CircleCheck,
  Info,
  LoaderCircle,
  OctagonX,
  TriangleAlert,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheck className="h-4 w-4" />,
        info: <Info className="h-4 w-4" />,
        warning: <TriangleAlert className="h-4 w-4" />,
        error: <OctagonX className="h-4 w-4" />,
        loading: <LoaderCircle className="h-4 w-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-oklch(1 0 0) group-[.toaster]:text-oklch(0.145 0 0) group-[.toaster]:border-oklch(0.922 0 0) group-[.toaster]:shadow-lg dark:group-[.toaster]:bg-oklch(0.145 0 0) dark:group-[.toaster]:text-oklch(0.985 0 0) dark:group-[.toaster]:border-oklch(1 0 0 / 10%)",
          description: "group-[.toast]:text-oklch(0.556 0 0) dark:group-[.toast]:text-oklch(0.708 0 0)",
          actionButton:
            "group-[.toast]:bg-oklch(0.205 0 0) group-[.toast]:text-oklch(0.985 0 0) dark:group-[.toast]:bg-oklch(0.922 0 0) dark:group-[.toast]:text-oklch(0.205 0 0)",
          cancelButton:
            "group-[.toast]:bg-oklch(0.97 0 0) group-[.toast]:text-oklch(0.556 0 0) dark:group-[.toast]:bg-oklch(0.269 0 0) dark:group-[.toast]:text-oklch(0.708 0 0)",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
