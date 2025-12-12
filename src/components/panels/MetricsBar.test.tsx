import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MetricsBar } from './MetricsBar';
import type { NetworkMetrics } from '@/hooks/useNodes';

// Mock useNetworkMetrics
vi.mock('@/hooks/useNodes', () => ({
  useNetworkMetrics: vi.fn(),
}));

import { useNetworkMetrics } from '@/hooks/useNodes';

const mockUseNetworkMetrics = useNetworkMetrics as ReturnType<typeof vi.fn>;

function createWrapper() {
  const queryClient = new QueryClient();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('MetricsBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state with skeletons', () => {
    mockUseNetworkMetrics.mockReturnValue({
      metrics: null,
      isLoading: true,
      isError: false,
      dataUpdatedAt: 0,
    });

    render(<MetricsBar />, { wrapper: createWrapper() });

    // Should show skeleton loaders
    expect(screen.getByTestId('metrics-loading')).toBeInTheDocument();
  });

  it('renders all four metrics when data is available', () => {
    const mockMetrics: NetworkMetrics = {
      totalNodes: 84,
      avgPeers: 12,
      maxFinalizationLag: 2,
      consensusParticipation: 95,
    };

    mockUseNetworkMetrics.mockReturnValue({
      metrics: mockMetrics,
      isLoading: false,
      isError: false,
      dataUpdatedAt: Date.now(),
    });

    render(<MetricsBar />, { wrapper: createWrapper() });

    expect(screen.getByText('84')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('95%')).toBeInTheDocument();
  });

  it('displays metric labels', () => {
    const mockMetrics: NetworkMetrics = {
      totalNodes: 84,
      avgPeers: 12,
      maxFinalizationLag: 2,
      consensusParticipation: 95,
    };

    mockUseNetworkMetrics.mockReturnValue({
      metrics: mockMetrics,
      isLoading: false,
      isError: false,
      dataUpdatedAt: Date.now(),
    });

    render(<MetricsBar />, { wrapper: createWrapper() });

    expect(screen.getByText(/nodes/i)).toBeInTheDocument();
    expect(screen.getByText(/peers/i)).toBeInTheDocument();
    expect(screen.getByText(/lag/i)).toBeInTheDocument();
    expect(screen.getByText(/consensus/i)).toBeInTheDocument();
  });

  it('shows last updated time', () => {
    const mockMetrics: NetworkMetrics = {
      totalNodes: 84,
      avgPeers: 12,
      maxFinalizationLag: 2,
      consensusParticipation: 95,
    };

    mockUseNetworkMetrics.mockReturnValue({
      metrics: mockMetrics,
      isLoading: false,
      isError: false,
      dataUpdatedAt: Date.now() - 10000, // 10 seconds ago
    });

    render(<MetricsBar />, { wrapper: createWrapper() });

    expect(screen.getByText(/updated/i)).toBeInTheDocument();
  });

  it('renders refresh button', () => {
    mockUseNetworkMetrics.mockReturnValue({
      metrics: null,
      isLoading: true,
      isError: false,
      dataUpdatedAt: 0,
    });

    render(<MetricsBar />, { wrapper: createWrapper() });

    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
  });
});
