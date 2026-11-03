import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { inTransaction, PG_POOL } from "../db/db";
import { WalletService } from "../wallet/wallet.service";
import { PAYSTACK_CLIENT, type PaystackApi } from "./paystack.client";

/** Smallest top-up: the N500 Starter bundle. */
export const MIN_TOPUP_KOBO = 50_000;

export type ConfirmOutcome = "credited" | "duplicate" | "failed" | "pending" | "unknown_reference";

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(PAYSTACK_CLIENT) private readonly paystack: PaystackApi,
    @Inject(WalletService) private readonly wallet: WalletService,
  ) {}

  /** Records a pending top-up and returns the Paystack checkout link. */
  async startPaystackTopup(
    userId: string,
    order: { bundleCode: string } | { amountKobo: number },
  ): Promise<{ reference: string; authorizationUrl: string }> {
    const { rows: users } = await this.pool.query("SELECT email FROM users WHERE id = $1", [
      userId,
    ]);
    if (users.length === 0) throw new NotFoundException("user not found");
    if (!users[0].email)
      throw new BadRequestException("add an email address before paying with Paystack");

    let bundleCode: string | null = null;
    let amountKobo: number;
    let creditKobo: number;
    if ("bundleCode" in order) {
      const { rows } = await this.pool.query(
        "SELECT code, price_kobo, credit_kobo FROM bundles WHERE code = $1 AND active",
        [order.bundleCode],
      );
      if (rows.length === 0) throw new NotFoundException(`unknown bundle ${order.bundleCode}`);
      bundleCode = rows[0].code;
      amountKobo = rows[0].price_kobo;
      creditKobo = rows[0].credit_kobo;
    } else {
      if (!Number.isSafeInteger(order.amountKobo) || order.amountKobo < MIN_TOPUP_KOBO) {
        throw new BadRequestException(`the smallest top-up is ${MIN_TOPUP_KOBO / 100} Naira`);
      }
      amountKobo = creditKobo = order.amountKobo;
    }

    const reference = `ZX-${randomUUID()}`;
    await this.pool.query(
      `INSERT INTO payments (user_id, gateway, gateway_reference, bundle_code, amount_kobo, credit_kobo)
       VALUES ($1, 'paystack', $2, $3, $4, $5)`,
      [userId, reference, bundleCode, amountKobo, creditKobo],
    );
    const { authorizationUrl } = await this.paystack.initialize({
      email: users[0].email,
      amountKobo,
      reference,
    });
    return { reference, authorizationUrl };
  }

  /**
   * Credits the wallet once Paystack's own verify call confirms the payment.
   * Called from the webhook; never trust the browser. Safe to call repeatedly.
   */
  async confirmPaystackPayment(reference: string): Promise<ConfirmOutcome> {
    const known = await this.pool.query(
      "SELECT status FROM payments WHERE gateway_reference = $1",
      [reference],
    );
    if (known.rows.length === 0) return "unknown_reference";
    if (known.rows[0].status !== "pending") return "duplicate";

    const tx = await this.paystack.verify(reference); // outside any transaction

    return inTransaction(this.pool, async (client) => {
      const { rows } = await client.query(
        `SELECT id, user_id, amount_kobo, credit_kobo, status FROM payments
         WHERE gateway_reference = $1 FOR UPDATE`,
        [reference],
      );
      const payment = rows[0];
      if (payment.status !== "pending") return "duplicate";

      if (tx.status !== "success") {
        if (tx.status === "failed" || tx.status === "abandoned" || tx.status === "reversed") {
          await client.query(
            `UPDATE payments SET status = 'failed', verified_at = now() WHERE id = $1`,
            [payment.id],
          );
          return "failed";
        }
        return "pending";
      }
      if (tx.amount !== payment.amount_kobo || tx.currency !== "NGN") {
        this.logger.error(
          `payment ${reference}: Paystack reports ${tx.amount} ${tx.currency}, expected ${payment.amount_kobo} NGN`,
        );
        await client.query(
          `UPDATE payments SET status = 'failed', verified_at = now() WHERE id = $1`,
          [payment.id],
        );
        return "failed";
      }

      await client.query(
        `UPDATE payments SET status = 'success', fee_kobo = $2, method = $3, verified_at = now() WHERE id = $1`,
        [payment.id, tx.fees, tx.channel],
      );
      await this.wallet.creditPayment(client, {
        id: payment.id,
        userId: payment.user_id,
        amountKobo: payment.amount_kobo,
        creditKobo: payment.credit_kobo,
      });
      return "credited";
    });
  }
}
