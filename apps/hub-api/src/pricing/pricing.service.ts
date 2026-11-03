import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Pool } from "pg";
import { PG_POOL } from "../db/db";
import {
  costUsdMicros,
  koboPerUsd,
  margin,
  type Margin,
  MIN_MARGIN_BP,
  type ProductPrice,
  retailKobo,
  typicalUsage,
  type Unit,
  usdMicrosToKobo,
  type Usage,
} from "@nexus/money";

export interface Product extends ProductPrice {
  code: string;
  provider: "xai" | "groq" | "gemini";
  model: string;
  workspace: "studio" | "console" | "academy";
  active: boolean;
}

export interface FxRate {
  id: number;
  usdNgn: string;
  koboPerUsd: number;
}

export interface Quote {
  productCode: string;
  usage: Usage;
  quotedKobo: number;
  estimatedCostUsdMicros: number;
  fxRateId: number;
}

export interface MarginRow extends Margin {
  productCode: string;
  model: string;
  belowMinimum: boolean;
}

const PRODUCT_COLUMNS = `code, provider, model, workspace, unit, active,
  cost_usd_micros, price_kobo, output_cost_usd_micros, output_price_kobo`;

// Column types follow the migrations; BIGINT arrives as a number (src/db/db.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a pg row, mapped field by field
function toProduct(row: any): Product {
  return {
    code: row.code,
    provider: row.provider,
    model: row.model,
    workspace: row.workspace,
    unit: row.unit as Unit,
    active: row.active,
    costUsdMicros: row.cost_usd_micros,
    priceKobo: row.price_kobo,
    outputCostUsdMicros: row.output_cost_usd_micros,
    outputPriceKobo: row.output_price_kobo,
  };
}

@Injectable()
export class PricingService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listProducts(): Promise<Product[]> {
    const { rows } = await this.pool.query(
      `SELECT ${PRODUCT_COLUMNS} FROM products ORDER BY workspace, code`,
    );
    return rows.map(toProduct);
  }

  async getActiveProduct(code: string): Promise<Product> {
    const { rows } = await this.pool.query(
      `SELECT ${PRODUCT_COLUMNS} FROM products WHERE code = $1 AND active`,
      [code],
    );
    if (rows.length === 0) throw new NotFoundException(`unknown product ${code}`);
    return toProduct(rows[0]);
  }

  async currentFxRate(): Promise<FxRate> {
    const { rows } = await this.pool.query(
      `SELECT id, usd_ngn::text AS usd_ngn FROM fx_rates
       WHERE effective_from <= now() ORDER BY effective_from DESC, id DESC LIMIT 1`,
    );
    if (rows.length === 0) throw new Error("no exchange rate configured");
    return { id: rows[0].id, usdNgn: rows[0].usd_ngn, koboPerUsd: koboPerUsd(rows[0].usd_ngn) };
  }

  /** The price shown before "Generate"; this amount is held from the wallet. */
  async quote(productCode: string, usage: Usage): Promise<Quote> {
    const [product, fx] = await Promise.all([
      this.getActiveProduct(productCode),
      this.currentFxRate(),
    ]);
    const quotedKobo = retailKobo(product, usage);
    if (quotedKobo <= 0) throw new RangeError("nothing to charge for");
    return {
      productCode,
      usage,
      quotedKobo,
      estimatedCostUsdMicros: costUsdMicros(product, usage),
      fxRateId: fx.id,
    };
  }

  /** Margin per product on a typical request, for the Owner Dashboard's pricing control. */
  async marginReport(): Promise<MarginRow[]> {
    const [products, fx] = await Promise.all([this.listProducts(), this.currentFxRate()]);
    return products.map((product) => {
      const usage = typicalUsage(product.unit);
      const cost = usdMicrosToKobo(costUsdMicros(product, usage), fx.koboPerUsd);
      const m = margin(retailKobo(product, usage), cost);
      return {
        productCode: product.code,
        model: product.model,
        ...m,
        belowMinimum: m.marginBp < MIN_MARGIN_BP,
      };
    });
  }
}
