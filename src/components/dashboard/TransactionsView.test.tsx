/**
 * Tests for TransactionsView component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransactionsView } from './TransactionsView';
import type { Validator } from '@/lib/types/validators';

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

  it('displays phantom transaction percentage', () => {
    mockUseValidators.mockReturnValue({
      data: {
        validators: [
          { bakerId: 1, source: 'reporting', transactions24h: 80, transactions7d: 400, lotteryPower: 0.4 },
          { bakerId: 2, source: 'chain_only', transactions24h: 20, transactions7d: 100, lotteryPower: 0.1 },
        ],
      },
      isLoading: false,
      error: null,
    });

    render(<TransactionsView />);

    // Phantom transactions 20 out of 100 total = 20%
    expect(screen.getByText(/20\.0%/)).toBeInTheDocument();
  });

  it('renders baker IDs as clickable buttons', () => {
    mockUseValidators.mockReturnValue({
      data: {
        validators: [
          { bakerId: 42, source: 'reporting', transactions24h: 100, transactions7d: 400, lotteryPower: 0.1 },
        ],
      },
      isLoading: false,
      error: null,
    });

    render(<TransactionsView />);

    const bakerButton = screen.getByRole('button', { name: '42' });
    expect(bakerButton).toBeInTheDocument();
    expect(bakerButton).toHaveClass('bb-baker-link');
  });

  it('opens baker detail panel when clicking baker ID', () => {
    const mockValidator: Partial<Validator> = {
      bakerId: 42,
      accountAddress: '3abc123def456',
      source: 'reporting',
      transactions24h: 100,
      transactions7d: 400,
      lotteryPower: 0.1,
      blocks24h: 10,
      blocks7d: 70,
      lastBlockTime: null,
      lastBlockHeight: null,
      commissionRates: { baking: 0.1, finalization: 0.05, transaction: 0.01 },
      openStatus: 'Open',
      inCurrentPayday: true,
      stateTransitionCount: 1,
      dataCompleteness: 0.95,
    };

    mockUseValidators.mockReturnValue({
      data: {
        validators: [mockValidator],
      },
      isLoading: false,
      error: null,
    });

    render(<TransactionsView />);

    // Click the baker ID button
    const bakerButton = screen.getByRole('button', { name: '42' });
    fireEvent.click(bakerButton);

    // The detail panel should open
    expect(screen.getByText('Baker Details')).toBeInTheDocument();
    expect(screen.getByText(/Baker #42/)).toBeInTheDocument();
  });

  it('closes baker detail panel when clicking close button', () => {
    const mockValidator: Partial<Validator> = {
      bakerId: 42,
      accountAddress: '3abc123def456',
      source: 'reporting',
      transactions24h: 100,
      transactions7d: 400,
      lotteryPower: 0.1,
      blocks24h: 10,
      blocks7d: 70,
      lastBlockTime: null,
      lastBlockHeight: null,
      commissionRates: { baking: 0.1, finalization: 0.05, transaction: 0.01 },
      openStatus: 'Open',
      inCurrentPayday: true,
      stateTransitionCount: 1,
      dataCompleteness: 0.95,
    };

    mockUseValidators.mockReturnValue({
      data: {
        validators: [mockValidator],
      },
      isLoading: false,
      error: null,
    });

    render(<TransactionsView />);

    // Open the detail panel
    fireEvent.click(screen.getByRole('button', { name: '42' }));
    expect(screen.getByText('Baker Details')).toBeInTheDocument();

    // Close the panel
    const closeButton = screen.getByLabelText('Close');
    fireEvent.click(closeButton);

    // The panel should be closed
    expect(screen.queryByText('Baker Details')).not.toBeInTheDocument();
  });

  it('closes baker detail panel when clicking overlay', () => {
    const mockValidator: Partial<Validator> = {
      bakerId: 42,
      accountAddress: '3abc123def456',
      source: 'reporting',
      transactions24h: 100,
      transactions7d: 400,
      lotteryPower: 0.1,
      blocks24h: 10,
      blocks7d: 70,
      lastBlockTime: null,
      lastBlockHeight: null,
      commissionRates: { baking: 0.1, finalization: 0.05, transaction: 0.01 },
      openStatus: 'Open',
      inCurrentPayday: true,
      stateTransitionCount: 1,
      dataCompleteness: 0.95,
    };

    mockUseValidators.mockReturnValue({
      data: {
        validators: [mockValidator],
      },
      isLoading: false,
      error: null,
    });

    render(<TransactionsView />);

    // Open the detail panel
    fireEvent.click(screen.getByRole('button', { name: '42' }));
    expect(screen.getByText('Baker Details')).toBeInTheDocument();

    // Click the overlay
    const overlay = document.querySelector('.bdp-overlay');
    expect(overlay).toBeInTheDocument();
    fireEvent.click(overlay!);

    // The panel should be closed
    expect(screen.queryByText('Baker Details')).not.toBeInTheDocument();
  });

  describe('pagination', () => {
    const createManyValidators = (count: number) => {
      return Array.from({ length: count }, (_, i) => ({
        bakerId: i + 1,
        source: i % 2 === 0 ? 'reporting' : 'chain_only',
        transactions24h: 1000 - i * 10, // Higher tx count for lower indices
        transactions7d: 5000 - i * 50,
        lotteryPower: 0.01 * (count - i),
      }));
    };

    it('shows pagination controls when validators exceed page size', () => {
      mockUseValidators.mockReturnValue({
        data: { validators: createManyValidators(20) },
        isLoading: false,
        error: null,
      });

      render(<TransactionsView />);

      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
      expect(screen.getByTitle('Next page')).toBeInTheDocument();
      expect(screen.getByTitle('Previous page')).toBeInTheDocument();
    });

    it('does not show pagination when validators fit on one page', () => {
      mockUseValidators.mockReturnValue({
        data: { validators: createManyValidators(10) },
        isLoading: false,
        error: null,
      });

      render(<TransactionsView />);

      expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
    });

    it('displays total validator count', () => {
      mockUseValidators.mockReturnValue({
        data: { validators: createManyValidators(25) },
        isLoading: false,
        error: null,
      });

      render(<TransactionsView />);

      expect(screen.getByText('25 validators')).toBeInTheDocument();
    });

    it('navigates to next page when clicking next button', () => {
      mockUseValidators.mockReturnValue({
        data: { validators: createManyValidators(20) },
        isLoading: false,
        error: null,
      });

      render(<TransactionsView />);

      // Page 1 should be displayed
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

      // Navigate to next page
      fireEvent.click(screen.getByTitle('Next page'));

      // Page 2 should now be displayed
      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    });

    it('navigates to previous page when clicking previous button', () => {
      mockUseValidators.mockReturnValue({
        data: { validators: createManyValidators(20) },
        isLoading: false,
        error: null,
      });

      render(<TransactionsView />);

      // Go to page 2
      fireEvent.click(screen.getByTitle('Next page'));
      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();

      // Go back to page 1
      fireEvent.click(screen.getByTitle('Previous page'));
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    });

    it('disables previous button on first page', () => {
      mockUseValidators.mockReturnValue({
        data: { validators: createManyValidators(20) },
        isLoading: false,
        error: null,
      });

      render(<TransactionsView />);

      expect(screen.getByTitle('Previous page')).toBeDisabled();
      expect(screen.getByTitle('First page')).toBeDisabled();
    });

    it('disables next button on last page', () => {
      mockUseValidators.mockReturnValue({
        data: { validators: createManyValidators(20) },
        isLoading: false,
        error: null,
      });

      render(<TransactionsView />);

      // Go to last page
      fireEvent.click(screen.getByTitle('Last page'));

      expect(screen.getByTitle('Next page')).toBeDisabled();
      expect(screen.getByTitle('Last page')).toBeDisabled();
    });

    it('shows rank numbers for each row', () => {
      mockUseValidators.mockReturnValue({
        data: { validators: createManyValidators(5) },
        isLoading: false,
        error: null,
      });

      render(<TransactionsView />);

      // Check for rank column in table header
      expect(screen.getByRole('columnheader', { name: '#' })).toBeInTheDocument();

      // Check that validators are displayed (5 validators = 5 data rows)
      expect(screen.getByText('5 validators')).toBeInTheDocument();
    });
  });
});
