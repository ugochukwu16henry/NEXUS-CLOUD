/**
 * Redaction applied to everything that is logged or reported (threat model T21, NFR-01).
 * Sensitive keys are replaced whole; sensitive patterns inside strings are masked.
 */
export const REDACTED = "[REDACTED]";

// Matched against the key with case and separators removed, as an exact name or suffix, so
// `accessToken` and `client_secret` are caught but counters like `inputTokens` are not.
const SENSITIVE_KEY_SUFFIXES = [
  "password",
  "passwd",
  "secret",
  "token",
  "authorization",
  "authorisation",
  "apikey",
  "cookie",
  "servicerolekey",
  "privatekey",
  "jwt",
  "otp",
  "credential",
  "credentials",
];

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
  return SENSITIVE_KEY_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

const VALUE_PATTERNS: RegExp[] = [
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, // JWT
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, // Authorization header value
  /\bsk-ant-[A-Za-z0-9_-]{10,}/g, // Anthropic
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}/g, // OpenAI / DeepSeek style
  /\bxai-[A-Za-z0-9]{16,}/g, // xAI
  /\bAIza[0-9A-Za-z_-]{30,}/g, // Google
  /\bsb_secret_[A-Za-z0-9_-]{10,}/g, // Supabase secret key
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens
];

const EMAIL = /\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;

export function redactString(value: string): string {
  let out = value;
  for (const pattern of VALUE_PATTERNS) out = out.replace(pattern, REDACTED);
  // Keep the first letter and domain so logs stay useful for debugging.
  return out.replace(EMAIL, "$1***@$2");
}

export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack && redactString(value.stack),
    };
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, seen));

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isSensitiveKey(key) ? REDACTED : redact(item, seen),
    ]),
  );
}
