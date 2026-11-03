"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { segment: "", label: "Overview" },
  { segment: "/board", label: "Board" },
  { segment: "/requirements", label: "Requirements" },
  { segment: "/milestones", label: "Milestones" },
  { segment: "/code", label: "Code" },
  { segment: "/repository", label: "Repository" },
  { segment: "/activity", label: "Activity" },
  { segment: "/assistant", label: "Assistant" },
  { segment: "/settings", label: "Settings" },
];

export function ProjectNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  return (
    <nav aria-label="Project sections" className="border-b border-nx-border">
      <ul className="flex gap-1 overflow-x-auto px-6">
        {SECTIONS.map(({ segment, label }) => {
          const href = base + segment;
          const active = segment === "" ? pathname === base : pathname.startsWith(href);
          return (
            <li key={label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`block whitespace-nowrap px-3 py-2 text-sm ${
                  active
                    ? "border-b-2 border-nx-teal text-nx-text"
                    : "text-nx-muted hover:text-nx-text"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
