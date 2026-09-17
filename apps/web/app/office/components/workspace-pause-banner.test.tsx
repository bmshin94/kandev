import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspacePauseViewProps } from "./workspace-pause-banner";
import { WorkspacePauseState, WorkspacePauseTopbarActions } from "./workspace-pause-banner";

afterEach(() => {
  cleanup();
});

function view(overrides: Partial<WorkspacePauseViewProps> = {}): WorkspacePauseViewProps {
  const action = vi.fn().mockResolvedValue({ ok: true });
  return {
    activeWorkspaceId: "ws-1",
    record: null,
    status: "known",
    refresh: action,
    pause: action,
    retryPause: action,
    resume: action,
    sweep: null,
    isMutating: false,
    ...overrides,
  };
}

describe("WorkspacePauseTopbarActions", () => {
  it("renders desktop actions and a mobile workspace-actions entry point", () => {
    render(<WorkspacePauseTopbarActions view={view()} />);

    expect(screen.getByTestId("office-workspace-topbar-actions")).toBeTruthy();
    expect(screen.getByTestId("office-workspace-actions-trigger")).toBeTruthy();
  });
});

describe("WorkspacePauseState", () => {
  it("keeps the paused banner informational and leaves controls in the topbar", () => {
    render(
      <WorkspacePauseState
        view={view({
          record: {
            id: "pause-1",
            reason: "maintenance",
            createdBy: "default-user",
            createdByKind: "user",
            createdAt: "2026-09-17T00:00:00Z",
          },
        })}
      />,
    );

    expect(screen.getByTestId("office-workspace-paused-banner")).toBeTruthy();
    expect(screen.queryByTestId("office-pause-workspace-button")).toBeNull();
    expect(screen.queryByTestId("office-resume-workspace-button")).toBeNull();
  });
});
