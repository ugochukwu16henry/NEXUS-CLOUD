/**
 * Accepts only same-site relative paths, so `?next=` parameters cannot send users to another site
 * (open redirect). Anything else falls back to the given default.
 */
export function safeRedirectPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  // Control characters (tab, newline) can be stripped by browsers to form `//host`.
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return fallback;
  }
  return value;
}
