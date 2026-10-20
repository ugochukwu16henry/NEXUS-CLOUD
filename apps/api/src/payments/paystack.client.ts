import { Inject, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { APP_CONFIG, AppConfig } from '../config';

export const PAYSTACK_CLIENT = Symbol('PAYSTACK_CLIENT');

export interface PaystackTransaction {
  reference: string;
  status: string; // success | failed | abandoned | ongoing | pending ...
  amount: number; // kobo
  currency: string;
  fees: number | null; // kobo
  channel: string | null; // card | bank_transfer | ussd | ...
}

export interface PaystackApi {
  initialize(input: { email: string; amountKobo: number; reference: string }): Promise<{ authorizationUrl: string }>;
  verify(reference: string): Promise<PaystackTransaction>;
}

/** Paystack signs each webhook body with HMAC-SHA512 of the secret key (x-paystack-signature). */
export function isValidPaystackSignature(rawBody: Buffer, signature: string | undefined, secretKey: string): boolean {
  if (!signature) return false;
  const expected = createHmac('sha512', secretKey).update(rawBody).digest();
  const given = Buffer.from(signature, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

@Injectable()
export class PaystackClient implements PaystackApi {
  private readonly baseUrl = 'https://api.paystack.co';

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async initialize(input: { email: string; amountKobo: number; reference: string }) {
    const data = await this.request('POST', '/transaction/initialize', {
      email: input.email,
      amount: input.amountKobo,
      currency: 'NGN',
      reference: input.reference,
    });
    return { authorizationUrl: data.authorization_url as string };
  }

  async verify(reference: string): Promise<PaystackTransaction> {
    const data = await this.request('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
    return {
      reference: data.reference,
      status: data.status,
      amount: data.amount,
      currency: data.currency,
      fees: data.fees ?? null,
      channel: data.channel ?? null,
    };
  }

  private async request(method: string, path: string, body?: unknown): Promise<any> {
    const res = await fetch(this.baseUrl + path, {
      method,
      headers: { Authorization: `Bearer ${this.config.paystackSecretKey}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json?.status) {
      throw new Error(`Paystack ${method} ${path} failed: ${res.status} ${json?.message ?? ''}`.trim());
    }
    return json.data;
  }
}
