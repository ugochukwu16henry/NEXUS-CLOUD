/**
 * The upload secret scan (T22, T31). Same idea as gitleaks in CI, applied before a file joins a
 * change set: a file that looks like a credential is held back until the owner decides. It errs
 * towards holding back; a false alarm costs one click, a leaked key costs a rotation.
 */

const SECRET_FILE_NAMES = [
  /^\.env(\..+)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)$/i,
  /^\.npmrc$/i,
  /^credentials(\.json)?$/i,
];
/** Templates that are meant to be committed. */
const SAFE_FILE_NAMES = [/^\.env\.(example|sample|template)$/i];

const SECRET_PATTERNS: [string, RegExp][] = [
  [
    "private key",
    /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY( BLOCK)?-----/,
  ],
  ["AWS access key", /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ["GitHub fine-grained token", /\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ["Slack token", /\bxox[abpors]-[A-Za-z0-9-]{10,}/],
  ["Stripe secret key", /\b[sr]k_live_[A-Za-z0-9]{20,}\b/],
  ["Paystack secret key", /\bsk_live_[a-f0-9]{30,}\b/],
  ["Anthropic key", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["OpenAI-style key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["Supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{20,}/],
  ["xAI key", /\bxai-[A-Za-z0-9]{32,}\b/],
];

export type SecretFinding = { reason: string };

/** Checks the file name, then the text (binary files are only judged by name). */
export function scanForSecrets(path: string, text: string | null): SecretFinding | null {
  const name = path.split("/").at(-1) ?? path;
  if (!SAFE_FILE_NAMES.some((pattern) => pattern.test(name))) {
    if (SECRET_FILE_NAMES.some((pattern) => pattern.test(name))) {
      return { reason: `${name} usually holds secrets` };
    }
  }
  if (text) {
    for (const [label, pattern] of SECRET_PATTERNS) {
      if (pattern.test(text)) return { reason: `looks like it contains a ${label}` };
    }
  }
  return null;
}
