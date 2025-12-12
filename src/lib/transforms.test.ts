import { describe, it, expect } from 'vitest';
import {
  toReactFlowNodes,
  toReactFlowEdges,
  calculateNodeHealth,
  type ConcordiumNode,
} from './transforms';

// Sample node data matching API structure
const createMockNode = (overrides: Partial<ConcordiumNode> = {}): ConcordiumNode => ({
  nodeName: 'TestNode',
  nodeId: 'node-123',
  peerType: 'Node',
  client: 'concordium-node/6.3.0',
  peersCount: 5,
  peersList: ['peer-1', 'peer-2'],
  averagePing: 50,
  averageBytesPerSecondIn: 1000,
  averageBytesPerSecondOut: 800,
  bestBlock: 'abc123',
  bestBlockHeight: 1000,
  finalizedBlock: 'def456',
  finalizedBlockHeight: 998,
  consensusRunning: true,
  bakingCommitteeMember: 'ActiveInCommittee',
  finalizationCommitteeMember: true,
  consensusBakerId: 42,
  uptime: 86400000,
  blockArrivePeriodEMA: 10.5,
  blockReceivePeriodEMA: 10.2,
  transactionsPerBlockEMA: 2.5,
  ...overrides,
});

describe('calculateNodeHealth', () => {
  it('returns healthy for node within 2 blocks of max and consensus running', () => {
    const node = createMockNode({
      finalizedBlockHeight: 1000,
      consensusRunning: true,
    });
    const maxHeight = 1001;

    expect(calculateNodeHealth(node, maxHeight)).toBe('healthy');
  });

  it('returns lagging for node more than 2 blocks behind', () => {
    const node = createMockNode({
      finalizedBlockHeight: 995,
      consensusRunning: true,
    });
    const maxHeight = 1000;

    expect(calculateNodeHealth(node, maxHeight)).toBe('lagging');
  });

  it('returns issue when consensus is not running', () => {
    const node = createMockNode({
      finalizedBlockHeight: 1000,
      consensusRunning: false,
    });
    const maxHeight: number = 1000;

    expect(calculateNodeHealth(node, maxHeight)).toBe('issue');
  });
});

describe('toReactFlowNodes', () => {
  it('converts API nodes to React Flow format', () => {
    const nodes = [
      createMockNode({ nodeId: 'node-1', nodeName: 'Node One', peersCount: 10 }),
      createMockNode({ nodeId: 'node-2', nodeName: 'Node Two', peersCount: 5 }),
    ];

    const result = toReactFlowNodes(nodes);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 'node-1',
      type: 'concordiumNode',
      data: {
        label: 'Node One',
        peersCount: 10,
        health: 'healthy',
        isBaker: true,
      },
    });
    expect(result[0].position).toBeDefined();
    expect(result[0].position.x).toBeTypeOf('number');
    expect(result[0].position.y).toBeTypeOf('number');
  });

  it('marks non-baker nodes correctly', () => {
    const nodes = [
      createMockNode({
        nodeId: 'node-1',
        bakingCommitteeMember: 'NotInCommittee',
        consensusBakerId: null,
      }),
    ];

    const result = toReactFlowNodes(nodes);

    expect(result[0].data.isBaker).toBe(false);
  });

  it('handles empty array', () => {
    expect(toReactFlowNodes([])).toEqual([]);
  });
});

describe('toReactFlowEdges', () => {
  it('creates edges from peer connections', () => {
    const nodes = [
      createMockNode({ nodeId: 'node-1', peersList: ['node-2', 'node-3'] }),
      createMockNode({ nodeId: 'node-2', peersList: ['node-1'] }),
      createMockNode({ nodeId: 'node-3', peersList: ['node-1'] }),
    ];

    const result = toReactFlowEdges(nodes);

    // Should deduplicate bidirectional edges
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((edge) => edge.source && edge.target)).toBe(true);
  });

  it('deduplicates bidirectional connections', () => {
    const nodes = [
      createMockNode({ nodeId: 'A', peersList: ['B'] }),
      createMockNode({ nodeId: 'B', peersList: ['A'] }),
    ];

    const result = toReactFlowEdges(nodes);

    // A->B and B->A should become single edge
    expect(result).toHaveLength(1);
  });

  it('only creates edges for nodes that exist in the array', () => {
    const nodes = [
      createMockNode({ nodeId: 'node-1', peersList: ['node-2', 'nonexistent'] }),
      createMockNode({ nodeId: 'node-2', peersList: ['node-1'] }),
    ];

    const result = toReactFlowEdges(nodes);

    // Should not create edge to nonexistent node
    const hasNonexistent = result.some(
      (edge) => edge.source === 'nonexistent' || edge.target === 'nonexistent'
    );
    expect(hasNonexistent).toBe(false);
  });

  it('handles empty array', () => {
    expect(toReactFlowEdges([])).toEqual([]);
  });
});
