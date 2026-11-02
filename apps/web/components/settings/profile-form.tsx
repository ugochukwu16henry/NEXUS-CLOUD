"use client";

import { useActionState } from "react";
import { updateProfile } from "@/app/(cockpit)/settings/actions";
import { FormMessage } from "@/components/form-message";
import { IDLE_STATE } from "@/lib/action-state";

export function ProfileForm({ email, displayName }: { email: string; displayName: string | null }) {
  const [state, save, saving] = useActionState(updateProfile, IDLE_STATE);

  return (
    <form action={save} className="max-w-md space-y-3">
      <div>
        <p className="text-sm font-medium">Email</p>
        <p className="text-sm text-nx-muted">{email}</p>
      </div>
      <label htmlFor="displayName" className="block text-sm font-medium">
        Display name
      </label>
      <input
        id="displayName"
        name="displayName"
        defaultValue={displayName ?? ""}
        maxLength={80}
        className="w-full rounded-md border border-nx-border bg-nx-bg px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-nx-teal px-3 py-1.5 text-sm font-semibold text-nx-bg disabled:opacity-60"
      >
        Save
      </button>
      <FormMessage state={state} />
    </form>
  );
}
