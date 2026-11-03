"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** While the worker has a run in hand, re-reads the page every few seconds so its progress shows. */
export function AgentRefresh({ every = 3000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), every);
    return () => clearInterval(timer);
  }, [router, every]);
  return null;
}
