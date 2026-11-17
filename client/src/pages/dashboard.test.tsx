import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: undefined, isLoading: false }) }));
vi.mock('wouter', () => ({ useLocation: () => ['/', vi.fn()] }));
vi.mock('@/hooks/use-auth', () => ({ default: () => 'fake-access-token' }));

import Dashboard from './dashboard';

describe('Dashboard', () => {
  it('has no Workflows stats card or New Workflow quick action', () => {
    render(<Dashboard />);

    expect(screen.getByText('Agents')).toBeInTheDocument();
    expect(screen.queryByText('Workflows')).toBeNull();
    expect(screen.queryByText('New Workflow')).toBeNull();
  });
});
