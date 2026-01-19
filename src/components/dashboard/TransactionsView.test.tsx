/**
 * Tests for TransactionsView component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TransactionsView } from './TransactionsView';

// Mock the useValidators hook
const mockUseValidators = vi.fn();
vi.mock('@/hooks/useValidators', () => ({
  useValidators: () => mockUseValidators(),
}));

describe('TransactionsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state while fetching data', () => {
    mockUseValidators.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });

    render(<TransactionsView />);
    expect(screen.getByText(/loading transaction data/i)).toBeInTheDocument();
  });

  it('shows error state when fetch fails', () => {
    mockUseValidators.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Network error'),
    });

    render(<TransactionsView />);
    expect(screen.getByText(/failed to load transaction data/i)).toBeInTheDocument();
    expect(screen.getByText(/network error/i)).toBeInTheDocument();
  });

  it('displays aggregated transaction totals', () => {
    mockUseValidators.mockReturnValue({
      data: {
        validators: [
          { bakerId: 1, source: 'reporting', transactions24h: 100, transactions7d: 500, lotteryPower: 0.1 },
          { bakerId: 2, source: 'chain_only', transactions24h: 50, transactions7d: 200, lotteryPower: 0.05 },
          { bakerId: 3, source: 'reporting', transactions24h: 75, transactions7d: 300, lotteryPower: 0.08 },
        ],
      },
      isLoading: false,
      error: null,
    });

    render(<TransactionsView />);

    // Get all stat cards
    const statCards = document.querySelectorAll('.bb-stat-card');
    expect(statCards.length).toBe(4);

    // Check total transactions (24h): 100 + 50 + 75 = 225
    expect(statCards[0].querySelector('.bb-stat-value')?.textContent).toBe('225');

    // Check total transactions (7d): 500 + 200 + 300 = 1,000
    expect(statCards[1].querySelector('.bb-stat-value')?.textContent).toBe('1,000');

    // Check visible validator transactions (24h): 100 + 75 = 175
    expect(statCards[2].querySelector('.bb-stat-value')?.textContent).toBe('175');

    // Check phantom validator transactions (24h): 50
    expect(statCards[3].querySelector('.bb-stat-value')?.textContent).toBe('50');
  });

  it('displays top validators sorted by transactions', () => {
    mockUseValidators.mockReturnValue({
      data: {
        validators: [
          { bakerId: 1, source: 'reporting', transactions24h: 50, transactions7d: 200, lotteryPower: 0.1 },
          { bakerId: 2, source: 'chain_only', transactions24h: 150, transactions7d: 600, lotteryPower: 0.2 },
          { bakerId: 3, source: 'reporting', transactions24h: 100, transactions7d: 400, lotteryPower: 0.15 },
        ],
      },
      isLoading: false,
      error: null,
    });

    render(<TransactionsView />);

    // Baker 2 should be first (150 txs), then Baker 3 (100 txs), then Baker 1 (50 txs)
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
          { bakerId: 1, source: 'reporting', transactions24h: 100, transactions7d: 400, lotteryPower: 0.1 },
          { bakerId: 2, source: 'chain_only', transactions24h: 50, transactions7d: 200, lotteryPower: 0.05 },
        ],
      },
      isLoading: false,
      error: null,
    });

    render(<TransactionsView />);

    expect(screen.getByText('Visible')).toBeInTheDocument();
    expect(screen.getByText('Phantom')).toBeInTheDocument();
  });

  it('formats lottery power as percentage', () => {
    mockUseValidators.mockReturnValue({
      data: {
        validators: [
          { bakerId: 1, source: 'reporting', transactions24h: 100, transactions7d: 400, lotteryPower: 0.12345 },
        ],
      },
      isLoading: false,
      error: null,
    });

    render(<TransactionsView />);

    // 0.12345 * 100 = 12.345%
    expect(screen.getByText('12.345%')).toBeInTheDocument();
  });

  it('shows -- for null lottery power', () => {
    mockUseValidators.mockReturnValue({
      data: {
        validators: [
          { bakerId: 1, source: 'reporting', transactions24h: 100, transactions7d: 400, lotteryPower: null },
        ],
      },
      isLoading: false,
      error: null,
    });

    render(<TransactionsView />);
    expect(screen.getByText('--')).toBeInTheDocument();
  });
});
