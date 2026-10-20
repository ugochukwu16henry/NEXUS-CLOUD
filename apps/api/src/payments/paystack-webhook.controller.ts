import {
  Controller,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { APP_CONFIG, AppConfig } from '../config';
import { isValidPaystackSignature } from './paystack.client';
import { PaymentsService } from './payments.service';

@Controller('webhooks/paystack')
export class PaystackWebhookController {
  private readonly logger = new Logger(PaystackWebhookController.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly payments: PaymentsService,
  ) {}

  @Post()
  @HttpCode(200)
  async handle(@Req() req: RawBodyRequest<Request>, @Headers('x-paystack-signature') signature?: string) {
    if (!req.rawBody || !isValidPaystackSignature(req.rawBody, signature, this.config.paystackSecretKey)) {
      throw new UnauthorizedException('invalid signature');
    }
    const event = JSON.parse(req.rawBody.toString('utf8'));
    if (event.event === 'charge.success' && typeof event.data?.reference === 'string') {
      const outcome = await this.payments.confirmPaystackPayment(event.data.reference);
      this.logger.log(`paystack ${event.data.reference}: ${outcome}`);
    }
    return { received: true };
  }
}
