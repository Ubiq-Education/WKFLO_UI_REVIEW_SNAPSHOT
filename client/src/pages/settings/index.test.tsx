import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Route, Router, Switch } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import SettingsPage from './index';
import { SETTINGS_SECTIONS, findSettingsSection, visibleSettingsSections } from '@/components/settings/settings-sections';

const { permissions } = vi.hoisted(() => ({ permissions: { isSuperPowerUser: false, isLoading: false } }));
vi.mock('@/hooks/use-super-power-user', () => ({
  useSuperPowerUser: () => ({ ...permissions, accessibleTenantGuids: [] }),
}));
vi.mock('@/components/settings/sections/super-power-users-settings', () => ({
  default: () => <div data-testid="super-power-users-section" />,
}));

vi.mock('@/components/settings/sections/web-origins-settings', () => ({
  default: () => <div data-testid="web-origins-section" />,
}));

beforeEach(() => {
  permissions.isSuperPowerUser = false;
  permissions.isLoading = false;
});

// This file covers routing and layout only; each section has its own tests.
vi.mock('@/components/settings/sections/general-settings', () => ({
  default: () => <div data-testid="general-section" />,
}));

// Mirrors the two settings routes registered in App.tsx.
function renderAt(path: string) {
  const location = memoryLocation({ path, record: true });
  render(
    <Router hook={location.hook}>
      <Switch>
        <Route path="/settings" component={SettingsPage} />
        <Route path="/settings/:section" component={SettingsPage} />
      </Switch>
    </Router>
  );
  return location;
}

describe('SettingsPage', () => {
  it('redirects bare /settings to the General section', () => {
    const location = renderAt('/settings');

    expect(location.history.at(-1)).toBe('/settings/general');
    expect(screen.getByRole('heading', { level: 2, name: 'General' })).toBeInTheDocument();
    expect(screen.getByTestId('general-section')).toBeInTheDocument();
  });

  it('redirects an unknown section to the General section', () => {
    const location = renderAt('/settings/does-not-exist');

    expect(location.history.at(-1)).toBe('/settings/general');
  });

  it('renders the section nav from the registry and marks the active section', () => {
    renderAt('/settings/general');

    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(visibleSettingsSections(false).length);

    const general = within(nav).getByRole('link', { name: 'General' });
    expect(general).toHaveAttribute('href', '/settings/general');
    expect(general).toHaveAttribute('aria-current', 'page');
  });

  it('renders the page and section headers', () => {
    renderAt('/settings/general');

    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText(SETTINGS_SECTIONS[0].description)).toBeInTheDocument();
  });
});

describe('SettingsPage web origins section', () => {
  it('opens for a super power user', () => {
    permissions.isSuperPowerUser = true;
    renderAt('/settings/web-origins');

    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(within(nav).getByRole('link', { name: 'Web Origins' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('web-origins-section')).toBeInTheDocument();
  });

  it('is hidden from the nav and redirects to General for everyone else', () => {
    const location = renderAt('/settings/web-origins');

    expect(location.history.at(-1)).toBe('/settings/general');
    expect(screen.queryByTestId('web-origins-section')).toBeNull();
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(within(nav).queryByRole('link', { name: 'Web Origins' })).toBeNull();
  });
});

describe('SettingsPage super power user section', () => {
  it('is listed in the nav and opens for a super power user', () => {
    permissions.isSuperPowerUser = true;
    renderAt('/settings/super-power-users');

    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(within(nav).getByRole('link', { name: 'Super Power Users' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('super-power-users-section')).toBeInTheDocument();
  });

  it('is hidden from the nav and redirects to General for everyone else', () => {
    const location = renderAt('/settings/super-power-users');

    expect(location.history.at(-1)).toBe('/settings/general');
    expect(screen.queryByTestId('super-power-users-section')).toBeNull();
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(within(nav).queryByRole('link', { name: 'Super Power Users' })).toBeNull();
  });

  it('does not redirect while permissions are still loading', () => {
    permissions.isLoading = true;
    const location = renderAt('/settings/super-power-users');

    expect(location.history.at(-1)).toBe('/settings/super-power-users');
  });
});

describe('settings section registry', () => {
  it('has unique, URL-safe section ids', () => {
    const ids = SETTINGS_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[a-z0-9-]+$/));
  });

  it('finds sections by id and returns undefined for unknown or missing ids', () => {
    expect(findSettingsSection('general')?.label).toBe('General');
    expect(findSettingsSection('nope')).toBeUndefined();
    expect(findSettingsSection(undefined)).toBeUndefined();
  });
});
