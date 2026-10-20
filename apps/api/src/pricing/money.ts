// Pure money arithmetic. All Naira amounts are whole kobo; provider costs are
// millionths of a US dollar. Rates are in basis points (1% = 100 bp).

export const VAT_BP = 750; // 7.5%, included in every retail price
export const PAYMENT_FEE_BP = 150; // average gateway fee on top-ups
export const MIN_MARGIN_BP = 4000; // the dashboard flags products below 40%

export type Unit = 'second' | 'image' | '1m_tokens';

export interface ProductPrice {
  unit: Unit;
  costUsdMicros: number; // per unit; input tokens for text
  priceKobo: number; // per unit, VAT included; input tokens for text
  outputCostUsdMicros: number | null;
  outputPriceKobo: number | null;
}

/** Seconds of video, images, or tokens in and out. */
export interface Usage {
  units?: number;
  inputTokens?: number;
  outputTokens?: number;
}

const TOKENS_PER_UNIT = 1_000_000;

function nonNegativeInt(name: string, value: number | undefined): number {
  const n = value ?? 0;
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`${name} must be a non-negative integer`);
  return n;
}

function metered(perUnitIn: number, perUnitOut: number | null, product: ProductPrice, usage: Usage): number {
  if (product.unit === '1m_tokens') {
    const input = nonNegativeInt('inputTokens', usage.inputTokens);
    const output = nonNegativeInt('outputTokens', usage.outputTokens);
    return Math.ceil((input * perUnitIn + output * (perUnitOut ?? 0)) / TOKENS_PER_UNIT);
  }
  return nonNegativeInt('units', usage.units) * perUnitIn;
}

/** What the user pays, VAT included. Rounded up to the next kobo. */
export function retailKobo(product: ProductPrice, usage: Usage): number {
  return metered(product.priceKobo, product.outputPriceKobo, product, usage);
}

/** What the provider charges us. Rounded up to the next micro-dollar. */
export function costUsdMicros(product: ProductPrice, usage: Usage): number {
  return metered(product.costUsdMicros, product.outputCostUsdMicros, product, usage);
}

/** "1400.00" (NUMERIC from fx_rates) -> 140000 kobo per dollar, without float error. */
export function koboPerUsd(usdNgn: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(usdNgn.trim());
  if (!match) throw new RangeError(`invalid exchange rate: ${usdNgn}`);
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

export function usdMicrosToKobo(micros: number, koboPerDollar: number): number {
  return Math.ceil((micros * koboPerDollar) / 1_000_000);
}

export interface Margin {
  retailKobo: number;
  vatKobo: number;
  exVatKobo: number;
  feeKobo: number;
  costKobo: number;
  grossProfitKobo: number;
  marginBp: number; // gross profit / ex-VAT price
}

/** Margin on the price without VAT, after provider cost and the payment fee (plan section 6). */
export function margin(retail: number, costKobo: number): Margin {
  const exVatKobo = Math.round((retail * 10_000) / (10_000 + VAT_BP));
  const feeKobo = Math.round((retail * PAYMENT_FEE_BP) / 10_000);
  const grossProfitKobo = exVatKobo - costKobo - feeKobo;
  return {
    retailKobo: retail,
    vatKobo: retail - exVatKobo,
    exVatKobo,
    feeKobo,
    costKobo,
    grossProfitKobo,
    marginBp: exVatKobo === 0 ? 0 : Math.round((grossProfitKobo * 10_000) / exVatKobo),
  };
}

/** The request each product is priced around: a 5 s clip, one image, or 2,000 tokens in and 1,500 out. */
export function typicalUsage(unit: Unit): Usage {
  if (unit === 'second') return { units: 5 };
  if (unit === 'image') return { units: 1 };
  return { inputTokens: 2000, outputTokens: 1500 };
}
