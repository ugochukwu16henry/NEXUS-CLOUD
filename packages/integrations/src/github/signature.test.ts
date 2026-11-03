import { generateKeyPairSync, createVerify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAppJwt, normalizePrivateKey } from "./app-jwt";
import { signGitHubPayload, verifyGitHubSignature } from "./signature";

const secret = "webhook-test-secret";
const body = new TextEncoder().encode('{"zen":"Keep it logically awesome."}');

describe("webhook signature (T06)", () => {
  it("accepts GitHub's signature over the exact body", () => {
    expect(verifyGitHubSignature(secret, body, signGitHubPayload(secret, body))).toBe(true);
  });

  it("rejects a tampered body", () => {
    const tampered = new TextEncoder().encode('{"zen":"Keep it logically awesome!"}');
    expect(verifyGitHubSignature(secret, tampered, signGitHubPayload(secret, body))).toBe(false);
  });

  it("rejects a signature made with another secret", () => {
    expect(verifyGitHubSignature(secret, body, signGitHubPayload("other-secret", body))).toBe(
      false,
    );
  });

  it.each([
    ["a missing header", null],
    ["an empty header", ""],
    ["the old SHA-1 header format", "sha1=0123456789abcdef0123456789abcdef01234567"],
    ["a truncated digest", "sha256=abcd"],
    ["a non-hex digest", `sha256=${"z".repeat(64)}`],
  ])("rejects %s", (_label, header) => {
    expect(verifyGitHubSignature(secret, body, header)).toBe(false);
  });

  it("never verifies when no secret is configured", () => {
    expect(verifyGitHubSignature("", body, signGitHubPayload("", body))).toBe(false);
  });
});

describe("GitHub App JWT", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

  it("is an RS256 token for the app, valid for under 10 minutes", () => {
    const jwt = createAppJwt("12345", pem, 1_800_000_000);
    const [header, payload, signature] = jwt.split(".");
    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({
      alg: "RS256",
      typ: "JWT",
    });
    const claims = JSON.parse(Buffer.from(payload!, "base64url").toString());
    expect(claims).toEqual({ iss: "12345", iat: 1_800_000_000 - 60, exp: 1_800_000_000 + 540 });
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(600);

    const valid = createVerify("RSA-SHA256")
      .update(`${header}.${payload}`)
      .verify(publicKey, Buffer.from(signature!, "base64url"));
    expect(valid).toBe(true);
  });

  it("restores line breaks in a one-line PEM from an env file", () => {
    expect(normalizePrivateKey(pem.replaceAll("\n", "\\n"))).toBe(pem);
    expect(normalizePrivateKey(pem)).toBe(pem);
  });
});
