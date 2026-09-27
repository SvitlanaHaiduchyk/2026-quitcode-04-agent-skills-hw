"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Re-renders the server page while the estimate is still being prepared.
export function QuoteAutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);

  return null;
}
