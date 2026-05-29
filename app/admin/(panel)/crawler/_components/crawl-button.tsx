"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { triggerManualCrawlAction } from "../_actions/manual-crawl";

export function CrawlButton({ teamId }: { teamId: string }) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const res = await triggerManualCrawlAction({ teamId });
      if (!res.ok) toast.error(res.error);
      else toast.success("Crawler-Event gesendet");
    });
  }

  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={onClick}>
      {pending ? "..." : "Re-Crawl"}
    </Button>
  );
}
