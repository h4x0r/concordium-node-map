/**
 * Tests for BlocksView component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BlocksView } from './BlocksView';

// Mock the useValidators hook
const mockUseValidators = vi.fn();
vi.mock('@/hooks/useValidators', () => ({
  useValidators: () => mockUseValidators(),
}));

describe('BlocksView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state while fetching data', () => {
    mockUseValidators.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });

    render(<BlocksView />);
    expect(screen.getByText(/loading block data/i)).toBeInTheDocument();
  });

  it('shows error state when fetch fails', () => {
    mockUseValidators.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Connection timeout'),
    });

    render(<BlocksView />);
    expect(screen.getByText(/failed to load block data/i)).toBeInTheDocument();
    expect(screen.getByText(/connection timeout/i)).toBeInTheDocument();
  });

  it('displays aggregated block totals', () => {
    mockUseValidators.mockReturnValue({
      data: {
        validators: [
          { bakerId: 1, source: 'reporting', blocks24h: 20, blocks7d: 100, blocks30d: 400, transactions24h: 50, transactions7d: 300, transactions30d: 1200, lotteryPower: 0.1, lastBlockTime: null },
          { bakerId: 2, source: 'chain_only', blocks24h: 10, blocks7d: 50, blocks30d: 200, transactions24h: 25, transactions7d: 150, transactions30d: 600, lotteryPower: 0.05, lastBlockTime: null },
          { bakerId: 3, source: 'reporting', blocks24h: 15, blocks7d: 75, blocks30d: 300, transactions24h: 38, transactions7d: 225, transactions30d: 900, lotteryPower: 0.08, lastBlockTime: null },
        ],
      },
      isLoading: false,
      error: null,
    });

    render(<BlocksView />);

    // Get all stat cards (1 combined + 2 for visible/phantom)
    const statCards = document.querySelectorAll('.bb-stat-card');
    expect(statCards.length).toBe(3);

    // Check combined card has title and 3 metrics
    const combinedCard = document.querySelector('.bb-stat-card-combined');
    expect(combinedCard).toBeInTheDocument();
    expect(combinedCard?.querySelector('.bb-stat-card-title')?.textContent).toBe('Blocks');

    // Check metrics in combined card: 45 (24h), 225 (7d), 900 (30d)
    const metrics = combinedCard?.querySelectorAll('.bb-stat-metric');
    expect(metrics?.length).toBe(3);
    expect(metrics?.[0].querySelector('.bb-stat-value')?.textContent).toBe('45');
    expect(metrics?.[1].querySelector('.bb-stat-value')?.textContent).toBe('225');
    expect(metrics?.[2].querySelector('.bb-stat-value')?.textContent).toBe('900');

    // Check visible validator blocks (24h): 20 + 15 = 35
    expect(statCards[1].querySelector('.bb-stat-value')?.textContent).toBe('35');

    // Check phantom validator blocks (24h): 10
    expect(statCards[2].querySelector('.bb-stat-value')?.textContent).toBe('10');
  });

  it('displays phantom block percentage', () => {
    mockUseValidators.mockReturnValue({
      data: {
        validators: [
          { bakerId: 1, source: 'reporting', blocks24h: 80, blocks7d: 400, blocks30d: 1600, transactions24h: 200, transactions7d: 1000, transactions30d: 4000, lotteryPower: 0.4, lastBlockTime: null },
          { bakerId: 2, source: 'chain_only', blocks24h: 20, blocks7d: 100, blocks30d: 400, transactions24h: 50, transactions7d: 250, transactions30d: 1000, lotteryPower: 0.1, lastBlockTime: null },
        ],
      },
      isLoading: false,
      error: null,
    });

    render(<BlocksView />);

    // Phantom blocks 20 out of 100 total = 20%
    expect(screen.getByText(/20\.0%/)).toBeInTheDocument();
  });

  it('displays top validators sorted by blocks', () => {
    mockUseValidators.mockReturnValue({
      data: {
        validators: [
          { bakerId: 1, source: 'reporting', blocks24h: 10, blocks7d: 50, blocks30d: 200, transactions24h: 25, transactions7d: 125, transactions30d: 500, lotteryPower: 0.1, lastBlockTime: null },
          { bakerId: 2, source: 'chain_only', blocks24h: 30, blocks7d: 150, blocks30d: 600, transactions24h: 75, transactions7d: 375, transactions30d: 1500, lotteryPower: 0.2, lastBlockTime: null },
          { bakerId: 3, source: 'reporting', blocks24h: 20, blocks7d: 100, blocks30d: 400, transactions24h: 50, transactions7d: 250, transactions30d: 1000, lotteryPower: 0.15, lastBlockTime: null },
        ],
      },
      isLoading: false,
      error: null,
    });

    render(<BlocksView />);

    // Baker 2 should be first (30 blocks), then Baker 3 (20 blocks), then Baker 1 (10 blocks)
    const rows = screen.getAllByRole('row');
    // First row is header, so data rows start at index 1
    expect(rows[1]).toHaveTextContent('2'); // Baker ID 2
    expect(rows[2]).toHaveTextContent('3'); // Baker ID 3
    expect(rows[3]).toHaveTextContent('1'); // Baker ID 1
  });

  it('shows badges for visible vs phantom validators', () => {
    mockUseValidators.mockReturnValue({
      data: {
        validators: [
          { bakerId: 1, source: 'reporting', blocks24h: 20, blocks7d: 100, blocks30d: 400, transactions24h: 50, transactions7d: 250, transactions30d: 1000, lotteryPower: 0.1, lastBlockTime: null },
          { bakerId: 2, source: 'chain_only', blocks24h: 10, blocks7d: 50, blocks30d: 200, transactions24h: 25, transactions7d: 125, transactions30d: 500, lotteryPower: 0.05, lastBlockTime: null },
        ],
      },
      isLoading: false,
      error: null,
    });

    render(<BlocksView />);

    expect(screen.getByText('Visible')).toBeInTheDocument();
    expect(screen.getByText('Phantom')).toBeInTheDocument();
  });

  it('formats last block time correctly', () => {
    const now = Date.now();
    mockUseValidators.mockReturnValue({
      data: {
        validators: [
          { bakerId: 1, source: 'reporting', blocks24h: 20, blocks7d: 100, blocks30d: 400, transactions24h: 50, transactions7d: 250, transactions30d: 1000, lotteryPower: 0.1, lastBlockTime: now - 30 * 60 * 1000 }, // 30 min ago
          { bakerId: 2, source: 'reporting', blocks24h: 15, blocks7d: 75, blocks30d: 300, transactions24h: 38, transactions7d: 188, transactions30d: 750, lotteryPower: 0.08, lastBlockTime: now - 5 * 60 * 60 * 1000 }, // 5 hours ago
          { bakerId: 3, source: 'reporting', blocks24h: 10, blocks7d: 50, blocks30d: 200, transactions24h: 25, transactions7d: 125, transactions30d: 500, lotteryPower: 0.05, lastBlockTime: now - 3 * 24 * 60 * 60 * 1000 }, // 3 days ago
        ],
      },
      isLoading: false,
      error: null,
    });

    render(<BlocksView />);

    expect(screen.getByText('Just now')).toBeInTheDocument();
    expect(screen.getByText('5h ago')).toBeInTheDocument();
    expect(screen.getByText('3d ago')).toBeInTheDocument();
  });

  it('shows -- for null last block time', () => {
    mockUseValidators.mockReturnValue({
      data: {
        validators: [
          { bakerId: 1, source: 'reporting', blocks24h: 20, blocks7d: 100, blocks30d: 400, transactions24h: 50, transactions7d: 250, transactions30d: 1000, lotteryPower: 0.1, lastBlockTime: null },
        ],
      },
      isLoading: false,
      error: null,
    });

    render(<BlocksView />);
    expect(screen.getByText('--')).toBeInTheDocument();
  });

  it('formats lottery power as percentage', () => {
    mockUseValidators.mockReturnValue({
      data: {
        validators: [
          { bakerId: 1, source: 'reporting', blocks24h: 20, blocks7d: 100, blocks30d: 400, transactions24h: 50, transactions7d: 250, transactions30d: 1000, lotteryPower: 0.12345, lastBlockTime: null },
        ],
      },
      isLoading: false,
      error: null,
    });

    render(<BlocksView />);

    // 0.12345 * 100 = 12.345%
    expect(screen.getByText('12.345%')).toBeInTheDocument();
  });
});
