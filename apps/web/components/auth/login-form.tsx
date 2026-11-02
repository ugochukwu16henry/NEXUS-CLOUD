"use client";

import { useActionState } from "react";
import { requestMagicLink, signInWithGitHub } from "@/app/login/actions";
import { IDLE_STATE } from "@/lib/action-state";
import { FormMessage } from "@/components/form-message";

export function LoginForm({ githubEnabled }: { githubEnabled: boolean }) {
  const [state, sendLink, sending] = useActionState(requestMagicLink, IDLE_STATE);
  const [githubState, startGitHub, redirecting] = useActionState(signInWithGitHub, IDLE_STATE);

  return (
    <div className="space-y-6">
      <form action={sendLink} className="space-y-3">
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-md border border-nx-border bg-nx-bg px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={sending}
          className="w-full rounded-md bg-nx-teal px-3 py-2 text-sm font-semibold text-nx-bg disabled:opacity-60"
        >
          {sending ? "Sending…" : "Email me a sign-in link"}
        </button>
        <FormMessage state={state} />
      </form>

      {githubEnabled && (
        <form action={startGitHub} className="space-y-2 border-t border-nx-border pt-6">
          <button
            type="submit"
            disabled={redirecting}
            className="w-full rounded-md border border-nx-border px-3 py-2 text-sm"
          >
            Continue with GitHub
          </button>
          <FormMessage state={githubState} />
        </form>
      )}
    </div>
  );
}
