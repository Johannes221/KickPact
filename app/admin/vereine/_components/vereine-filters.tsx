"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition, useEffect } from "react";

const STATUS_OPTIONS = [
  { value: "", label: "Alle Status" },
  { value: "trialing", label: "Trial" },
  { value: "active", label: "Aktiv" },
  { value: "past_due", label: "Past Due" },
  { value: "cancelled", label: "Cancelled" },
  { value: "paused", label: "Pausiert" }
];

const PLAN_OPTIONS = [
  { value: "", label: "Alle Pläne" },
  { value: "basic", label: "Basic" },
  { value: "pro", label: "Pro" },
  { value: "verein", label: "Vereinslizenz" }
];

const VERIFIED_OPTIONS = [
  { value: "", label: "Alle" },
  { value: "yes", label: "Nur verifiziert" },
  { value: "no", label: "Nur unverifiziert" }
];

export function VereineFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [plan, setPlan] = useState(sp.get("plan") ?? "");
  const [verified, setVerified] = useState(sp.get("verified") ?? "");
  const [search, setSearch] = useState(sp.get("q") ?? "");

  // Sync if URL changes externally (e.g. via DataTable sort)
  useEffect(() => {
    setStatus(sp.get("status") ?? "");
    setPlan(sp.get("plan") ?? "");
    setVerified(sp.get("verified") ?? "");
    setSearch(sp.get("q") ?? "");
  }, [sp]);

  function navigate(patch: Record<string, string>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    const qs = next.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  return (
    <form
      className="flex flex-wrap items-end gap-2 mb-4"
      onSubmit={(e) => {
        e.preventDefault();
        navigate({ status, plan, verified, q: search.trim() });
      }}
    >
      <Field label="Suche">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name / Slug / Ort"
          className="h-9 w-48 rounded-md border border-brand-neutral bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-neutral"
        />
      </Field>
      <Field label="Status">
        <Select
          value={status}
          onChange={(v) => {
            setStatus(v);
            navigate({ status: v });
          }}
          options={STATUS_OPTIONS}
        />
      </Field>
      <Field label="Plan">
        <Select
          value={plan}
          onChange={(v) => {
            setPlan(v);
            navigate({ plan: v });
          }}
          options={PLAN_OPTIONS}
        />
      </Field>
      <Field label="Verifiziert">
        <Select
          value={verified}
          onChange={(v) => {
            setVerified(v);
            navigate({ verified: v });
          }}
          options={VERIFIED_OPTIONS}
        />
      </Field>
      <button
        type="submit"
        disabled={pending}
        className="h-9 rounded-md bg-brand-night-navy px-3 text-sm font-semibold text-white hover:bg-brand-night-navy/90 disabled:opacity-50"
      >
        Suchen
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-brand-night-navy/70">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border border-brand-neutral bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-neutral"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
