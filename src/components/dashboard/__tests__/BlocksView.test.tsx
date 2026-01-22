/**
 * Tests for BlocksView component
 *
 * Test organization:
 * 1. Loading & error states
 * 2. Summary statistics
 * 3. Validator table display
 * 4. Sorting behavior
 * 5. Node name column
 * 6. No activity badge
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BlocksView } from '../BlocksView';
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
  useResponsivePageSize: () => 15,
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

function getDataRows() {
  return screen.getAllByRole('row').slice(1);
}

function clickSortButton(period: '24h' | '7d' | '30d') {
  fireEvent.click(screen.getByRole('button', { name: period }));
}

// ============================================================================
// TESTS
// ============================================================================

describe('BlocksView', () => {
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

      render(<BlocksView />);

      expect(screen.getByText(/loading block data/i)).toBeInTheDocument();
    });

    it('shows error message when fetch fails', () => {
      mockUseValidators.mockReturnValue(mockValidatorsError('Connection timeout'));

      render(<BlocksView />);

      expect(screen.getByText(/failed to load block data/i)).toBeInTheDocument();
      expect(screen.getByText(/connection timeout/i)).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Summary Statistics
  // --------------------------------------------------------------------------

  describe('summary statistics', () => {
    it('displays aggregated block totals across all periods', () => {
      setupValidators(
        createValidator({ bakerId: 1, source: 'reporting', blocks24h: 20, blocks7d: 100, blocks30d: 400 }),
        createPhantomValidator({ bakerId: 2, blocks24h: 10, blocks7d: 50, blocks30d: 200 }),
        createValidator({ bakerId: 3, source: 'reporting', blocks24h: 15, blocks7d: 75, blocks30d: 300 })
      );

      render(<BlocksView />);

      const statCards = getStatCards();
      expect(statCards.length).toBe(3);

      const combinedCard = getCombinedStatCard();
      expect(combinedCard?.querySelector('.bb-stat-card-title')?.textContent).toBe('Blocks');

      const metrics = getStatMetrics();
      expect(metrics?.[0].querySelector('.bb-stat-value')?.textContent).toBe('45');  // 24h
      expect(metrics?.[1].querySelector('.bb-stat-value')?.textContent).toBe('225'); // 7d
      expect(metrics?.[2].querySelector('.bb-stat-value')?.textContent).toBe('900'); // 30d
    });

    it('separates visible vs phantom validator blocks', () => {
      setupValidators(
        createValidator({ bakerId: 1, source: 'reporting', blocks24h: 20 }),
        createPhantomValidator({ bakerId: 2, blocks24h: 10 }),
        createValidator({ bakerId: 3, source: 'reporting', blocks24h: 15 })
      );

      render(<BlocksView />);

      const statCards = getStatCards();
      // Visible: 20 + 15 = 35
      expect(statCards[1].querySelector('.bb-stat-value')?.textContent).toBe('35');
      // Phantom: 10
      expect(statCards[2].querySelector('.bb-stat-value')?.textContent).toBe('10');
    });

    it('displays phantom block percentage', () => {
      setupValidators(
        createValidator({ bakerId: 1, source: 'reporting', blocks24h: 80 }),
        createPhantomValidator({ bakerId: 2, blocks24h: 20 })
      );

      render(<BlocksView />);

      expect(screen.getByText(/20\.0%/)).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Validator Table Display
  // --------------------------------------------------------------------------

  describe('validator table display', () => {
    it('displays all expected column headers', () => {
      setupValidators(createValidator());

      render(<BlocksView />);

      expect(screen.getByRole('columnheader', { name: '#' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Baker ID' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Node Name' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Type' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /Blocks \(24h\)/ })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /Blocks \(7d\)/ })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /Blocks \(30d\)/ })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Last Block' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Lottery Power' })).toBeInTheDocument();
    });

    it('shows badges for visible vs phantom validators', () => {
      setupValidators(
        createValidator({ bakerId: 1, source: 'reporting' }),
        createPhantomValidator({ bakerId: 2 })
      );

      render(<BlocksView />);

      expect(screen.getByText('Visible')).toBeInTheDocument();
      expect(screen.getByText('Phantom')).toBeInTheDocument();
    });

    it('formats lottery power as percentage', () => {
      setupValidators(createValidator({ lotteryPower: 0.12345 }));

      render(<BlocksView />);

      expect(screen.getByText('12.345%')).toBeInTheDocument();
    });

    it('shows -- for null last block time', () => {
      setupValidators(createValidator({ lastBlockTime: null }));

      render(<BlocksView />);

      const dashes = screen.getAllByText('--');
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });

    it('formats last block time as relative time', () => {
      const now = Date.now();
      setupValidators(
        createValidator({ bakerId: 1, blocks24h: 30, lastBlockTime: now - 30 * 60 * 1000 }), // 30 min
        createValidator({ bakerId: 2, blocks24h: 20, lastBlockTime: now - 5 * 60 * 60 * 1000 }), // 5 hours
        createValidator({ bakerId: 3, blocks24h: 10, lastBlockTime: now - 3 * 24 * 60 * 60 * 1000 }) // 3 days
      );

      render(<BlocksView />);

      expect(screen.getByText('Just now')).toBeInTheDocument();
      expect(screen.getByText('5h ago')).toBeInTheDocument();
      expect(screen.getByText('3d ago')).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Sorting Behavior
  // --------------------------------------------------------------------------

  describe('sorting behavior', () => {
    it('defaults to 24h sort', () => {
      setupValidators(createValidator());

      render(<BlocksView />);

      expect(screen.getByRole('button', { name: '24h' })).toHaveClass('active');
    });

    it('sorts validators by blocks descending', () => {
      setupValidators(
        createValidator({ bakerId: 1, blocks24h: 10 }),
        createValidator({ bakerId: 2, blocks24h: 30 }),
        createValidator({ bakerId: 3, blocks24h: 20 })
      );

      render(<BlocksView />);

      const rows = getDataRows();
      expect(rows[0]).toHaveTextContent('2'); // Highest
      expect(rows[1]).toHaveTextContent('3');
      expect(rows[2]).toHaveTextContent('1'); // Lowest
    });

    it('switches sort period when clicking buttons', () => {
      setupValidators(
        createValidator({ bakerId: 1, blocks24h: 100, blocks7d: 10, blocks30d: 1 }),
        createValidator({ bakerId: 2, blocks24h: 1, blocks7d: 100, blocks30d: 10 }),
        createValidator({ bakerId: 3, blocks24h: 10, blocks7d: 1, blocks30d: 100 })
      );

      render(<BlocksView />);

      // 24h: 1 > 3 > 2
      expect(getDataRows()[0]).toHaveTextContent('1');

      clickSortButton('7d');
      expect(screen.getByRole('button', { name: '7d' })).toHaveClass('active');
      // 7d: 2 > 1 > 3
      expect(getDataRows()[0]).toHaveTextContent('2');

      clickSortButton('30d');
      expect(screen.getByRole('button', { name: '30d' })).toHaveClass('active');
      // 30d: 3 > 2 > 1
      expect(getDataRows()[0]).toHaveTextContent('3');
    });

    it('shows sort indicator on active column', () => {
      setupValidators(createValidator());

      render(<BlocksView />);

      expect(screen.getByRole('columnheader', { name: /Blocks \(24h\).*▼/ })).toHaveClass('bb-sorted');

      clickSortButton('7d');
      expect(screen.getByRole('columnheader', { name: /Blocks \(7d\).*▼/ })).toHaveClass('bb-sorted');
    });
  });

  // --------------------------------------------------------------------------
  // Node Name Column
  // --------------------------------------------------------------------------

  describe('node name column', () => {
    it('shows node name when baker has matching node', () => {
      setupValidators(createValidator({ bakerId: 42 }));
      setupNodes(createBakerNode(42, 'MyBlockProducer'));

      render(<BlocksView />);

      expect(screen.getByText('MyBlockProducer')).toBeInTheDocument();
    });

    it('shows truncated nodeId when nodeName is empty', () => {
      setupValidators(createValidator({ bakerId: 42 }));
      setupNodes(createNode({ nodeId: 'xyz987654321abcdef', nodeName: '', consensusBakerId: 42 }));

      render(<BlocksView />);

      expect(screen.getByText('xyz987654321...')).toBeInTheDocument();
    });

    it('shows -- when baker has no matching node', () => {
      setupValidators(createValidator({ bakerId: 99, lastBlockTime: Date.now() }));
      setupNodes(createBakerNode(42));

      render(<BlocksView />);

      const nodeNameCells = getNodeNameCells();
      expect(nodeNameCells[0]).toHaveTextContent('--');
    });

    it('handles multiple validators with different node mappings', () => {
      setupValidators(
        createValidator({ bakerId: 1, blocks24h: 50 }),
        createValidator({ bakerId: 2, blocks24h: 30 }),
        createValidator({ bakerId: 3, blocks24h: 10 })
      );
      setupNodes(
        createBakerNode(1, 'BlockMasterAlpha'),
        createBakerNode(3, 'BlockMasterGamma')
      );

      render(<BlocksView />);

      expect(screen.getByText('BlockMasterAlpha')).toBeInTheDocument();
      expect(screen.getByText('BlockMasterGamma')).toBeInTheDocument();

      const nodeNameCells = getNodeNameCells();
      expect(nodeNameCells[1]).toHaveTextContent('--');
    });
  });

  // --------------------------------------------------------------------------
  // No Activity Badge
  // --------------------------------------------------------------------------

  describe('no activity badge', () => {
    it('shows No Activity badge when all block counts are zero', () => {
      setupValidators(createInactiveValidator({ bakerId: 1 }));

      render(<BlocksView />);

      const badge = screen.getByText('No Activity');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('bb-badge', 'inactive');
    });

    it('does not show badge when 24h has blocks', () => {
      setupValidators(createValidator({ blocks24h: 5, blocks7d: 0, blocks30d: 0 }));

      render(<BlocksView />);

      expect(screen.queryByText('No Activity')).not.toBeInTheDocument();
    });

    it('does not show badge when 7d has blocks', () => {
      setupValidators(createValidator({ blocks24h: 0, blocks7d: 10, blocks30d: 0 }));

      render(<BlocksView />);

      expect(screen.queryByText('No Activity')).not.toBeInTheDocument();
    });

    it('does not show badge when 30d has blocks', () => {
      setupValidators(createValidator({ blocks24h: 0, blocks7d: 0, blocks30d: 50 }));

      render(<BlocksView />);

      expect(screen.queryByText('No Activity')).not.toBeInTheDocument();
    });

    it('shows badge alongside Visible/Phantom badge', () => {
      setupValidators(
        createInactiveValidator({ bakerId: 1, source: 'reporting' }),
        createInactiveValidator({ bakerId: 2, source: 'chain_only' })
      );

      render(<BlocksView />);

      const badges = getNoActivityBadges();
      expect(badges).toHaveLength(2);
      expect(screen.getByText('Visible')).toBeInTheDocument();
      expect(screen.getByText('Phantom')).toBeInTheDocument();
    });

    it('only shows badge for validators with zero activity', () => {
      setupValidators(
        createValidator({ bakerId: 1, blocks24h: 20 }),
        createInactiveValidator({ bakerId: 2 }),
        createValidator({ bakerId: 3, blocks24h: 5 })
      );

      render(<BlocksView />);

      const badges = getNoActivityBadges();
      expect(badges).toHaveLength(1);
    });
  });
});
