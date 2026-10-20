import { Pool } from 'pg';
import { PricingService } from '../src/pricing/pricing.service';
import { testPool } from './helpers';

describe('PricingService (seeded launch prices)', () => {
  let pool: Pool;
  let pricing: PricingService;

  beforeAll(() => {
    pool = testPool();
    pricing = new PricingService(pool);
  });
  afterAll(() => pool.end());

  it('matches the margins in plan section 6 and none is below 40%', async () => {
    const report = await pricing.marginReport();
    const percent = Object.fromEntries(report.map((r) => [r.productCode, Math.round(r.marginBp / 100)]));
    expect(percent).toEqual({
      video_lite: 65,
      video_standard: 57,
      video_premium: 58,
      image_standard: 68,
      image_hd: 68,
      text_student: 89,
      text_dev: 89,
      text_dev_pro: 83,
      text_expert: 79,
    });
    expect(report.filter((r) => r.belowMinimum)).toEqual([]);
  });

  it('quotes a typical request at the plan price', async () => {
    const naira = async (code: string, usage: object) => (await pricing.quote(code, usage)).quotedKobo / 100;
    const text = { inputTokens: 2000, outputTokens: 1500 };
    expect(await naira('video_standard', { units: 5 })).toBe(900);
    expect(await naira('image_hd', { units: 1 })).toBe(200);
    expect(await naira('text_student', text)).toBe(10);
    expect(await naira('text_dev', text)).toBe(20);
    expect(await naira('text_dev_pro', text)).toBe(50);
    expect(await naira('text_expert', text)).toBe(100);
  });

  it('flags a product when the exchange rate moves against us', async () => {
    await pool.query(`INSERT INTO fx_rates (usd_ngn) VALUES (2600.00)`);
    try {
      const flagged = (await pricing.marginReport()).filter((r) => r.belowMinimum).map((r) => r.productCode);
      expect(flagged).toEqual(expect.arrayContaining(['video_standard']));
    } finally {
      await pool.query(`DELETE FROM fx_rates WHERE usd_ngn = 2600.00`);
    }
  });
});
