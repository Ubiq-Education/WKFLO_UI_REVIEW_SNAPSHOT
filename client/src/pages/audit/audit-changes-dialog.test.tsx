import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuditLogEntry } from "@shared/schema";
import { AuditChangesDialog } from "./audit-changes-dialog";

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast }),
}));

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 1,
    tenantGuid: "00000000-0000-0000-0000-000000000000",
    entityType: "Agent",
    entityId: "42",
    action: "Update",
    actorUserGuid: null,
    actorUserName: null,
    actorUserEmail: null,
    timestamp: "2026-01-01T00:00:00Z",
    changes: '{"Name":{"old":"A","new":"B"}}',
    correlationId: null,
    ...overrides,
  };
}

describe("AuditChangesDialog", () => {
  beforeEach(() => {
    toast.mockReset();
  });

  it("renders nothing when no entry is selected", () => {
    render(<AuditChangesDialog entry={null} onClose={vi.fn()} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the title, entry description and pretty-printed JSON", () => {
    render(<AuditChangesDialog entry={makeEntry()} onClose={vi.fn()} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Changes")).toBeInTheDocument();
    expect(screen.getByText("Agent 42 - Update")).toBeInTheDocument();
    expect(screen.getByLabelText("Changes content").textContent).toBe(
      '{\n  "Name": {\n    "old": "A",\n    "new": "B"\n  }\n}',
    );
    expect(screen.queryByText(/not valid JSON/)).not.toBeInTheDocument();
  });

  it("shows the raw content with a note when it is not valid JSON", () => {
    render(<AuditChangesDialog entry={makeEntry({ changes: "{broken" })} onClose={vi.fn()} />);

    expect(screen.getByLabelText("Changes content").textContent).toBe("{broken");
    expect(screen.getByText(/not valid JSON/)).toBeInTheDocument();
  });

  it("copies the formatted text and shows a toast", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<AuditChangesDialog entry={makeEntry()} onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /copy/i }));

    expect(writeText).toHaveBeenCalledWith('{\n  "Name": {\n    "old": "A",\n    "new": "B"\n  }\n}');
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "Copied to clipboard" }));
  });

  it("calls onClose when the dialog is dismissed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AuditChangesDialog entry={makeEntry()} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
