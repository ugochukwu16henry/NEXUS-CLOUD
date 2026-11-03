"use client";

import { useEffect, useState } from "react";

/** True on phones and narrow windows (below Tailwind's md breakpoint), where layouts stack. */
export function useSmallScreen(): boolean {
  const [small, setSmall] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setSmall(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return small;
}
