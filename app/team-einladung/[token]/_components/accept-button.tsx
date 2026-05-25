"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { acceptInviteAction } from "../_actions/accept";

export function AcceptInviteButton({
  token
}: {
  token: string;
  clubSlug: string | null;
  teamId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const res = await acceptInviteAction({ token });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Du bist drin. Viel Spaß.");
      router.push(res.redirectTo);
      router.refresh();
    });
  }

  return (
    <Button
      onClick={onClick}
      disabled={pending}
      variant="accent"
      size="lg"
      className="w-full"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      Beitreten →
    </Button>
  );
}
