// Fails if the browser bundle contains server-only env names, their values, or provider key patterns.
// Threat model T03 / NFR-01. Run after `pnpm build`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const STATIC_DIR = "apps/web/.next/static";

const SERVER_ONLY_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "XAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "DEEPSEEK_API_KEY",
];

const KEY_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{20,}/, // Anthropic
  /sk-(proj-)?[A-Za-z0-9]{32,}/, // OpenAI / DeepSeek style
  /xai-[A-Za-z0-9]{32,}/, // xAI
  /AIza[0-9A-Za-z_-]{35}/, // Google
  /"role"\s*:\s*"service_role"/, // decoded Supabase service-role JWT payload
];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

let files;
try {
  files = walk(STATIC_DIR).filter((f) => /\.(js|css|html|json)$/.test(f));
} catch {
  console.error(`No bundle at ${STATIC_DIR}. Run "pnpm build" first.`);
  process.exit(1);
}

const secretValues = SERVER_ONLY_NAMES.map((name) => process.env[name]).filter(
  (value) => value && value.length >= 8,
);

const problems = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const name of SERVER_ONLY_NAMES) {
    if (text.includes(name)) problems.push(`${file}: contains env name ${name}`);
  }
  for (const value of secretValues) {
    if (text.includes(value)) problems.push(`${file}: contains a server-only secret value`);
  }
  for (const pattern of KEY_PATTERNS) {
    if (pattern.test(text)) problems.push(`${file}: matches key pattern ${pattern}`);
  }
}

if (problems.length) {
  console.error("Server-only secrets found in browser bundle:\n" + problems.join("\n"));
  process.exit(1);
}
console.log(`Bundle secret check passed (${files.length} files scanned).`);
