import { cn } from "@/lib/utils";

/**
 * Skeleton-Loading-Placeholder.
 *
 * Style: brand-neutral mit pulse-Animation. Auf weißem oder off-white
 * Hintergrund nutzbar.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-brand-neutral/30", className)}
      {...props}
    />
  );
}

export { Skeleton };
