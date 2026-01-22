/**
 * Tests for TransactionsView component
 *
 * Test organization:
 * 1. Loading & error states
 * 2. Summary statistics
 * 3. Validator table display
 * 4. Sorting behavior
 * 5. Pagination
 * 6. Node name column
 * 7. No activity badge
 * 8. Baker detail panel integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransactionsView } from '../TransactionsView';
import {
  createValidator,
  createInactiveValidator,
  createPhantomValidator,
  createValidatorList,
  createBakerNode,
  createNode,
  mockValidatorsState,
  mockValidatorsLoading,
  mockValidatorsError,
  mockNodesState,
  mockNodesEmpty,
  getNodeNameCells,
  getNoActivityBadges,
  getStatCards,
  getCombinedStatCard,
  getStatMetrics,
  resetFactoryCounters,
} from './__test-utils';

// ============================================================================
// MOCK SETUP
// ============================================================================

const mockUseValidators = vi.fn();
const mockUseNodes = vi.fn();

vi.mock('@/hooks/useValidators', () => ({
  useValidators: () => mockUseValidators(),
}));

vi.mock('@/hooks/useNodes', () => ({
  useNodes: () => mockUseNodes(),
}));

vi.mock('@/hooks/useResponsivePageSize', () => ({
  useResponsivePageSize: () => 15, // Fixed page size for predictable tests
}));

// ============================================================================
// TEST HELPERS
// ============================================================================

function setupValidators(...validators: ReturnType<typeof createValidator>[]) {
  mockUseValidators.mockReturnValue(mockValidatorsState(validators));
}

function setupNodes(...nodes: ReturnType<typeof createNode>[]) {
  mockUseNodes.mockReturnValue(mockNodesState(nodes));
}

function getTableRows() {
  return screen.getAllByRole('row');
}

function getDataRows() {
  // First row is header, data rows start at index 1
  return getTableRows().slice(1);
}

function clickSortButton(period: '24h' | '7d' | '30d') {
  fireEvent.click(screen.getByRole('button', { name: period }));
}

function clickNextPage() {
  fireEvent.click(screen.getByTitle('Next page'));
}

function clickPreviousPage() {
  fireEvent.click(screen.getByTitle('Previous page'));
}

function clickFirstPage() {
  fireEvent.click(screen.getByTitle('First page'));
}

function clickLastPage() {
  fireEvent.click(screen.getByTitle('Last page'));
}

// ============================================================================
// TESTS
// ============================================================================

describe('TransactionsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFactoryCounters();
    mockUseNodes.mockReturnValue(mockNodesEmpty());
  });

  // --------------------------------------------------------------------------
  // Loading & Error States
  // --------------------------------------------------------------------------

  describe('loading & error states', () => {
    it('shows loading spinner while fetching data', () => {
      mockUseValidators.mockReturnValue(mockValidatorsLoading());

      render(<TransactionsView />);

      expect(screen.getByText(/loading transaction data/i)).toBeInTheDocument();
    });

    it('shows error message when fetch fails', () => {
      mockUseValidators.mockReturnValue(mockValidatorsError('Network error'));

      render(<TransactionsView />);

      expect(screen.getByText(/failed to load transaction data/i)).toBeInTheDocument();
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Summary Statistics
  // --------------------------------------------------------------------------

  describe('summary statistics', () => {
    it('displays aggregated transaction totals across all periods', () => {
      setupValidators(
        createValidator({ bakerId: 1, source: 'reporting', transactions24h: 100, transactions7d: 500, transactions30d: 2000 }),
        createPhantomValidator({ bakerId: 2, transactions24h: 50, transactions7d: 200, transactions30d: 800 }),
        createValidator({ bakerId: 3, source: 'reporting', transactions24h: 75, transactions7d: 300, transactions30d: 1200 })
      );

      render(<TransactionsView />);

      const statCards = getStatCards();
      expect(statCards.length).toBe(3);

      // Combined card shows all periods
      const combinedCard = getCombinedStatCard();
      expect(combinedCard?.querySelector('.bb-stat-card-title')?.textContent).toBe('Transactions');

      const metrics = getStatMetrics();
      expect(metrics?.[0].querySelector('.bb-stat-value')?.textContent).toBe('225');  // 24h
      expect(metrics?.[1].querySelector('.bb-stat-value')?.textContent).toBe('1,000'); // 7d
      expect(metrics?.[2].querySelector('.bb-stat-value')?.textContent).toBe('4,000'); // 30d
    });

    it('separates visible vs phantom validator transactions', () => {
      setupValidators(
        createValidator({ bakerId: 1, source: 'reporting', transactions24h: 100 }),
        createPhantomValidator({ bakerId: 2, transactions24h: 50 }),
        createValidator({ bakerId: 3, source: 'reporting', transactions24h: 75 })
      );

      render(<TransactionsView />);

      const statCards = getStatCards();
      // Visible: 100 + 75 = 175
      expect(statCards[1].querySelector('.bb-stat-value')?.textContent).toBe('175');
      // Phantom: 50
      expect(statCards[2].querySelector('.bb-stat-value')?.textContent).toBe('50');
    });

    it('displays phantom transaction percentage', () => {
      setupValidators(
        createValidator({ bakerId: 1, source: 'reporting', transactions24h: 80 }),
        createPhantomValidator({ bakerId: 2, transactions24h: 20 })
      );

      render(<TransactionsView />);

      // 20 / 100 = 20%
      expect(screen.getByText(/20\.0%/)).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Validator Table Display
  // --------------------------------------------------------------------------

  describe('validator table display', () => {
    it('displays all expected column headers', () => {
      setupValidators(createValidator());

      render(<TransactionsView />);

      expect(screen.getByRole('columnheader', { name: '#' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Baker ID' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Node Name' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Type' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /Txs \(24h\)/ })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /Txs \(7d\)/ })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /Txs \(30d\)/ })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Lottery Power' })).toBeInTheDocument();
    });

    it('shows badges for visible vs phantom validators', () => {
      setupValidators(
        createValidator({ bakerId: 1, source: 'reporting' }),
        createPhantomValidator({ bakerId: 2 })
      );

      render(<TransactionsView />);

      expect(screen.getByText('Visible')).toBeInTheDocument();
      expect(screen.getByText('Phantom')).toBeInTheDocument();
    });

    it('formats lottery power as percentage with 3 decimal places', () => {
      setupValidators(createValidator({ lotteryPower: 0.12345 }));

      render(<TransactionsView />);

      expect(screen.getByText('12.345%')).toBeInTheDocument();
    });

    it('shows -- for null lottery power', () => {
      setupValidators(createValidator({ lotteryPower: null }));

      render(<TransactionsView />);

      // Multiple '--' may exist (node name + lottery power)
      const dashes = screen.getAllByText('--');
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });

    it('displays validator count', () => {
      setupValidators(...createValidatorList(25));

      render(<TransactionsView />);

      expect(screen.getByText('25 validators')).toBeInTheDocument();
    });

    it('renders baker IDs as clickable buttons', () => {
      setupValidators(createValidator({ bakerId: 42 }));

      render(<TransactionsView />);

      const bakerButton = screen.getByRole('button', { name: '42' });
      expect(bakerButton).toHaveClass('bb-baker-link');
    });
  });

  // --------------------------------------------------------------------------
  // Sorting Behavior
  // --------------------------------------------------------------------------

  describe('sorting behavior', () => {
    it('defaults to 24h sort with active state', () => {
      setupValidators(createValidator());

      render(<TransactionsView />);

      expect(screen.getByRole('button', { name: '24h' })).toHaveClass('active');
      expect(screen.getByRole('button', { name: '7d' })).not.toHaveClass('active');
      expect(screen.getByRole('button', { name: '30d' })).not.toHaveClass('active');
    });

    it('sorts validators by 24h transactions descending by default', () => {
      setupValidators(
        createValidator({ bakerId: 1, transactions24h: 50 }),
        createValidator({ bakerId: 2, transactions24h: 150 }),
        createValidator({ bakerId: 3, transactions24h: 100 })
      );

      render(<TransactionsView />);

      const rows = getDataRows();
      expect(rows[0]).toHaveTextContent('2'); // Highest 24h
      expect(rows[1]).toHaveTextContent('3');
      expect(rows[2]).toHaveTextContent('1'); // Lowest 24h
    });

    it('switches to 7d sort when clicking 7d button', () => {
      setupValidators(
        createValidator({ bakerId: 1, transactions24h: 200, transactions7d: 100 }),
        createValidator({ bakerId: 2, transactions24h: 50, transactions7d: 500 }),
        createValidator({ bakerId: 3, transactions24h: 100, transactions7d: 300 })
      );

      render(<TransactionsView />);

      clickSortButton('7d');

      expect(screen.getByRole('button', { name: '7d' })).toHaveClass('active');

      const rows = getDataRows();
      expect(rows[0]).toHaveTextContent('2'); // Highest 7d (500)
      expect(rows[1]).toHaveTextContent('3'); // 300
      expect(rows[2]).toHaveTextContent('1'); // Lowest 7d (100)
    });

    it('switches to 30d sort when clicking 30d button', () => {
      setupValidators(
        createValidator({ bakerId: 1, transactions30d: 100 }),
        createValidator({ bakerId: 2, transactions30d: 3000 }),
        createValidator({ bakerId: 3, transactions30d: 1500 })
      );

      render(<TransactionsView />);

      clickSortButton('30d');

      expect(screen.getByRole('button', { name: '30d' })).toHaveClass('active');

      const rows = getDataRows();
      expect(rows[0]).toHaveTextContent('2'); // Highest 30d
      expect(rows[1]).toHaveTextContent('3');
      expect(rows[2]).toHaveTextContent('1'); // Lowest 30d
    });

    it('shows sort indicator on active column header', () => {
      setupValidators(createValidator());

      render(<TransactionsView />);

      // Initially 24h
      expect(screen.getByRole('columnheader', { name: /Txs \(24h\).*▼/ })).toHaveClass('bb-sorted');

      clickSortButton('7d');
      expect(screen.getByRole('columnheader', { name: /Txs \(7d\).*▼/ })).toHaveClass('bb-sorted');

      clickSortButton('30d');
      expect(screen.getByRole('columnheader', { name: /Txs \(30d\).*▼/ })).toHaveClass('bb-sorted');
    });

    it('resets to first page when changing sort period', () => {
      setupValidators(...createValidatorList(20));

      render(<TransactionsView />);

      clickNextPage();
      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();

      clickSortButton('7d');
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Pagination
  // --------------------------------------------------------------------------

  describe('pagination', () => {
    it('shows pagination controls when validators exceed page size', () => {
      setupValidators(...createValidatorList(20));

      render(<TransactionsView />);

      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
      expect(screen.getByTitle('Next page')).toBeInTheDocument();
      expect(screen.getByTitle('Previous page')).toBeInTheDocument();
    });

    it('hides pagination when validators fit on one page', () => {
      setupValidators(...createValidatorList(10));

      render(<TransactionsView />);

      expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
    });

    it('navigates to next page', () => {
      setupValidators(...createValidatorList(20));

      render(<TransactionsView />);

      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

      clickNextPage();

      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    });

    it('navigates to previous page', () => {
      setupValidators(...createValidatorList(20));

      render(<TransactionsView />);

      clickNextPage();
      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();

      clickPreviousPage();
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    });

    it('disables previous/first buttons on first page', () => {
      setupValidators(...createValidatorList(20));

      render(<TransactionsView />);

      expect(screen.getByTitle('Previous page')).toBeDisabled();
      expect(screen.getByTitle('First page')).toBeDisabled();
    });

    it('disables next/last buttons on last page', () => {
      setupValidators(...createValidatorList(20));

      render(<TransactionsView />);

      clickLastPage();

      expect(screen.getByTitle('Next page')).toBeDisabled();
      expect(screen.getByTitle('Last page')).toBeDisabled();
    });

    it('shows rank numbers relative to overall position', () => {
      setupValidators(...createValidatorList(5));

      render(<TransactionsView />);

      expect(screen.getByRole('columnheader', { name: '#' })).toBeInTheDocument();
      expect(screen.getByText('5 validators')).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Node Name Column
  // --------------------------------------------------------------------------

  describe('node name column', () => {
    it('shows node name when baker has matching node', () => {
      setupValidators(createValidator({ bakerId: 42 }));
      setupNodes(createBakerNode(42, 'MyValidatorNode'));

      render(<TransactionsView />);

      expect(screen.getByText('MyValidatorNode')).toBeInTheDocument();
    });

    it('shows truncated nodeId when nodeName is empty', () => {
      setupValidators(createValidator({ bakerId: 42 }));
      setupNodes(createNode({ nodeId: 'abcdef123456789xyz', nodeName: '', consensusBakerId: 42 }));

      render(<TransactionsView />);

      expect(screen.getByText('abcdef123456...')).toBeInTheDocument();
    });

    it('shows -- when baker has no matching node', () => {
      setupValidators(createValidator({ bakerId: 99 }));
      setupNodes(createBakerNode(42, 'DifferentValidator')); // Different baker

      render(<TransactionsView />);

      const nodeNameCells = getNodeNameCells();
      expect(nodeNameCells[0]).toHaveTextContent('--');
    });

    it('handles multiple validators with different node mappings', () => {
      setupValidators(
        createValidator({ bakerId: 1, transactions24h: 300 }),
        createValidator({ bakerId: 2, transactions24h: 200 }),
        createValidator({ bakerId: 3, transactions24h: 100 })
      );
      setupNodes(
        createBakerNode(1, 'ValidatorAlpha'),
        createBakerNode(3, 'ValidatorGamma')
        // No node for bakerId 2
      );

      render(<TransactionsView />);

      expect(screen.getByText('ValidatorAlpha')).toBeInTheDocument();
      expect(screen.getByText('ValidatorGamma')).toBeInTheDocument();

      const nodeNameCells = getNodeNameCells();
      expect(nodeNameCells[1]).toHaveTextContent('--'); // Baker 2 (middle row)
    });
  });

  // --------------------------------------------------------------------------
  // No Activity Badge
  // --------------------------------------------------------------------------

  describe('no activity badge', () => {
    it('shows No Activity badge when all transaction counts are zero', () => {
      setupValidators(createInactiveValidator({ bakerId: 1 }));

      render(<TransactionsView />);

      const badge = screen.getByText('No Activity');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('bb-badge', 'inactive');
    });

    it('does not show badge when 24h has transactions', () => {
      setupValidators(createValidator({ transactions24h: 5, transactions7d: 0, transactions30d: 0 }));

      render(<TransactionsView />);

      expect(screen.queryByText('No Activity')).not.toBeInTheDocument();
    });

    it('does not show badge when 7d has transactions', () => {
      setupValidators(createValidator({ transactions24h: 0, transactions7d: 10, transactions30d: 0 }));

      render(<TransactionsView />);

      expect(screen.queryByText('No Activity')).not.toBeInTheDocument();
    });

    it('does not show badge when 30d has transactions', () => {
      setupValidators(createValidator({ transactions24h: 0, transactions7d: 0, transactions30d: 50 }));

      render(<TransactionsView />);

      expect(screen.queryByText('No Activity')).not.toBeInTheDocument();
    });

    it('shows No Activity alongside Visible/Phantom badge', () => {
      setupValidators(
        createInactiveValidator({ bakerId: 1, source: 'reporting' }),
        createInactiveValidator({ bakerId: 2, source: 'chain_only' })
      );

      render(<TransactionsView />);

      const noActivityBadges = getNoActivityBadges();
      expect(noActivityBadges).toHaveLength(2);
      expect(screen.getByText('Visible')).toBeInTheDocument();
      expect(screen.getByText('Phantom')).toBeInTheDocument();
    });

    it('only shows badge for validators with zero activity', () => {
      setupValidators(
        createValidator({ bakerId: 1, transactions24h: 100 }),
        createInactiveValidator({ bakerId: 2 }),
        createValidator({ bakerId: 3, transactions24h: 50 })
      );

      render(<TransactionsView />);

      const noActivityBadges = getNoActivityBadges();
      expect(noActivityBadges).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // Baker Detail Panel Integration
  // --------------------------------------------------------------------------

  describe('baker detail panel integration', () => {
    it('opens panel when clicking baker ID', () => {
      setupValidators(createValidator({ bakerId: 42 }));

      render(<TransactionsView />);

      fireEvent.click(screen.getByRole('button', { name: '42' }));

      expect(screen.getByText('Baker Details')).toBeInTheDocument();
      expect(screen.getByText(/Baker #42/)).toBeInTheDocument();
    });

    it('closes panel when clicking close button', () => {
      setupValidators(createValidator({ bakerId: 42 }));

      render(<TransactionsView />);

      fireEvent.click(screen.getByRole('button', { name: '42' }));
      expect(screen.getByText('Baker Details')).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Close'));
      expect(screen.queryByText('Baker Details')).not.toBeInTheDocument();
    });

    it('closes panel when clicking overlay', () => {
      setupValidators(createValidator({ bakerId: 42 }));

      render(<TransactionsView />);

      fireEvent.click(screen.getByRole('button', { name: '42' }));
      expect(screen.getByText('Baker Details')).toBeInTheDocument();

      const overlay = document.querySelector('.bdp-overlay');
      fireEvent.click(overlay!);
      expect(screen.queryByText('Baker Details')).not.toBeInTheDocument();
    });
  });
});
