import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PaymentsService } from '../src/payments/payments.service';
import { TEST_DATABASE_URL } from './helpers';

const SECRET = 'sk_test_e2e';

describe('HTTP API', () => {
  let app: INestApplication;
  const confirmed: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.PAYSTACK_SECRET_KEY = SECRET;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PaymentsService)
      .useValue({ confirmPaystackPayment: async (ref: string) => (confirmed.push(ref), 'credited') })
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
  });
  afterAll(() => app.close());

  it('reports health', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
  });

  it('lists public prices without costs', async () => {
    const res = await request(app.getHttpServer()).get('/products').expect(200);
    expect(res.body).toContainEqual({
      code: 'video_standard',
      workspace: 'studio',
      unit: 'second',
      priceKobo: 18_000,
      outputPriceKobo: null,
    });
    expect(JSON.stringify(res.body)).not.toContain('cost');
  });

  describe('POST /webhooks/paystack', () => {
    const body = JSON.stringify({ event: 'charge.success', data: { reference: 'ZX-123' } });
    const sign = (payload: string, secret = SECRET) => createHmac('sha512', secret).update(payload).digest('hex');
    const post = () =>
      request(app.getHttpServer()).post('/webhooks/paystack').set('Content-Type', 'application/json');

    it('accepts a correctly signed event', async () => {
      await post().set('x-paystack-signature', sign(body)).send(body).expect(200);
      expect(confirmed).toEqual(['ZX-123']);
    });

    it('rejects a missing or forged signature', async () => {
      await post().send(body).expect(401);
      await post().set('x-paystack-signature', sign(body, 'wrong-key')).send(body).expect(401);
      await post().set('x-paystack-signature', 'not-hex').send(body).expect(401);
      expect(confirmed).toEqual(['ZX-123']);
    });
  });
});
