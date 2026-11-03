import { useId } from "react";

/**
 * The Nexus Cloud mark: an "N" drawn as a network path, four connected nodes on a dark tile, with
 * an orbit for the cloud. The favicon (app/icon.svg) is the same mark without the orbit, so it
 * stays legible at 16 px. Colours are the teal and blue brand tokens.
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId();
  const stroke = `${id}-stroke`;
  const tile = `${id}-tile`;
  const glow = `${id}-glow`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id={tile} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#172238" />
          <stop offset="1" stopColor="#070b14" />
        </linearGradient>
        <linearGradient id={stroke} x1="16" y1="48" x2="48" y2="16" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2dd4bf" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
        <radialGradient id={glow} cx="0" cy="0" r="1" gradientTransform="matrix(0 30 -30 0 32 32)">
          <stop stopColor="#2dd4bf" stopOpacity="0.28" />
          <stop offset="1" stopColor="#2dd4bf" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="16" fill={`url(#${tile})`} />
      <rect x="1" y="1" width="62" height="62" rx="16" fill={`url(#${glow})`} />
      <rect
        x="1.5"
        y="1.5"
        width="61"
        height="61"
        rx="15.5"
        stroke={`url(#${stroke})`}
        strokeOpacity="0.35"
      />
      <ellipse
        cx="32"
        cy="32"
        rx="25"
        ry="10"
        transform="rotate(-30 32 32)"
        stroke={`url(#${stroke})`}
        strokeOpacity="0.45"
        strokeWidth="1.5"
        strokeDasharray="30 6 4 6"
      />
      <path
        d="M20 44V20L44 44V20"
        stroke={`url(#${stroke})`}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {[
        [20, 44],
        [20, 20],
        [44, 44],
        [44, 20],
      ].map(([cx, cy]) => (
        <circle
          key={`${cx}-${cy}`}
          cx={cx}
          cy={cy}
          r="4.5"
          fill="#070b14"
          stroke={`url(#${stroke})`}
          strokeWidth="2.5"
        />
      ))}
      <circle cx="44" cy="20" r="1.75" fill="#e6edf7" />
    </svg>
  );
}

/** Mark plus wordmark. The text is real text, so it scales crisply and screen readers read it. */
export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      <span className="text-[1.05em] leading-none font-semibold tracking-tight text-nx-text">
        Nexus{" "}
        <span className="bg-gradient-to-r from-nx-teal to-nx-blue bg-clip-text font-medium text-transparent">
          Cloud
        </span>
      </span>
    </span>
  );
}
