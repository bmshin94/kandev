"use client";

import { useEditors } from "@/hooks/domains/settings/use-editors";
import { useRef } from "react";
import { openSessionFolder } from "@/lib/api";
import { useRequest } from "@/lib/http/use-request";
import { useToast } from "@/components/toast-provider";
import { t } from "@/lib/i18n";

export function useOpenSessionFolder(sessionId?: string | null) {
  const { folderOpeningAvailable } = useEditors();
  const { toast } = useToast();
  const inFlight = useRef(false);
  const request = useRequest(async (worktreeId?: string) => {
    if (!sessionId) return null;
    return (
      (await openSessionFolder(
        sessionId,
        { cache: "no-store" },
        worktreeId ? { worktree_id: worktreeId } : undefined,
      )) ?? null
    );
  });

  return {
    open: async (worktreeId?: string) => {
      if (!sessionId || !folderOpeningAvailable || inFlight.current) return null;
      inFlight.current = true;
      try {
        return await request.run(worktreeId);
      } catch {
        toast({ title: t("editors:failedToOpenFolder"), variant: "error" });
        return null;
      } finally {
        inFlight.current = false;
      }
    },
    available: folderOpeningAvailable,
    status: request.status,
    isLoading: request.isLoading,
  };
}
