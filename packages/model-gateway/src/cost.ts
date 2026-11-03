import type { CompletionUsage, GatewayMessage, Quote, TokenPrice } from "./types";

/** Tokens assumed per image when estimating, before the provider reports the real count. */
export const IMAGE_ESTIMATE_TOKENS = 1600;

export function countImages(messages: GatewayMessage[]): number {
  let images = 0;
  for (const message of messages) {
    if (typeof message.content === "string") continue;
    images += message.content.filter((part) => part.type === "image").length;
  }
  return images;
}

export function estimateInputTokens(messages: GatewayMessage[]): number {
  let chars = 0;
  for (const message of messages) {
    if (typeof message.content === "string") chars += message.content.length;
    else
      chars += message.content.reduce(
        (sum, part) => sum + (part.type === "text" ? part.text.length : 0),
        0,
      );
  }
  return Math.ceil(chars / 4) + countImages(messages) * IMAGE_ESTIMATE_TOKENS;
}

/** What we expect to be charged. Cached tokens are priced at the cache rate, never twice. */
export function costUsdMicros(
  price: TokenPrice,
  usage: Pick<CompletionUsage, "inputTokens" | "outputTokens" | "cachedTokens">,
): number {
  for (const [name, value] of [
    ["inputTokens", usage.inputTokens],
    ["outputTokens", usage.outputTokens],
    ["cachedTokens", usage.cachedTokens],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative integer`);
    }
  }
  const cached = Math.min(usage.cachedTokens, usage.inputTokens);
  const fresh = usage.inputTokens - cached;
  const micros =
    fresh * price.inputUsdMicrosPerMillion +
    cached * price.cachedInputUsdMicrosPerMillion +
    usage.outputTokens * price.outputUsdMicrosPerMillion;
  return Math.ceil(micros / 1_000_000);
}

export function quoteCost(
  price: TokenPrice,
  messages: GatewayMessage[],
  maxOutputTokens: number,
): Quote {
  const inputTokens = estimateInputTokens(messages);
  return {
    inputTokens,
    imageCount: countImages(messages),
    estimatedUsdMicros: costUsdMicros(price, {
      inputTokens,
      outputTokens: maxOutputTokens,
      cachedTokens: 0,
    }),
  };
}

/** "0.02" dollars → 20_000 micros, rounded half away from binary noise. */
export function usdToMicros(usd: number): number {
  if (!Number.isFinite(usd) || usd < 0) throw new RangeError("usd must be a non-negative number");
  return Math.round(usd * 1_000_000);
}

export function microsToUsd(micros: number): number {
  return micros / 1_000_000;
}
