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
          { bakerId: 1, source: 'reporting', transactions24h: 100, transactions7d: 500, transactions30d: 2000, lotteryPower: 0.1 },
          { bakerId: 2, source: 'chain_only', transactions24h: 50, transactions7d: 200, transactions30d: 800, lotteryPower: 0.05 },
          { bakerId: 3, source: 'reporting', transactions24h: 75, transactions7d: 300, transactions30d: 1200, lotteryPower: 0.08 },
        ],
      },
      isLoading: false,
      error: null,
    });

    render(<TransactionsView />);

    // Get all stat cards (1 combined + 2 for visible/phantom)
    const statCards = document.querySelectorAll('.bb-stat-card');
    expect(statCards.length).toBe(3);

    // Check combined card has title and 3 metrics
    const combinedCard = document.querySelector('.bb-stat-card-combined');
    expect(combinedCard).toBeInTheDocument();
    expect(combinedCard?.querySelector('.bb-stat-card-title')?.textContent).toBe('Transactions');

    // Check metrics in combined card: 225 (24h), 1,000 (7d), 4,000 (30d)
    const metrics = combinedCard?.querySelectorAll('.bb-stat-metric');
    expect(metrics?.length).toBe(3);
    expect(metrics?.[0].querySelector('.bb-stat-value')?.textContent).toBe('225');
    expect(metrics?.[1].querySelector('.bb-stat-value')?.textContent).toBe('1,000');
    expect(metrics?.[2].querySelector('.bb-stat-value')?.textContent).toBe('4,000');

    // Check visible validator transactions (24h): 100 + 75 = 175
    expect(statCards[1].querySelector('.bb-stat-value')?.textContent).toBe('175');

    // Check phantom validator transactions (24h): 50
    expect(statCards[2].querySelector('.bb-stat-value')?.textContent).toBe('50');
  });

  it('displays top validators sorted by transactions', () => {
    mockUseValidators.mockReturnValue({
      data: {
        validators: [
          { bakerId: 1, source: 'reporting', transactions24h: 50, transactions7d: 200, transactions30d: 800, lotteryPower: 0.1 },
          { bakerId: 2, source: 'chain_only', transactions24h: 150, transactions7d: 600, transactions30d: 2400, lotteryPower: 0.2 },
          { bakerId: 3, source: 'reporting', transactions24h: 100, transactions7d: 400, transactions30d: 1600, lotteryPower: 0.15 },
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
          { bakerId: 1, source: 'reporting', transactions24h: 100, transactions7d: 400, transactions30d: 1600, lotteryPower: 0.1 },
          { bakerId: 2, source: 'chain_only', transactions24h: 50, transactions7d: 200, transactions30d: 800, lotteryPower: 0.05 },
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
          { bakerId: 1, source: 'reporting', transactions24h: 100, transactions7d: 400, transactions30d: 1600, lotteryPower: 0.12345 },
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
          { bakerId: 1, source: 'reporting', transactions24h: 100, transactions7d: 400, transactions30d: 1600, lotteryPower: null },
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
          { bakerId: 1, source: 'reporting', transactions24h: 80, transactions7d: 400, transactions30d: 1600, lotteryPower: 0.4 },
          { bakerId: 2, source: 'chain_only', transactions24h: 20, transactions7d: 100, transactions30d: 400, lotteryPower: 0.1 },
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
          { bakerId: 42, source: 'reporting', transactions24h: 100, transactions7d: 400, transactions30d: 1600, lotteryPower: 0.1 },
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
      transactions30d: 1600,
      lotteryPower: 0.1,
      blocks24h: 10,
      blocks7d: 70,
      blocks30d: 300,
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
      transactions30d: 1600,
      lotteryPower: 0.1,
      blocks24h: 10,
      blocks7d: 70,
      blocks30d: 300,
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
      transactions30d: 1600,
      lotteryPower: 0.1,
      blocks24h: 10,
      blocks7d: 70,
      blocks30d: 300,
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
        transactions30d: 20000 - i * 200,
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

  describe('sort period toggle', () => {
    it('renders 24h, 7d, and 30d sort buttons', () => {
      mockUseValidators.mockReturnValue({
        data: {
          validators: [
            { bakerId: 1, source: 'reporting', transactions24h: 100, transactions7d: 500, transactions30d: 2000, lotteryPower: 0.1 },
          ],
        },
        isLoading: false,
        error: null,
      });

      render(<TransactionsView />);

      expect(screen.getByRole('button', { name: '24h' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '7d' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '30d' })).toBeInTheDocument();
    });

    it('defaults to 24h sort with active state', () => {
      mockUseValidators.mockReturnValue({
        data: {
          validators: [
            { bakerId: 1, source: 'reporting', transactions24h: 100, transactions7d: 500, transactions30d: 2000, lotteryPower: 0.1 },
          ],
        },
        isLoading: false,
        error: null,
      });

      render(<TransactionsView />);

      expect(screen.getByRole('button', { name: '24h' })).toHaveClass('active');
      expect(screen.getByRole('button', { name: '7d' })).not.toHaveClass('active');
      expect(screen.getByRole('button', { name: '30d' })).not.toHaveClass('active');
    });

    it('switches to 7d sort when clicking 7d button', () => {
      mockUseValidators.mockReturnValue({
        data: {
          validators: [
            { bakerId: 1, source: 'reporting', transactions24h: 100, transactions7d: 500, transactions30d: 2000, lotteryPower: 0.1 },
          ],
        },
        isLoading: false,
        error: null,
      });

      render(<TransactionsView />);

      fireEvent.click(screen.getByRole('button', { name: '7d' }));

      expect(screen.getByRole('button', { name: '7d' })).toHaveClass('active');
      expect(screen.getByRole('button', { name: '24h' })).not.toHaveClass('active');
      expect(screen.getByRole('button', { name: '30d' })).not.toHaveClass('active');
    });

    it('switches to 30d sort when clicking 30d button', () => {
      mockUseValidators.mockReturnValue({
        data: {
          validators: [
            { bakerId: 1, source: 'reporting', transactions24h: 100, transactions7d: 500, transactions30d: 2000, lotteryPower: 0.1 },
          ],
        },
        isLoading: false,
        error: null,
      });

      render(<TransactionsView />);

      fireEvent.click(screen.getByRole('button', { name: '30d' }));

      expect(screen.getByRole('button', { name: '30d' })).toHaveClass('active');
      expect(screen.getByRole('button', { name: '24h' })).not.toHaveClass('active');
      expect(screen.getByRole('button', { name: '7d' })).not.toHaveClass('active');
    });

    it('sorts by 7d transactions when 7d is selected', () => {
      mockUseValidators.mockReturnValue({
        data: {
          validators: [
            { bakerId: 1, source: 'reporting', transactions24h: 200, transactions7d: 100, transactions30d: 400, lotteryPower: 0.1 },
            { bakerId: 2, source: 'reporting', transactions24h: 50, transactions7d: 500, transactions30d: 2000, lotteryPower: 0.1 },
            { bakerId: 3, source: 'reporting', transactions24h: 100, transactions7d: 300, transactions30d: 1200, lotteryPower: 0.1 },
          ],
        },
        isLoading: false,
        error: null,
      });

      render(<TransactionsView />);

      // Default 24h sort: Baker 1 (200) > Baker 3 (100) > Baker 2 (50)
      let rows = screen.getAllByRole('row');
      expect(rows[1]).toHaveTextContent('1'); // Baker ID 1 first

      // Switch to 7d sort: Baker 2 (500) > Baker 3 (300) > Baker 1 (100)
      fireEvent.click(screen.getByRole('button', { name: '7d' }));

      rows = screen.getAllByRole('row');
      expect(rows[1]).toHaveTextContent('2'); // Baker ID 2 first now
    });

    it('sorts by 30d transactions when 30d is selected', () => {
      mockUseValidators.mockReturnValue({
        data: {
          validators: [
            { bakerId: 1, source: 'reporting', transactions24h: 200, transactions7d: 500, transactions30d: 100, lotteryPower: 0.1 },
            { bakerId: 2, source: 'reporting', transactions24h: 50, transactions7d: 100, transactions30d: 3000, lotteryPower: 0.1 },
            { bakerId: 3, source: 'reporting', transactions24h: 100, transactions7d: 300, transactions30d: 1500, lotteryPower: 0.1 },
          ],
        },
        isLoading: false,
        error: null,
      });

      render(<TransactionsView />);

      // Switch to 30d sort: Baker 2 (3000) > Baker 3 (1500) > Baker 1 (100)
      fireEvent.click(screen.getByRole('button', { name: '30d' }));

      const rows = screen.getAllByRole('row');
      expect(rows[1]).toHaveTextContent('2'); // Baker ID 2 first
      expect(rows[2]).toHaveTextContent('3'); // Baker ID 3 second
      expect(rows[3]).toHaveTextContent('1'); // Baker ID 1 third
    });

    it('resets to first page when changing sort period', () => {
      const validators = Array.from({ length: 20 }, (_, i) => ({
        bakerId: i + 1,
        source: 'reporting',
        transactions24h: 1000 - i * 10,
        transactions7d: i * 10, // Reverse order for 7d
        transactions30d: i * 40, // Different order for 30d
        lotteryPower: 0.01,
      }));

      mockUseValidators.mockReturnValue({
        data: { validators },
        isLoading: false,
        error: null,
      });

      render(<TransactionsView />);

      // Go to page 2
      fireEvent.click(screen.getByTitle('Next page'));
      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();

      // Switch sort period
      fireEvent.click(screen.getByRole('button', { name: '7d' }));

      // Should be back to page 1
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    });

    it('shows sort indicator on sorted column header', () => {
      mockUseValidators.mockReturnValue({
        data: {
          validators: [
            { bakerId: 1, source: 'reporting', transactions24h: 100, transactions7d: 500, transactions30d: 2000, lotteryPower: 0.1 },
          ],
        },
        isLoading: false,
        error: null,
      });

      render(<TransactionsView />);

      // 24h column should have sort indicator
      expect(screen.getByRole('columnheader', { name: /Txs \(24h\).*▼/ })).toHaveClass('bb-sorted');

      // Switch to 7d
      fireEvent.click(screen.getByRole('button', { name: '7d' }));

      // 7d column should now have sort indicator
      expect(screen.getByRole('columnheader', { name: /Txs \(7d\).*▼/ })).toHaveClass('bb-sorted');

      // Switch to 30d
      fireEvent.click(screen.getByRole('button', { name: '30d' }));

      // 30d column should now have sort indicator
      expect(screen.getByRole('columnheader', { name: /Txs \(30d\).*▼/ })).toHaveClass('bb-sorted');
    });
  });
});
