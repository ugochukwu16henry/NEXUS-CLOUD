import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { APP_CONFIG, AppConfig, loadConfig } from './config';
import { createPool, PG_POOL } from './db/db';
import { HealthController } from './health.controller';
import { PaymentsService } from './payments/payments.service';
import { PAYSTACK_CLIENT, PaystackClient } from './payments/paystack.client';
import { PaystackWebhookController } from './payments/paystack-webhook.controller';
import { PricingController } from './pricing/pricing.controller';
import { PricingService } from './pricing/pricing.service';
import { WalletService } from './wallet/wallet.service';

@Module({
  controllers: [HealthController, PricingController, PaystackWebhookController],
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
    { provide: PG_POOL, inject: [APP_CONFIG], useFactory: (config: AppConfig) => createPool(config.databaseUrl) },
    { provide: PAYSTACK_CLIENT, useClass: PaystackClient },
    PricingService,
    WalletService,
    PaymentsService,
  ],
})
export class AppModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown() {
    await this.pool.end();
  }
}
