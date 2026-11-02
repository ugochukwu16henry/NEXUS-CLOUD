import type { ActionState } from "@/lib/action-state";

/** Announces action results to screen readers; errors interrupt, confirmations wait. */
export function FormMessage({ state }: { state: ActionState }) {
  if (state.status === "idle" || !state.message) return null;
  const isError = state.status === "error";
  return (
    <p
      role={isError ? "alert" : "status"}
      className={`text-sm ${isError ? "text-nx-danger" : "text-nx-ok"}`}
    >
      {state.message}
    </p>
  );
}
