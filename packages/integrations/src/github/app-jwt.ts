import { createSign } from "node:crypto";

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

/**
 * The GitHub App's own credential: an RS256 JWT signed with the app's private key, valid for at
 * most 10 minutes. It can only list installations and mint installation tokens; repository access
 * always goes through a short-lived installation token (threat model T08).
 */
export function createAppJwt(
  appId: string,
  privateKeyPem: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  // Back-dated 60 s for clock drift; 9 minutes keeps us under GitHub's 10-minute limit.
  const payload = base64url(
    JSON.stringify({ iat: nowSeconds - 60, exp: nowSeconds + 540, iss: appId }),
  );
  const signature = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(privateKeyPem);
  return `${header}.${payload}.${base64url(signature)}`;
}

/** Env files store the PEM on one line with literal "\n"; restore the line breaks. */
export function normalizePrivateKey(value: string): string {
  return value.includes("\\n") ? value.replaceAll("\\n", "\n") : value;
}
