// Fails if anything the browser receives contains server-only env names, their values, or provider
// key patterns. Threat model T03 / NFR-01. Run after `pnpm build`.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
// Single source of truth for which variables are server-only (Node 24 strips the TS types).
import { SERVER_ONLY_ENV_NAMES } from "../packages/config/src/env.ts";

const NEXT_DIR = process.argv[2] ?? "apps/web/.next";

// Client chunks, plus pre-rendered HTML and RSC payloads that are served to browsers as-is.
const SCAN_TARGETS = [
  { dir: join(NEXT_DIR, "static"), extensions: /\.(js|css|html|json)$/ },
  { dir: join(NEXT_DIR, "server", "app"), extensions: /\.(html|rsc|body)$/ },
];

const KEY_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{20,}/, // Anthropic
  /sk-(proj-)?[A-Za-z0-9]{32,}/, // OpenAI / DeepSeek style
  /xai-[A-Za-z0-9]{32,}/, // xAI
  /AIza[0-9A-Za-z_-]{35}/, // Google
  /sb_secret_[A-Za-z0-9_-]{20,}/, // Supabase secret key
  /"role"\s*:\s*"service_role"/, // decoded Supabase service-role JWT payload
];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

if (!existsSync(join(NEXT_DIR, "static"))) {
  console.error(`No build at ${NEXT_DIR}. Run "pnpm build" first.`);
  process.exit(1);
}

const files = SCAN_TARGETS.flatMap(({ dir, extensions }) =>
  existsSync(dir) ? walk(dir).filter((f) => extensions.test(f)) : [],
);

const secretValues = SERVER_ONLY_ENV_NAMES.map((name) => process.env[name]).filter(
  (value) => value && value.length >= 8,
);

// Whole names only: NEXT_PUBLIC_SENTRY_DSN (public by design) must not match SENTRY_DSN.
const isNameChar = (char) => char !== undefined && /[A-Za-z0-9_]/.test(char);
function containsName(text, name) {
  for (let i = text.indexOf(name); i !== -1; i = text.indexOf(name, i + 1)) {
    if (!isNameChar(text[i - 1]) && !isNameChar(text[i + name.length])) return true;
  }
  return false;
}

const problems = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const name of SERVER_ONLY_ENV_NAMES) {
    if (containsName(text, name)) problems.push(`${file}: contains env name ${name}`);
  }
  for (const value of secretValues) {
    if (text.includes(value)) problems.push(`${file}: contains a server-only secret value`);
  }
  for (const pattern of KEY_PATTERNS) {
    if (pattern.test(text)) problems.push(`${file}: matches key pattern ${pattern}`);
  }
}

if (problems.length) {
  console.error("Server-only secrets found in browser-facing output:\n" + problems.join("\n"));
  process.exit(1);
}
console.log(`Bundle secret check passed (${files.length} files scanned).`);
