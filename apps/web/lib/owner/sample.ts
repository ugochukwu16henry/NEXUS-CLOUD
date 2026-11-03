import {
  costUsdMicros,
  koboPerUsd,
  margin,
  MIN_MARGIN_BP,
  retailKobo,
  typicalUsage,
  usdMicrosToKobo,
  type ProductPrice,
} from "@nexus/money";

/**
 * Sample figures for the Owner Dashboard shell (harmonization sprint, ADR 0015). Hub Sprint 5
 * replaces them with reads from the Nexus AI Hub database. The products are the Hub's real launch
 * prices (apps/hub-api/supabase/migrations/20261013000002_seed_prices.sql), and their margins are
 * computed with the same `@nexus/money` code the Hub API charges with.
 */

export const PLANNING_RATE = "1400.00";

export const SAMPLE_KPIS = {
  signUps: 148,
  signUpsToppedUp: 31,
  topUpsKobo: 142_000_000,
  topUpPayments: 212,
  usageKobo: 118_000_000,
  owedToProvidersKobo: 40_200_000,
  owedUsdMicros: { xai: 241_000_000, groq: 46_000_000 },
  grossProfitKobo: 67_800_000,
  marginBp: 6200,
  failedJobsBp: 190,
} as const;

export const SAMPLE_PROVIDER_BALANCES = [
  { provider: "xAI", usdMicros: 412_000_000, daysLeft: 9 },
  { provider: "Groq", usdMicros: 96_000_000, daysLeft: 31 },
] as const;

/** Keep at least two weeks of provider usage prepaid (Hub plan, section 12). */
export const MIN_PREPAID_DAYS = 14;

type SampleProduct = ProductPrice & { name: string; workspace: "Studio" | "Console" | "Academy" };

const PRODUCTS: SampleProduct[] = [
  {
    name: "Video Lite · 5 s",
    workspace: "Studio",
    unit: "second",
    costUsdMicros: 20_000,
    priceKobo: 9_000,
    outputCostUsdMicros: null,
    outputPriceKobo: null,
  },
  {
    name: "Video Standard · 5 s",
    workspace: "Studio",
    unit: "second",
    costUsdMicros: 50_000,
    priceKobo: 18_000,
    outputCostUsdMicros: null,
    outputPriceKobo: null,
  },
  {
    name: "Video Premium · 5 s",
    workspace: "Studio",
    unit: "second",
    costUsdMicros: 80_000,
    priceKobo: 30_000,
    outputCostUsdMicros: null,
    outputPriceKobo: null,
  },
  {
    name: "Image HD",
    workspace: "Studio",
    unit: "image",
    costUsdMicros: 40_000,
    priceKobo: 20_000,
    outputCostUsdMicros: null,
    outputPriceKobo: null,
  },
  {
    name: "Developer request",
    workspace: "Console",
    unit: "1m_tokens",
    costUsdMicros: 150_000,
    priceKobo: 250_000,
    outputCostUsdMicros: 600_000,
    outputPriceKobo: 1_000_000,
  },
  {
    name: "Expert request",
    workspace: "Console",
    unit: "1m_tokens",
    costUsdMicros: 2_000_000,
    priceKobo: 1_538_500,
    outputCostUsdMicros: 6_000_000,
    outputPriceKobo: 4_615_000,
  },
  {
    name: "Student question",
    workspace: "Academy",
    unit: "1m_tokens",
    costUsdMicros: 75_000,
    priceKobo: 125_000,
    outputCostUsdMicros: 300_000,
    outputPriceKobo: 500_000,
  },
];

export type MarginRow = {
  name: string;
  workspace: string;
  retailKobo: number;
  marginBp: number;
  belowMinimum: boolean;
};

/** The margin guard: each product's margin on a typical request at the planning exchange rate. */
export function marginGuard(rate: string = PLANNING_RATE): MarginRow[] {
  const koboPerDollar = koboPerUsd(rate);
  return PRODUCTS.map((product) => {
    const usage = typicalUsage(product.unit);
    const retail = retailKobo(product, usage);
    const cost = usdMicrosToKobo(costUsdMicros(product, usage), koboPerDollar);
    const { marginBp } = margin(retail, cost);
    return {
      name: product.name,
      workspace: product.workspace,
      retailKobo: retail,
      marginBp,
      belowMinimum: marginBp < MIN_MARGIN_BP,
    };
  });
}
