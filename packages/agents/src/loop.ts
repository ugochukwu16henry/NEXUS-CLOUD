/** Stop conditions for a coding run. The iteration cap ends the loop even if the model keeps going. */

export type LoopStep = {
  costUsdMicros: number;
  done?: boolean;
  /** Set when the policy wants the owner to decide before the loop continues. */
  approval?: boolean;
  denied?: boolean;
};

export type LoopStatus = "done" | "capped" | "budget" | "cancelled" | "approval" | "denied";

export type LoopResult = {
  status: LoopStatus;
  iterations: number;
  spentUsdMicros: number;
};

export async function runAgentLoop(options: {
  maxIterations: number;
  budgetUsdMicros: number;
  spentUsdMicros?: number;
  signal?: AbortSignal;
  step: (iteration: number) => Promise<LoopStep>;
}): Promise<LoopResult> {
  let spent = options.spentUsdMicros ?? 0;
  let iteration = 0;
  while (iteration < options.maxIterations) {
    if (options.signal?.aborted) {
      return { status: "cancelled", iterations: iteration, spentUsdMicros: spent };
    }
    if (spent >= options.budgetUsdMicros) {
      return { status: "budget", iterations: iteration, spentUsdMicros: spent };
    }
    iteration += 1;
    const result = await options.step(iteration);
    spent += result.costUsdMicros;
    if (result.denied) return { status: "denied", iterations: iteration, spentUsdMicros: spent };
    if (result.approval)
      return { status: "approval", iterations: iteration, spentUsdMicros: spent };
    if (options.signal?.aborted) {
      return { status: "cancelled", iterations: iteration, spentUsdMicros: spent };
    }
    if (result.done) return { status: "done", iterations: iteration, spentUsdMicros: spent };
    if (spent >= options.budgetUsdMicros) {
      return { status: "budget", iterations: iteration, spentUsdMicros: spent };
    }
  }
  return { status: "capped", iterations: iteration, spentUsdMicros: spent };
}
