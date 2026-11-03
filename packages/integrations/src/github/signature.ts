import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * GitHub signs every webhook body with HMAC-SHA256 of the webhook secret and sends it as
 * `X-Hub-Signature-256: sha256=<hex>` (threat model T06). The check runs on the exact bytes
 * received, before the body is parsed, and compares in constant time.
 */
export function verifyGitHubSignature(
  secret: string,
  body: Uint8Array,
  header: string | null | undefined,
): boolean {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const hex = header.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(hex)) return false;
  const given = Buffer.from(hex, "hex");
  const expected = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(given, expected);
}

/** Produces the header GitHub would send; used by tests and the local fake GitHub. */
export function signGitHubPayload(secret: string, body: Uint8Array | string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}
