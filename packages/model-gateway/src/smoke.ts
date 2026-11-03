import { createAnthropicAdapter } from "./adapters/anthropic";
import { createOpenAiAdapter } from "./adapters/openai";
import { createStaffGateway } from "./complete";
import { PROVISIONAL_FALLBACKS, PROVISIONAL_ROUTES } from "./prices";
import { usdToMicros } from "./cost";

/**
 * Nightly contract check: one tiny prompt per configured provider, under a hard cap.
 * Exits 0 when no keys are set so the schedule stays green until an account is funded.
 */
const cap = usdToMicros(Number(process.env.NEXUS_SMOKE_MAX_USD ?? "0.02"));
const openai = process.env.OPENAI_API_KEY;
const anthropic = process.env.ANTHROPIC_API_KEY;

if (!openai && !anthropic) {
  console.log("model smoke skipped: OPENAI_API_KEY and ANTHROPIC_API_KEY are unset");
  process.exit(0);
}

const adapters = [
  ...(openai ? [createOpenAiAdapter({ apiKey: openai })] : []),
  ...(anthropic ? [createAnthropicAdapter({ apiKey: anthropic })] : []),
];

const gateway = createStaffGateway({
  adapters,
  routes: { ...PROVISIONAL_ROUTES },
  fallbacks: [...PROVISIONAL_FALLBACKS],
  allowed: new Set(adapters.map((adapter) => adapter.id)),
  allowFallback: false,
  budget: {
    run: { spentUsdMicros: 0, limitUsdMicros: cap, extended: false },
    project: { spentUsdMicros: 0, limitUsdMicros: cap, extended: false },
    global: { spentUsdMicros: 0, limitUsdMicros: cap, extended: false },
  },
  onUsage: (record) => {
    const line = JSON.stringify({
      ...record,
      providerRequestId: record.providerRequestId ? "set" : null,
    });
    if (openai && line.includes(openai)) throw new Error("smoke log contains the OpenAI key");
    if (anthropic && line.includes(anthropic))
      throw new Error("smoke log contains the Anthropic key");
    console.log(line);
  },
});

const taskKind = openai ? "routine" : "planning";
const result = await gateway.complete({
  taskKind,
  messages: [{ role: "user", content: "Reply with the single word ok." }],
  maxOutputTokens: 16,
});
if (result.costUsdMicros > cap) {
  throw new Error(`smoke spent ${result.costUsdMicros} micros, cap is ${cap}`);
}
console.log(`model smoke ok: ${result.provider}/${result.model}`);
