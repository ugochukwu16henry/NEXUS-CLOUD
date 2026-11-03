/** Hard stop at 100% of each cap. Warnings fire when the projected spend crosses a threshold. */

export const BUDGET_SCOPES = ["run", "project", "global"] as const;
export type BudgetScope = (typeof BUDGET_SCOPES)[number];
export type WarningPercent = 50 | 75 | 90;

export type ScopeBudget = {
  spentUsdMicros: number;
  limitUsdMicros: number;
  /** The owner lifted the stop; calls may pass the cap until it lapses. */
  extended: boolean;
};

export type BudgetSnapshot = Record<BudgetScope, ScopeBudget>;

export type BudgetWarning = { scope: BudgetScope; percent: WarningPercent };

const LARGE_CONTEXT_TOKENS = 100_000;
const IMAGE_BATCH = 8;
const LONG_LOOP = 5;

export class BudgetExceededError extends Error {
  constructor(
    readonly scope: BudgetScope,
    readonly limitUsdMicros: number,
    readonly projectedUsdMicros: number,
  ) {
    super(`budget hard stop: ${scope}`);
    this.name = "BudgetExceededError";
  }
}

export class ExpensiveActionRequiredError extends Error {
  constructor(readonly reason: "large_context" | "image_batch" | "long_loop") {
    super(`expensive action needs confirmation: ${reason}`);
    this.name = "ExpensiveActionRequiredError";
  }
}

export function evaluateBudget(input: {
  snapshot: BudgetSnapshot;
  estimatedUsdMicros: number;
  inputTokens: number;
  imageCount: number;
  loopIterations?: number;
  allowExpensive?: boolean;
}): { warnings: BudgetWarning[] } {
  if (!input.allowExpensive) {
    if ((input.loopIterations ?? 0) >= LONG_LOOP)
      throw new ExpensiveActionRequiredError("long_loop");
    if (input.imageCount >= IMAGE_BATCH) throw new ExpensiveActionRequiredError("image_batch");
    if (input.inputTokens >= LARGE_CONTEXT_TOKENS) {
      throw new ExpensiveActionRequiredError("large_context");
    }
  }

  const warnings: BudgetWarning[] = [];
  for (const scope of BUDGET_SCOPES) {
    const budget = input.snapshot[scope];
    const projected = budget.spentUsdMicros + input.estimatedUsdMicros;
    if (budget.limitUsdMicros <= 0 || projected >= budget.limitUsdMicros) {
      if (!budget.extended) throw new BudgetExceededError(scope, budget.limitUsdMicros, projected);
      continue;
    }
    const ratio = projected / budget.limitUsdMicros;
    const percent: WarningPercent | null =
      ratio >= 0.9 ? 90 : ratio >= 0.75 ? 75 : ratio >= 0.5 ? 50 : null;
    if (percent) warnings.push({ scope, percent });
  }
  return { warnings };
}

/** A snapshot where only one scope can possibly trip, for boundary tests. */
export function singleScope(
  scope: BudgetScope,
  spentUsdMicros: number,
  limitUsdMicros: number,
): BudgetSnapshot {
  const open = { spentUsdMicros: 0, limitUsdMicros: 1_000_000_000, extended: false };
  return {
    run: { ...open },
    project: { ...open },
    global: { ...open },
    [scope]: { spentUsdMicros, limitUsdMicros, extended: false },
  };
}
