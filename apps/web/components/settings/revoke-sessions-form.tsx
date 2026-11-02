"use client";

import { useActionState } from "react";
import { revokeAllSessions } from "@/app/(cockpit)/settings/actions";
import { FormMessage } from "@/components/form-message";
import { IDLE_STATE } from "@/lib/action-state";

export function RevokeSessionsForm() {
  const [state, revoke, revoking] = useActionState(revokeAllSessions, IDLE_STATE);

  return (
    <form action={revoke} className="space-y-2">
      <button
        type="submit"
        disabled={revoking}
        className="rounded-md border border-nx-danger/60 px-3 py-1.5 text-sm text-nx-danger disabled:opacity-60"
      >
        Sign out everywhere
      </button>
      <p className="text-xs text-nx-muted">
        Signs out every device, including this one. Needs your authenticator code.
      </p>
      <FormMessage state={state} />
    </form>
  );
}
