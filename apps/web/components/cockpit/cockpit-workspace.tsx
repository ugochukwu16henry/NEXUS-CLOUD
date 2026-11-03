"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels";
import { useShortcuts, type Shortcut } from "@/components/shell/use-shortcuts";
import { AGENT_RUN, BOARD, CONSOLE_LINES, DIFF_LINES, FILES, PROJECT } from "./mock-data";
import { WorkflowBoard } from "./workflow-board";
import { WorkspaceTabs } from "./workspace-tabs";

const DIFF_STYLES = {
  add: "bg-nx-ok/10 text-nx-ok",
  del: "bg-nx-danger/10 text-nx-danger",
  ctx: "text-nx-muted",
} as const;
const DIFF_MARKERS = { add: "+", del: "-", ctx: " " } as const;

const SEPARATOR =
  "bg-nx-border transition-colors hover:bg-nx-blue data-[separator=active]:bg-nx-blue";

function PanelHeading({ children }: { children: string }) {
  return (
    <h2 className="border-b border-nx-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-nx-muted">
      {children}
    </h2>
  );
}

function toggle(panel: ReturnType<typeof usePanelRef>["current"]) {
  if (panel?.isCollapsed()) panel.expand();
  else panel?.collapse();
}

/** Cockpit layout with sample data; real projects and agents replace the data from Sprint 2. */
export function CockpitWorkspace() {
  const consolePanel = usePanelRef();
  const aiPanel = usePanelRef();
  const budgetPercent = Math.round((PROJECT.budgetUsedUsd / PROJECT.budgetLimitUsd) * 100);

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      {
        keys: "ctrl+j",
        description: "Show or hide the console",
        run: () => toggle(consolePanel.current),
      },
      {
        keys: "ctrl+i",
        description: "Show or hide the AI panel",
        run: () => toggle(aiPanel.current),
      },
    ],
    [consolePanel, aiPanel],
  );
  useShortcuts(shortcuts);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-nx-border px-4 py-1.5 text-sm">
        <span className="text-nx-muted">
          {PROJECT.name} · <span className="font-mono">{PROJECT.branch}</span>
        </span>
        <span className="ml-auto rounded border border-nx-warn/50 px-2 py-0.5 text-xs text-nx-warn">
          Prototype · sample data
        </span>
        <span className="text-xs text-nx-muted">
          ${PROJECT.budgetUsedUsd.toFixed(2)} / ${PROJECT.budgetLimitUsd} budget
          <span className="sr-only"> ({budgetPercent}% used)</span>
        </span>
      </div>

      <Group orientation="horizontal" className="min-h-0 flex-1">
        <Panel id="explorer" defaultSize="20" minSize="12" collapsible collapsedSize="0">
          <aside aria-label="Project explorer" className="h-full overflow-auto bg-nx-panel">
            <PanelHeading>Explorer</PanelHeading>
            <ul className="p-2 font-mono text-xs">
              {FILES.map((file) => (
                <li key={file.path} className="flex justify-between gap-2 px-1 py-1">
                  <span className="truncate">{file.path}</span>
                  {file.status && (
                    <span className={file.status === "A" ? "text-nx-ok" : "text-nx-warn"}>
                      <span aria-hidden="true">{file.status}</span>
                      <span className="sr-only">{file.status === "A" ? "added" : "modified"}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </aside>
        </Panel>
        <Separator aria-label="Resize explorer" className={`w-1 ${SEPARATOR}`} />

        <Panel id="center" minSize="30">
          <Group orientation="vertical">
            <Panel id="workspace" minSize="30">
              <main id="main" className="h-full bg-nx-bg">
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
                    {
                      id: "board",
                      label: "Workflow board",
                      content: <WorkflowBoard tasks={BOARD} />,
                    },
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
            </Panel>
            <Separator aria-label="Resize console" className={`h-1 ${SEPARATOR}`} />
            <Panel
              id="console"
              panelRef={consolePanel}
              defaultSize="25"
              minSize="10"
              collapsible
              collapsedSize="0"
            >
              <section aria-label="Console" className="h-full bg-nx-surface">
                <PanelHeading>Console</PanelHeading>
                <pre
                  tabIndex={0}
                  aria-label="Console output"
                  className="h-[calc(100%-2rem)] overflow-auto p-3 font-mono text-xs leading-5 text-nx-muted"
                >
                  {CONSOLE_LINES.join("\n")}
                </pre>
              </section>
            </Panel>
          </Group>
        </Panel>

        <Separator aria-label="Resize AI panel" className={`w-1 ${SEPARATOR}`} />
        <Panel
          id="ai"
          panelRef={aiPanel}
          defaultSize="24"
          minSize="16"
          collapsible
          collapsedSize="0"
        >
          <aside aria-label="AI command panel" className="h-full overflow-auto bg-nx-panel">
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
              <p className="text-xs text-nx-muted">
                Sample run. Real runs and approvals are on the{" "}
                <Link href="/agents" className="text-nx-blue underline">
                  Agents
                </Link>{" "}
                page.
              </p>
            </div>
          </aside>
        </Panel>
      </Group>
    </div>
  );
}
