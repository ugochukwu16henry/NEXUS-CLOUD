import { Controller, Get } from '@nestjs/common';
import { PricingService } from './pricing.service';

@Controller('products')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  /** Public price list. Costs and margins stay on the Owner Dashboard. */
  @Get()
  async list() {
    const products = await this.pricing.listProducts();
    return products
      .filter((p) => p.active)
      .map((p) => ({
        code: p.code,
        workspace: p.workspace,
        unit: p.unit,
        priceKobo: p.priceKobo,
        outputPriceKobo: p.outputPriceKobo,
      }));
  }
}
