import { render, screen, within } from "@testing-library/react";
import { WorkflowBoard } from "./workflow-board";

describe("WorkflowBoard", () => {
  it("renders each task with its human-readable state", () => {
    render(
      <WorkflowBoard
        tasks={[
          { id: "NX-1", title: "First task", state: "needs_human_review", owner: "Henry" },
          { id: "NX-2", title: "Second task", state: "blocked", owner: "Security agent" },
        ]}
      />,
    );

    const items = within(screen.getByRole("list", { name: "Workflow board" })).getAllByRole(
      "listitem",
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Needs Human Review");
    expect(items[1]).toHaveTextContent("Blocked / Needs Review");
  });
});
