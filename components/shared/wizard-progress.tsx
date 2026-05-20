import { cn } from "@/lib/utils";

export function WizardProgress({
  steps,
  currentStep
}: {
  steps: { label: string; href: string }[];
  currentStep: number;
}) {
  return (
    <ol className="flex flex-wrap gap-1.5 md:gap-2 text-xs md:text-sm">
      {steps.map((step, idx) => {
        const num = idx + 1;
        const status =
          num < currentStep ? "done" : num === currentStep ? "current" : "todo";
        return (
          <li
            key={step.href}
            className={cn(
              "flex items-center gap-1.5 md:gap-2 rounded-full px-2.5 md:px-3 py-1 transition-colors",
              status === "current" && "bg-accent text-white",
              status === "done" && "bg-accent/10 text-accent-dark",
              status === "todo" && "bg-brand-neutral/40 text-brand-night-navy/50"
            )}
          >
            <span className="tabular-nums font-semibold">{num}.</span>
            <span>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
