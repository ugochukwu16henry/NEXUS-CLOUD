import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getViewer } from "@/lib/auth/session";
import { isGitHubSignInEnabled } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in · Nexus Cloud" };

const NOTICES: Record<string, { text: string; tone: "error" | "info" }> = {
  link_invalid: {
    text: "That sign-in link is invalid or has expired. Request a new one.",
    tone: "error",
  },
  signed_out: { text: "You have been signed out.", tone: "info" },
  signed_out_all: { text: "You have been signed out on every device.", tone: "info" },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  // getViewer() asks the Auth server, so a revoked session still sees the sign-in form.
  if (await getViewer()) redirect("/");
  const { error, notice } = await searchParams;
  const message = NOTICES[error ?? notice ?? ""];

  return (
    <main id="main" className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-nx-border bg-nx-surface p-6">
        <p className="text-sm font-semibold tracking-wide text-nx-teal">NEXUS CLOUD</p>
        <h1 className="mt-2 text-xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-nx-muted">Access is by invitation only.</p>
        {message && (
          <p
            role={message.tone === "error" ? "alert" : "status"}
            className={`mt-4 text-sm ${message.tone === "error" ? "text-nx-danger" : "text-nx-muted"}`}
          >
            {message.text}
          </p>
        )}
        <div className="mt-6">
          <LoginForm githubEnabled={isGitHubSignInEnabled()} />
        </div>
      </div>
    </main>
  );
}
