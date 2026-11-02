"use client";

import { useActionState } from "react";
import { verifyMfaChallenge } from "@/app/mfa/actions";
import { FormMessage } from "@/components/form-message";
import { IDLE_STATE } from "@/lib/action-state";

export function MfaChallengeForm({ next }: { next: string }) {
  const [state, verify, verifying] = useActionState(verifyMfaChallenge, IDLE_STATE);

  return (
    <form action={verify} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="mfa-code" className="block text-sm font-medium">
        Authentication code
      </label>
      <input
        id="mfa-code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        required
        className="w-full rounded-md border border-nx-border bg-nx-bg px-3 py-2 font-mono text-lg tracking-widest"
      />
      <button
        type="submit"
        disabled={verifying}
        className="w-full rounded-md bg-nx-teal px-3 py-2 text-sm font-semibold text-nx-bg disabled:opacity-60"
      >
        Verify
      </button>
      <FormMessage state={state} />
    </form>
  );
}
