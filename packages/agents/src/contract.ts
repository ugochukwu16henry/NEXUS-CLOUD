/** What must be true before an agent run is allowed to start (Sprint 6). */

export const AGENT_TOOLS = ["read_file", "search", "write_file", "run_command"] as const;
export type AgentTool = (typeof AGENT_TOOLS)[number];

export type AgentContract = {
  purpose: string;
  context: string;
  expectedOutput: string;
  budgetUsdMicros: number;
  maxIterations: number;
  stopCondition: string;
  allowedTools: AgentTool[];
};

export type ContractResult =
  | { ok: true; contract: AgentContract }
  | { ok: false; reason: "missing_budget" | "missing_stop" | "missing_purpose" | "bad_tools" };

const MAX_PURPOSE = 4000;

export function validateContract(input: Partial<AgentContract>): ContractResult {
  const purpose = input.purpose?.trim() ?? "";
  if (!purpose || purpose.length > MAX_PURPOSE) return { ok: false, reason: "missing_purpose" };
  if (input.budgetUsdMicros === undefined || input.budgetUsdMicros <= 0) {
    return { ok: false, reason: "missing_budget" };
  }
  const stop = input.stopCondition?.trim() ?? "";
  if (!stop) return { ok: false, reason: "missing_stop" };
  const tools = input.allowedTools ?? [];
  if (tools.length === 0 || tools.some((tool) => !AGENT_TOOLS.includes(tool))) {
    return { ok: false, reason: "bad_tools" };
  }
  const maxIterations = input.maxIterations ?? 8;
  if (maxIterations < 1 || maxIterations > 30) return { ok: false, reason: "missing_stop" };
  return {
    ok: true,
    contract: {
      purpose,
      context: input.context?.trim() ?? "",
      expectedOutput: input.expectedOutput?.trim() || "A reviewable diff inside the task worktree.",
      budgetUsdMicros: input.budgetUsdMicros,
      maxIterations,
      stopCondition: stop,
      allowedTools: tools,
    },
  };
}
