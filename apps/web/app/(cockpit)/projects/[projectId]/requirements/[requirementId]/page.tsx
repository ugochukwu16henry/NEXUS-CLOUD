import type { Metadata } from "next";
import { setRequirementApproval, updateRequirement } from "../actions";
import { RequirementFields } from "@/components/projects/requirement-fields";
import { ActionForm } from "@/components/ui/action-form";
import { Badge, Hidden, buttonSecondary } from "@/components/ui/fields";
import { getRequirement } from "@/lib/projects/queries";

export const metadata: Metadata = { title: "Requirement · Nexus Cloud" };

const APPROVAL_TONE = { draft: "muted", approved: "ok", rejected: "danger" } as const;
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export default async function RequirementPage({
  params,
}: {
  params: Promise<{ projectId: string; requirementId: string }>;
}) {
  const { projectId, requirementId } = await params;
  const { requirement, history } = await getRequirement(projectId, requirementId);

  return (
    <main id="main" className="grid gap-8 p-6 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-6">
        <div>
          <p className="font-mono text-xs text-nx-muted">
            REQ-{requirement.ref} · version {requirement.version}
          </p>
          <h1 className="text-lg font-semibold">{requirement.title}</h1>
        </div>
        <ActionForm
          action={updateRequirement}
          submitLabel="Save requirement"
          version={requirement.version}
        >
          <Hidden name="projectId" value={projectId} />
          <Hidden name="requirementId" value={requirement.id} />
          <RequirementFields values={requirement} />
          {requirement.approval === "approved" && (
            <p className="text-xs text-nx-warn">
              Changing an approved requirement sends it back to draft for re-approval.
            </p>
          )}
        </ActionForm>
      </div>

      <aside className="space-y-8" aria-label="Approval and history">
        <section aria-labelledby="approval-heading" className="space-y-3">
          <h2 id="approval-heading" className="text-base font-semibold">
            Approval
          </h2>
          <p>
            <Badge tone={APPROVAL_TONE[requirement.approval]}>{requirement.approval}</Badge>
            {requirement.approved_at && (
              <span className="ml-2 text-xs text-nx-muted">
                on {dateFormat.format(new Date(requirement.approved_at))} UTC
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {(["approved", "rejected", "draft"] as const)
              .filter((approval) => approval !== requirement.approval)
              .map((approval) => (
                <ActionForm
                  key={approval}
                  action={setRequirementApproval}
                  submitLabel={
                    { approved: "Approve", rejected: "Reject", draft: "Back to draft" }[approval]
                  }
                  version={requirement.version}
                  className=""
                  buttonClassName={buttonSecondary}
                  announceSuccess
                >
                  <Hidden name="projectId" value={projectId} />
                  <Hidden name="requirementId" value={requirement.id} />
                  <Hidden name="approval" value={approval} />
                </ActionForm>
              ))}
          </div>
        </section>

        <section aria-labelledby="history-heading" className="space-y-3">
          <h2 id="history-heading" className="text-base font-semibold">
            Earlier versions
          </h2>
          {history.length === 0 ? (
            <p className="text-sm text-nx-muted">This is the first version.</p>
          ) : (
            <ol className="space-y-3">
              {history.map((entry) => {
                const snapshot = entry.snapshot as { title?: string; statement?: string };
                return (
                  <li key={entry.version} className="rounded border border-nx-border p-3 text-sm">
                    <p className="text-xs text-nx-muted">
                      Version {entry.version} · replaced{" "}
                      {dateFormat.format(new Date(entry.changed_at))} UTC
                    </p>
                    <p className="font-medium">{snapshot.title}</p>
                    <p className="whitespace-pre-wrap text-nx-muted">{snapshot.statement}</p>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </aside>
    </main>
  );
}
