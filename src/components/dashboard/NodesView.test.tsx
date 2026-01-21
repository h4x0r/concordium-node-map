/**
 * Tests for NodesView component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NodesView } from './NodesView';
import type { ConcordiumNode } from '@/lib/transforms';
import type { Validator } from '@/lib/types/validators';

// Mock the hooks
const mockUseNodes = vi.fn();
const mockUseValidators = vi.fn();

vi.mock('@/hooks/useNodes', () => ({
  useNodes: () => mockUseNodes(),
}));

vi.mock('@/hooks/useValidators', () => ({
  useValidators: () => mockUseValidators(),
}));

// Mock useResponsivePageSize to return fixed page size for tests
vi.mock('@/hooks/useResponsivePageSize', () => ({
  useResponsivePageSize: () => 15,
}));

// Helper to create mock node
const createMockNode = (overrides: Partial<ConcordiumNode> = {}): ConcordiumNode => ({
  nodeName: 'Test Node',
  nodeId: 'node-123',
  peerType: 'Node',
  client: 'concordium-node 6.1.0',
  uptime: 86400000, // 24h
  consensusRunning: true,
  bakingCommitteeMember: 'ActiveInCommittee',
  finalizationCommitteeMember: true,
  consensusBakerId: null,
  peersCount: 10,
  finalizedBlockHeight: 1000000,
  bestBlockHeight: 1000000,
  averagePing: 50,
  // Other required fields with defaults
  averageBytesPerSecondIn: 0,
  averageBytesPerSecondOut: 0,
  bestBlock: '',
  bestBlockArriveLatencyEMA: 0,
  bestBlockArriveLatencyEMSD: 0,
  bestBlockArrivePeriodEMA: null,
  bestBlockArrivePeriodEMSD: null,
  bestBlockReceiveLatencyEMA: 0,
  bestBlockReceiveLatencyEMSD: 0,
  bestBlockReceivePeriodEMA: null,
  bestBlockReceivePeriodEMSD: null,
  blockArriveLatencyEMA: 0,
  blockArriveLatencyEMSD: 0,
  blockArrivePeriodEMA: null,
  blockArrivePeriodEMSD: null,
  blockReceiveLatencyEMA: 0,
  blockReceiveLatencyEMSD: 0,
  blockReceivePeriodEMA: null,
  blockReceivePeriodEMSD: null,
  blocksReceivedCount: 0,
  blocksVerifiedCount: 0,
  finalizationCount: 0,
  finalizationPeriodEMA: null,
  finalizationPeriodEMSD: null,
  finalizedBlock: '',
  lastFinalizedBlockHeight: 1000000,
  packetsReceived: 0,
  packetsSent: 0,
  transactionsPerBlockEMA: null,
  transactionsPerBlockEMSD: null,
  ...overrides,
});

// Helper to create mock validator
const createMockValidator = (overrides: Partial<Validator> = {}): Validator => ({
  bakerId: 1,
  accountAddress: 'acc123',
  source: 'reporting',
  linkedPeerId: null,
  equityCapital: null,
  delegatedCapital: null,
  totalStake: null,
  lotteryPower: 0.05,
  openStatus: null,
  commissionRates: { baking: null, finalization: null, transaction: null },
  inCurrentPayday: true,
  effectiveStake: null,
  lastBlockHeight: null,
  lastBlockTime: null,
  blocks24h: 100,
  blocks7d: 500,
  blocks30d: 2000,
  transactions24h: 50,
  transactions7d: 250,
  transactions30d: 1000,
  firstObserved: Date.now(),
  lastChainUpdate: null,
  stateTransitionCount: 0,
  dataCompleteness: null,
  ...overrides,
});

describe('NodesView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state while fetching data', () => {
    mockUseNodes.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });
    mockUseValidators.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });

    render(<NodesView />);
    expect(screen.getByText(/loading node data/i)).toBeInTheDocument();
  });

  it('shows error state when fetch fails', () => {
    mockUseNodes.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Network error'),
    });
    mockUseValidators.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    render(<NodesView />);
    expect(screen.getByText(/failed to load node data/i)).toBeInTheDocument();
    expect(screen.getByText(/network error/i)).toBeInTheDocument();
  });

  it('displays node stats in summary cards', () => {
    mockUseNodes.mockReturnValue({
      data: [
        createMockNode({ nodeId: 'n1', consensusBakerId: 1 }),
        createMockNode({ nodeId: 'n2', consensusBakerId: 2 }),
        createMockNode({ nodeId: 'n3', consensusBakerId: null }),
      ],
      isLoading: false,
      error: null,
    });
    mockUseValidators.mockReturnValue({
      data: {
        validators: [
          createMockValidator({ bakerId: 1, lotteryPower: 0.03 }),
          createMockValidator({ bakerId: 2, lotteryPower: 0.02 }),
        ],
      },
      isLoading: false,
      error: null,
    });

    render(<NodesView />);

    // Check combined stats card
    const statCards = document.querySelectorAll('.bb-stat-card');
    expect(statCards.length).toBe(3);

    // Check nodes breakdown in stat cards
    // Use getAllByText since numbers appear in both stats and table rows
    const statMetrics = document.querySelectorAll('.bb-stat-metric .bb-stat-value');
    expect(statMetrics.length).toBe(3);
    expect(statMetrics[0].textContent).toBe('3'); // Total nodes
    expect(statMetrics[1].textContent).toBe('2'); // Baker nodes
    expect(statMetrics[2].textContent).toBe('1'); // Non-baker nodes
  });

  it('sorts baker nodes at the top by lottery power descending', () => {
    mockUseNodes.mockReturnValue({
      data: [
        createMockNode({ nodeId: 'n1', nodeName: 'NonBaker', consensusBakerId: null }),
        createMockNode({ nodeId: 'n2', nodeName: 'LowPowerBaker', consensusBakerId: 2 }),
        createMockNode({ nodeId: 'n3', nodeName: 'HighPowerBaker', consensusBakerId: 1 }),
      ],
      isLoading: false,
      error: null,
    });
    mockUseValidators.mockReturnValue({
      data: {
        validators: [
          createMockValidator({ bakerId: 1, lotteryPower: 0.10 }), // Higher power
          createMockValidator({ bakerId: 2, lotteryPower: 0.05 }), // Lower power
        ],
      },
      isLoading: false,
      error: null,
    });

    render(<NodesView />);

    const rows = screen.getAllByRole('row');
    // First row is header, data rows start at index 1
    // Order should be: HighPowerBaker (10%), LowPowerBaker (5%), NonBaker
    expect(rows[1]).toHaveTextContent('HighPowerBaker');
    expect(rows[2]).toHaveTextContent('LowPowerBaker');
    expect(rows[3]).toHaveTextContent('NonBaker');
  });

  it('displays lottery power column with formatted percentages', () => {
    mockUseNodes.mockReturnValue({
      data: [
        createMockNode({ nodeId: 'n1', nodeName: 'Baker1', consensusBakerId: 1 }),
      ],
      isLoading: false,
      error: null,
    });
    mockUseValidators.mockReturnValue({
      data: {
        validators: [
          createMockValidator({ bakerId: 1, lotteryPower: 0.12345 }),
        ],
      },
      isLoading: false,
      error: null,
    });

    render(<NodesView />);

    // 0.12345 * 100 = 12.345%
    expect(screen.getByText('12.345%')).toBeInTheDocument();
  });

  it('shows -- for non-baker lottery power', () => {
    mockUseNodes.mockReturnValue({
      data: [
        createMockNode({ nodeId: 'n1', nodeName: 'NonBaker', consensusBakerId: null }),
      ],
      isLoading: false,
      error: null,
    });
    mockUseValidators.mockReturnValue({
      data: { validators: [] },
      isLoading: false,
      error: null,
    });

    render(<NodesView />);

    // Should show '--' for both Baker ID and Lottery Power
    const dashes = screen.getAllByText('--');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('highlights baker rows with special class', () => {
    mockUseNodes.mockReturnValue({
      data: [
        createMockNode({ nodeId: 'baker-node', consensusBakerId: 1 }),
        createMockNode({ nodeId: 'regular-node', consensusBakerId: null }),
      ],
      isLoading: false,
      error: null,
    });
    mockUseValidators.mockReturnValue({
      data: {
        validators: [createMockValidator({ bakerId: 1 })],
      },
      isLoading: false,
      error: null,
    });

    render(<NodesView />);

    const rows = screen.getAllByRole('row');
    // Baker row should have bb-baker-row class
    expect(rows[1]).toHaveClass('bb-baker-row');
    // Non-baker row should not
    expect(rows[2]).not.toHaveClass('bb-baker-row');
  });

  it('displays baker ID for baker nodes', () => {
    mockUseNodes.mockReturnValue({
      data: [
        createMockNode({ nodeId: 'n1', consensusBakerId: 42 }),
      ],
      isLoading: false,
      error: null,
    });
    mockUseValidators.mockReturnValue({
      data: {
        validators: [createMockValidator({ bakerId: 42 })],
      },
      isLoading: false,
      error: null,
    });

    render(<NodesView />);

    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('formats uptime correctly', () => {
    mockUseNodes.mockReturnValue({
      data: [
        createMockNode({ nodeId: 'n1', uptime: 5 * 60 * 60 * 1000 }), // 5 hours
        createMockNode({ nodeId: 'n2', uptime: 3 * 24 * 60 * 60 * 1000 }), // 3 days
      ],
      isLoading: false,
      error: null,
    });
    mockUseValidators.mockReturnValue({
      data: { validators: [] },
      isLoading: false,
      error: null,
    });

    render(<NodesView />);

    expect(screen.getByText('5h')).toBeInTheDocument();
    expect(screen.getByText('3d')).toBeInTheDocument();
  });
});
