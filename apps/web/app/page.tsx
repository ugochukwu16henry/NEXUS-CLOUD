import {
  AGENT_RUN,
  BOARD,
  CONSOLE_LINES,
  DIFF_LINES,
  FILES,
  NAV_ITEMS,
  PROJECT,
} from "@/components/cockpit/mock-data";
import { WorkflowBoard } from "@/components/cockpit/workflow-board";
import { WorkspaceTabs } from "@/components/cockpit/workspace-tabs";

const DIFF_STYLES = {
  add: "bg-nx-ok/10 text-nx-ok",
  del: "bg-nx-danger/10 text-nx-danger",
  ctx: "text-nx-muted",
} as const;
const DIFF_MARKERS = { add: "+", del: "-", ctx: " " } as const;

function PanelHeading({ children }: { children: string }) {
  return (
    <h2 className="border-b border-nx-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-nx-muted">
      {children}
    </h2>
  );
}

export default function CockpitPrototype() {
  const budgetPercent = Math.round((PROJECT.budgetUsedUsd / PROJECT.budgetLimitUsd) * 100);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-nx-border bg-nx-surface px-4 py-2">
        <span className="font-semibold tracking-wide text-nx-teal">NEXUS CLOUD</span>
        <span className="text-sm text-nx-muted">
          {PROJECT.name} · <span className="font-mono">{PROJECT.branch}</span>
        </span>
        <span className="ml-auto rounded border border-nx-warn/50 px-2 py-0.5 text-xs text-nx-warn">
          Prototype · sample data
        </span>
        <span className="text-xs text-nx-muted" aria-label={`Budget used ${budgetPercent} percent`}>
          ${PROJECT.budgetUsedUsd.toFixed(2)} / ${PROJECT.budgetLimitUsd} budget
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Primary" className="w-44 shrink-0 border-r border-nx-border bg-nx-surface">
          <ul className="py-2">
            {NAV_ITEMS.map((item) => (
              <li key={item}>
                <a
                  href="#"
                  aria-current={item === "Tasks" ? "page" : undefined}
                  className={`block px-4 py-1.5 text-sm ${
                    item === "Tasks"
                      ? "bg-nx-raised text-nx-text"
                      : "text-nx-muted hover:text-nx-text"
                  }`}
                >
                  {item}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <aside
          aria-label="Project explorer"
          className="hidden w-60 shrink-0 border-r border-nx-border bg-nx-panel md:block"
        >
          <PanelHeading>Explorer</PanelHeading>
          <ul className="p-2 font-mono text-xs">
            {FILES.map((file) => (
              <li key={file.path} className="flex justify-between gap-2 px-1 py-1">
                <span className="truncate">{file.path}</span>
                {file.status && (
                  <span
                    className={file.status === "A" ? "text-nx-ok" : "text-nx-warn"}
                    aria-label={file.status === "A" ? "added" : "modified"}
                  >
                    {file.status}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <main id="main" className="min-h-0 flex-1 bg-nx-bg">
            <h1 className="sr-only">Cockpit</h1>
            <WorkspaceTabs
              tabs={[
                {
                  id: "diff",
                  label: "Diff",
                  content: (
                    <pre className="w-max min-w-full rounded-md border border-nx-border bg-nx-panel p-3 font-mono text-xs leading-6">
                      {DIFF_LINES.map((line, i) => (
                        <div key={i} className={`px-2 ${DIFF_STYLES[line.kind]}`}>
                          <span aria-hidden="true">{DIFF_MARKERS[line.kind]} </span>
                          {line.text}
                        </div>
                      ))}
                    </pre>
                  ),
                },
                { id: "board", label: "Workflow board", content: <WorkflowBoard tasks={BOARD} /> },
                {
                  id: "plan",
                  label: "Plan",
                  content: (
                    <ol className="list-decimal space-y-2 pl-5 text-sm">
                      <li>Reset token table with RLS (NX-11) — approved</li>
                      <li>Reset endpoint and page (NX-12) — in review</li>
                      <li>E2E journey (NX-13) — checks running</li>
                      <li>Rate limiting (NX-14) — blocked by security finding</li>
                    </ol>
                  ),
                },
              ]}
            />
          </main>

          <section
            aria-label="Console"
            className="h-40 shrink-0 border-t border-nx-border bg-nx-surface"
          >
            <PanelHeading>Console</PanelHeading>
            <pre
              tabIndex={0}
              aria-label="Console output"
              className="h-[calc(100%-2rem)] overflow-auto p-3 font-mono text-xs leading-5 text-nx-muted"
            >
              {CONSOLE_LINES.join("\n")}
            </pre>
          </section>
        </div>

        <aside
          aria-label="AI command panel"
          className="hidden w-80 shrink-0 border-l border-nx-border bg-nx-panel lg:block"
        >
          <PanelHeading>AI command panel</PanelHeading>
          <div className="space-y-3 p-3 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-nx-muted">Agent</dt>
              <dd>{AGENT_RUN.agent}</dd>
              <dt className="text-nx-muted">Model</dt>
              <dd>{AGENT_RUN.model}</dd>
              <dt className="text-nx-muted">Purpose</dt>
              <dd>{AGENT_RUN.purpose}</dd>
              <dt className="text-nx-muted">Budget</dt>
              <dd>
                ${AGENT_RUN.spentUsd.toFixed(2)} of ${AGENT_RUN.budgetUsd.toFixed(2)}
              </dd>
              <dt className="text-nx-muted">Stop when</dt>
              <dd>{AGENT_RUN.stopCondition}</dd>
            </dl>
            <ol className="space-y-1 text-xs">
              {AGENT_RUN.steps.map((step) => (
                <li key={step.label} className={step.done ? "text-nx-ok" : "text-nx-warn"}>
                  {step.done ? "✓" : "…"} {step.label}
                </li>
              ))}
            </ol>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded bg-nx-teal px-3 py-1.5 text-xs font-semibold text-nx-bg"
              >
                Approve diff
              </button>
              <button
                type="button"
                className="rounded border border-nx-border px-3 py-1.5 text-xs text-nx-text"
              >
                Request changes
              </button>
              <button
                type="button"
                className="rounded border border-nx-danger/60 px-3 py-1.5 text-xs text-nx-danger"
              >
                Stop
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
