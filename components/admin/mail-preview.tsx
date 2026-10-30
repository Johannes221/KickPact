"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { sendTestMailAction } from "@/app/admin/(panel)/mail/_actions/test-send";

export interface PreviewTemplate {
  key: string;
  label: string;
  subject: string;
  html: string;
}

export function MailPreview({
  templates,
  defaultTo
}: {
  templates: PreviewTemplate[];
  defaultTo: string;
}) {
  const [selectedKey, setSelectedKey] = useState(templates[0]?.key ?? "");
  const [to, setTo] = useState(defaultTo);
  const [pending, setPending] = useState(false);
  const selected = templates.find((t) => t.key === selectedKey);

  async function sendTest() {
    setPending(true);
    const res = await sendTestMailAction({ templateKey: selectedKey, to });
    setPending(false);
    if (res.ok) toast.success(`Test-Mail an ${to} gesendet`);
    else toast.error(res.error ?? "Fehlgeschlagen");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selectedKey}
          onChange={(e) => setSelectedKey(e.target.value)}
          className="rounded-lg border border-brand-neutral/40 bg-white px-3 py-1.5 text-sm"
        >
          {templates.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
        <Input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="test@kickpact.com"
          className="w-56"
        />
        <Button variant="outline" onClick={sendTest} disabled={pending || !selected || !to}>
          {pending ? "Sende..." : "Test senden"}
        </Button>
      </div>

      {selected && (
        <div className="rounded-2xl border border-brand-neutral/40 bg-white overflow-hidden">
          <div className="border-b border-brand-neutral/30 bg-brand-off-white px-4 py-2 text-xs text-brand-night-navy/70">
            <span className="font-semibold">Betreff:</span> {selected.subject}
          </div>
          <iframe
            title="Mail-Vorschau"
            srcDoc={selected.html}
            sandbox=""
            className="h-[480px] w-full bg-white"
          />
        </div>
      )}
    </div>
  );
}
