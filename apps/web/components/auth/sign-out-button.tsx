"use client";

import { useActionState } from "react";
import { signOut } from "@/app/(cockpit)/actions";
import { FormMessage } from "@/components/form-message";
import { IDLE_STATE } from "@/lib/action-state";

export function SignOutButton({ className }: { className?: string }) {
  const [state, action, pending] = useActionState(signOut, IDLE_STATE);
  return (
    <form action={action}>
      <button type="submit" disabled={pending} className={className}>
        Sign out
      </button>
      <FormMessage state={state} />
    </form>
  );
}
