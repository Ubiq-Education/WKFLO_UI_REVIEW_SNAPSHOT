import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import Sidebar from './sidebar';

const { permissions } = vi.hoisted(() => ({ permissions: { isSuperPowerUser: true } }));
vi.mock('@/hooks/use-super-power-user', () => ({
  useSuperPowerUser: () => ({ isSuperPowerUser: permissions.isSuperPowerUser, accessibleTenantGuids: [], isLoading: false }),
}));

const ACTIVE_CLASS = 'bg-orange-500';

beforeEach(() => {
  permissions.isSuperPowerUser = true;
});

function renderSidebarAt(path: string) {
  const { hook } = memoryLocation({ path });
  render(
    <Router hook={hook}>
      <Sidebar />
    </Router>
  );
}

function settingsLinkAt(path: string) {
  renderSidebarAt(path);
  // NavItem icons have no accessible name (the label lives in a tooltip), so locate by href.
  const link = document.querySelector<HTMLAnchorElement>('a[href="/settings"]');
  expect(link).not.toBeNull();
  return link;
}

describe('Sidebar settings item', () => {
  it.each(['/settings', '/settings/general', '/settings/anything'])('is active on %s', (path) => {
    expect(settingsLinkAt(path)).toHaveClass(ACTIVE_CLASS);
  });

  it.each(['/agents', '/settings-xyz'])('is not active on %s', (path) => {
    expect(settingsLinkAt(path)).not.toHaveClass(ACTIVE_CLASS);
  });
});

describe('Sidebar restricted entries', () => {
  it('never shows Workflows', () => {
    renderSidebarAt('/');
    expect(document.querySelector('a[href="/workflows"]')).toBeNull();
    cleanup();
    permissions.isSuperPowerUser = false;
    renderSidebarAt('/');
    expect(document.querySelector('a[href="/workflows"]')).toBeNull();
  });

  it.each(['/audit', '/tags', '/aimodels', '/vault'])('shows %s to super power users only', (href) => {
    renderSidebarAt('/');
    expect(document.querySelector(`a[href="${href}"]`)).not.toBeNull();
    cleanup();
    permissions.isSuperPowerUser = false;
    renderSidebarAt('/');
    expect(document.querySelector(`a[href="${href}"]`)).toBeNull();
  });
});

describe('Sidebar manage marketplace agents entry', () => {
  it('is shown to super power users', () => {
    renderSidebarAt('/');
    expect(document.querySelector('a[href="/marketplace/manage-agents"]')).not.toBeNull();
  });

  it('is hidden from everyone else, while Marketplace stays', () => {
    permissions.isSuperPowerUser = false;
    renderSidebarAt('/');
    expect(document.querySelector('a[href="/marketplace/manage-agents"]')).toBeNull();
    expect(document.querySelector('a[href="/marketplace/browse"]')).not.toBeNull();
  });
});
