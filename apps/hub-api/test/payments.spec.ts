import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { Pool } from "pg";
import { PaymentsService } from "../src/payments/payments.service";
import type { PaystackApi, PaystackTransaction } from "../src/payments/paystack.client";
import { WalletService } from "../src/wallet/wallet.service";
import { createUser, resetData, testPool } from "./helpers";

class FakePaystack implements PaystackApi {
  transactions = new Map<string, PaystackTransaction>();
  verifyCalls = 0;

  async initialize(input: { email: string; amountKobo: number; reference: string }) {
    return { authorizationUrl: `https://checkout.paystack.test/${input.reference}` };
  }

  async verify(reference: string) {
    this.verifyCalls++;
    const tx = this.transactions.get(reference);
    if (!tx) throw new Error("not found");
    return tx;
  }

  pay(reference: string, amount: number, overrides: Partial<PaystackTransaction> = {}) {
    this.transactions.set(reference, {
      reference,
      status: "success",
      amount,
      currency: "NGN",
      fees: 0,
      channel: "bank_transfer",
      ...overrides,
    });
  }
}

describe("PaymentsService (Paystack)", () => {
  let pool: Pool;
  let wallet: WalletService;
  let paystack: FakePaystack;
  let payments: PaymentsService;
  let userId: string;

  beforeAll(() => {
    pool = testPool();
    wallet = new WalletService(pool);
  });
  beforeEach(async () => {
    await resetData(pool);
    paystack = new FakePaystack();
    payments = new PaymentsService(pool, paystack, wallet);
    userId = await createUser(pool);
  });
  afterEach(async () => expect(await wallet.findMismatches()).toEqual([]));
  afterAll(() => pool.end());

  it("credits a bundle with its bonus, once, however many webhooks arrive", async () => {
    const { reference, authorizationUrl } = await payments.startPaystackTopup(userId, {
      bundleCode: "creator",
    });
    expect(authorizationUrl).toContain(reference);
    paystack.pay(reference, 1_000_000);

    const outcomes = await Promise.all([
      payments.confirmPaystackPayment(reference),
      payments.confirmPaystackPayment(reference),
    ]);
    expect(outcomes.sort()).toEqual(["credited", "duplicate"]);
    expect(await payments.confirmPaystackPayment(reference)).toBe("duplicate");

    expect(await wallet.getWallet(userId)).toMatchObject({ balanceKobo: 1_100_000 }); // N10,000 -> N11,000
    const { rows } = await pool.query(
      "SELECT kind, amount_kobo FROM ledger_entries WHERE user_id = $1 ORDER BY kind",
      [userId],
    );
    expect(rows).toEqual([
      { kind: "topup", amount_kobo: 1_000_000 },
      { kind: "bonus", amount_kobo: 100_000 },
    ]);
  });

  it("refuses to credit when Paystack reports a different amount", async () => {
    const { reference } = await payments.startPaystackTopup(userId, { amountKobo: 500_000 });
    paystack.pay(reference, 50_000);
    expect(await payments.confirmPaystackPayment(reference)).toBe("failed");
    expect(await wallet.getWallet(userId)).toMatchObject({ balanceKobo: 0 });
  });

  it("waits on a payment that is still pending", async () => {
    const { reference } = await payments.startPaystackTopup(userId, { amountKobo: 50_000 });
    paystack.pay(reference, 50_000, { status: "ongoing" });
    expect(await payments.confirmPaystackPayment(reference)).toBe("pending");
    paystack.pay(reference, 50_000);
    expect(await payments.confirmPaystackPayment(reference)).toBe("credited");
  });

  it("ignores references it never issued", async () => {
    expect(await payments.confirmPaystackPayment("someone-elses-reference")).toBe(
      "unknown_reference",
    );
    expect(paystack.verifyCalls).toBe(0);
  });

  it("rejects top-ups under N500", async () => {
    await expect(payments.startPaystackTopup(userId, { amountKobo: 49_999 })).rejects.toThrow(
      "smallest top-up",
    );
  });
});
