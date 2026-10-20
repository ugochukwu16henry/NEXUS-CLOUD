import { costUsdMicros, koboPerUsd, margin, ProductPrice, retailKobo, usdMicrosToKobo } from './money';

const videoStandard: ProductPrice = {
  unit: 'second',
  costUsdMicros: 50_000,
  priceKobo: 18_000,
  outputCostUsdMicros: null,
  outputPriceKobo: null,
};

const studentText: ProductPrice = {
  unit: '1m_tokens',
  costUsdMicros: 75_000,
  priceKobo: 125_000,
  outputCostUsdMicros: 300_000,
  outputPriceKobo: 500_000,
};

describe('money', () => {
  it('prices video per second', () => {
    expect(retailKobo(videoStandard, { units: 5 })).toBe(90_000); // N900
    expect(costUsdMicros(videoStandard, { units: 5 })).toBe(250_000); // $0.25
  });

  it('meters text by tokens, rounding up to the next kobo', () => {
    expect(retailKobo(studentText, { inputTokens: 2000, outputTokens: 1500 })).toBe(1000); // N10
    expect(retailKobo(studentText, { inputTokens: 1, outputTokens: 0 })).toBe(1);
    expect(costUsdMicros(studentText, { inputTokens: 2000, outputTokens: 1500 })).toBe(600);
  });

  it('rejects negative or fractional usage', () => {
    expect(() => retailKobo(videoStandard, { units: -1 })).toThrow(RangeError);
    expect(() => retailKobo(studentText, { inputTokens: 1.5 })).toThrow(RangeError);
  });

  it('parses exchange rates exactly', () => {
    expect(koboPerUsd('1400.00')).toBe(140_000);
    expect(koboPerUsd('1330.5')).toBe(133_050);
    expect(koboPerUsd('1400')).toBe(140_000);
    expect(() => koboPerUsd('1,400')).toThrow(RangeError);
    expect(usdMicrosToKobo(250_000, 140_000)).toBe(35_000); // $0.25 -> N350
  });

  it('works out margin after VAT and the payment fee, as in plan section 6', () => {
    const m = margin(90_000, 35_000); // Video Standard 5 s
    expect(m.exVatKobo).toBe(83_721);
    expect(m.feeKobo).toBe(1_350);
    expect(m.grossProfitKobo).toBe(47_371); // about N474
    expect(Math.round(m.marginBp / 100)).toBe(57);
  });
});
