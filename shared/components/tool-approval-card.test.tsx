import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToolApprovalCard } from './tool-approval-card';
import type { ToolApprovalState } from '../utils/tool-approval';

function buildApproval(overrides: Partial<ToolApprovalState> = {}): ToolApprovalState {
  return {
    chatId: 'session-1',
    sessionId: 'session-1',
    approvalId: 'approval-1',
    agentName: 'Helper',
    toolName: 'Docs server',
    functionName: 'create_doc',
    functionDescription: 'Creates a document',
    argumentsJson: '{"title":"Hello","tags":["a"]}',
    expiresAtUtc: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    status: 'Pending',
    ...overrides,
  };
}

describe('ToolApprovalCard (US 7575)', () => {
  it('asks "{agent} wants to use {function} from {tool}" with the three answers', () => {
    render(<ToolApprovalCard approval={buildApproval()} onDecide={vi.fn()} />);

    expect(screen.getByTestId('tool-approval-card')).toHaveTextContent('Helper wants to use create_doc from Docs server');
    expect(screen.getByText('Creates a document')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Allow once' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Allow for this conversation' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Deny' })).toBeEnabled();
  });

  // WI 7726: friendly text replaces the original; the original is only a fallback.
  it('shows the friendly function name and description instead of the original ones', () => {
    render(
      <ToolApprovalCard
        approval={buildApproval({ functionDisplayName: 'Create a document', functionDisplayDescription: 'Adds a new document' })}
        onDecide={vi.fn()}
      />
    );

    const card = screen.getByTestId('tool-approval-card');
    expect(card).toHaveTextContent('Helper wants to use Create a document from Docs server');
    expect(card).toHaveAccessibleName('Permission request: Create a document from Docs server');
    expect(screen.getByText('Adds a new document')).toBeInTheDocument();
    expect(card).not.toHaveTextContent('create_doc');
    expect(screen.queryByText('Creates a document')).not.toBeInTheDocument();
  });

  it('falls back to the original function name and description when the friendly ones are blank', () => {
    render(<ToolApprovalCard approval={buildApproval({ functionDisplayName: '  ', functionDisplayDescription: null })} />);

    expect(screen.getByTestId('tool-approval-card')).toHaveTextContent('Helper wants to use create_doc from Docs server');
    expect(screen.getByText('Creates a document')).toBeInTheDocument();
  });

  it('uses the fallback agent name when the request has none', () => {
    render(<ToolApprovalCard approval={buildApproval({ agentName: undefined })} fallbackAgentName="Host agent" />);

    expect(screen.getByTestId('tool-approval-card')).toHaveTextContent('Host agent wants to use');
  });

  it('shows the arguments under a collapsible Details section', async () => {
    const user = userEvent.setup();
    render(<ToolApprovalCard approval={buildApproval()} />);

    const toggle = screen.getByRole('button', { name: 'Details' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/"title": "Hello"/)).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/"title": "Hello"/)).toBeInTheDocument();
  });

  it('sends the chosen decision', async () => {
    const user = userEvent.setup();
    const onDecide = vi.fn().mockResolvedValue({ success: true });
    render(<ToolApprovalCard approval={buildApproval()} onDecide={onDecide} />);

    await user.click(screen.getByRole('button', { name: 'Allow for this conversation' }));

    expect(onDecide).toHaveBeenCalledWith('AllowForConversation');
  });

  it('shows the error when the answer could not be sent', async () => {
    const user = userEvent.setup();
    const onDecide = vi.fn().mockResolvedValue({ success: false, error: 'This request was already answered.' });
    render(<ToolApprovalCard approval={buildApproval()} onDecide={onDecide} />);

    await user.click(screen.getByRole('button', { name: 'Deny' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This request was already answered.');
  });

  it.each([
    [{ status: 'Approved', decision: 'AllowOnce' } as const, 'Allowed once'],
    [{ status: 'Approved', decision: 'AllowForConversation' } as const, 'Allowed for this conversation'],
    [{ status: 'Denied', decision: 'Deny' } as const, 'Denied'],
    [{ status: 'Expired', decision: 'Expired' } as const, 'Expired'],
  ])('renders the %o outcome without buttons', (overrides, text) => {
    render(<ToolApprovalCard approval={buildApproval(overrides)} onDecide={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent(text);
    expect(screen.queryByRole('button', { name: 'Allow once' })).not.toBeInTheDocument();
    expect(screen.getByTestId('tool-approval-card')).toHaveAttribute('data-status', overrides.status);
  });

  it('treats a pending request past its expiry as expired', () => {
    render(<ToolApprovalCard approval={buildApproval({ expiresAtUtc: new Date(Date.now() - 1000).toISOString() })} onDecide={vi.fn()} />);

    expect(screen.getByTestId('tool-approval-card')).toHaveAttribute('data-status', 'Expired');
    expect(screen.queryByRole('button', { name: 'Deny' })).not.toBeInTheDocument();
  });

  it('stops offering answers once the server says it was already answered', () => {
    render(<ToolApprovalCard approval={buildApproval({ alreadyAnswered: true })} onDecide={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent('already answered');
    expect(screen.queryByRole('button', { name: 'Allow once' })).not.toBeInTheDocument();
  });
});

describe('ToolApprovalCard — accessibility', () => {
  it('announces a pending request through a polite live region, and stops once answered', () => {
    const { rerender } = render(<ToolApprovalCard approval={buildApproval()} onDecide={vi.fn()} />);

    const announcement = screen.getByTestId('tool-approval-announcement');
    expect(announcement).toHaveAttribute('aria-live', 'polite');
    expect(announcement).toHaveTextContent('Approval needed: Helper wants to use create_doc from Docs server.');

    rerender(<ToolApprovalCard approval={buildApproval({ status: 'Denied', decision: 'Deny' })} onDecide={vi.fn()} />);
    expect(screen.getByTestId('tool-approval-announcement')).toHaveTextContent('');
  });

  it('only points aria-controls at the details panel while it is rendered', async () => {
    const user = userEvent.setup();
    render(<ToolApprovalCard approval={buildApproval()} />);

    const toggle = screen.getByRole('button', { name: 'Details' });
    expect(toggle).not.toHaveAttribute('aria-controls');

    await user.click(toggle);
    const controlled = toggle.getAttribute('aria-controls');
    expect(controlled).toBeTruthy();
    expect(document.getElementById(controlled!)).toBeInTheDocument();
  });
});
