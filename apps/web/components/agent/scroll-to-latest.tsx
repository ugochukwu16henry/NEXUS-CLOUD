"use client";

import { useEffect, useRef } from "react";

/** Keeps the newest message in view when the conversation grows. */
export function ScrollToLatest({ count }: { count: number }) {
  const marker = useRef<HTMLDivElement>(null);
  useEffect(() => {
    marker.current?.scrollIntoView({ block: "end" });
  }, [count]);
  return <div ref={marker} aria-hidden="true" />;
}
