/**
 * Shared test utilities for dashboard view components
 *
 * Provides:
 * - Factory functions for creating test data with sensible defaults
 * - Mock state builders for hooks
 * - DOM query helpers for common assertions
 *
 * Usage:
 *   import { createValidator, setupValidators, ... } from './__test-utils';
 */

import type { Validator } from '@/lib/types/validators';

// ============================================================================
// TYPES
// ============================================================================

export interface MockNode {
  nodeId: string;
  nodeName: string;
  consensusBakerId: number | null;
}

export interface ValidatorOverrides {
  bakerId?: number;
  source?: 'reporting' | 'chain_only';
  transactions24h?: number;
  transactions7d?: number;
  transactions30d?: number;
  blocks24h?: number;
  blocks7d?: number;
  blocks30d?: number;
  lotteryPower?: number | null;
  lastBlockTime?: number | null;
  lastBlockHeight?: number | null;
  accountAddress?: string;
  commissionRates?: { baking: number; finalization: number; transaction: number };
  openStatus?: string;
  inCurrentPayday?: boolean;
  stateTransitionCount?: number;
  dataCompleteness?: number;
}

// ============================================================================
// FACTORY COUNTERS (for unique IDs)
// ============================================================================

let validatorIdCounter = 1;
let nodeIdCounter = 1;

/**
 * Resets factory counters. Call in beforeEach for predictable IDs.
 */
export function resetFactoryCounters(): void {
  validatorIdCounter = 1;
  nodeIdCounter = 1;
}

// ============================================================================
// VALIDATOR FACTORIES
// ============================================================================

/**
 * Creates a validator with sensible defaults.
 * Override any field by passing it in the overrides object.
 *
 * @example
 * createValidator({ bakerId: 42, transactions24h: 100 })
 * createValidator({ source: 'chain_only' })
 */
export function createValidator(overrides: ValidatorOverrides = {}): Partial<Validator> {
  const id = overrides.bakerId ?? validatorIdCounter++;

  return {
    bakerId: id,
    accountAddress: `3acc${id.toString().padStart(8, '0')}`,
    source: 'reporting',
    transactions24h: 100,
    transactions7d: 500,
    transactions30d: 2000,
    blocks24h: 20,
    blocks7d: 100,
    blocks30d: 400,
    lotteryPower: 0.1,
    lastBlockTime: Date.now() - 30 * 60 * 1000,
    lastBlockHeight: 15000000,
    commissionRates: { baking: 0.1, finalization: 0.05, transaction: 0.01 },
    openStatus: 'Open',
    inCurrentPayday: true,
    stateTransitionCount: 1,
    dataCompleteness: 0.95,
    ...overrides,
  };
}

/**
 * Creates an inactive validator (zero activity across all periods).
 */
export function createInactiveValidator(overrides: ValidatorOverrides = {}): Partial<Validator> {
  return createValidator({
    transactions24h: 0,
    transactions7d: 0,
    transactions30d: 0,
    blocks24h: 0,
    blocks7d: 0,
    blocks30d: 0,
    lastBlockTime: null,
    lastBlockHeight: null,
    ...overrides,
  });
}

/**
 * Creates a phantom validator (chain_only source).
 */
export function createPhantomValidator(overrides: ValidatorOverrides = {}): Partial<Validator> {
  return createValidator({
    source: 'chain_only',
    ...overrides,
  });
}

/**
 * Creates multiple validators for pagination/sorting tests.
 * Validators have sequential IDs and descending activity counts.
 */
export function createValidatorList(
  count: number,
  baseOverrides: ValidatorOverrides = {}
): Partial<Validator>[] {
  return Array.from({ length: count }, (_, i) =>
    createValidator({
      bakerId: i + 1,
      source: i % 2 === 0 ? 'reporting' : 'chain_only',
      transactions24h: 1000 - i * 10,
      transactions7d: 5000 - i * 50,
      transactions30d: 20000 - i * 200,
      blocks24h: 100 - i,
      blocks7d: 500 - i * 5,
      blocks30d: 2000 - i * 20,
      lotteryPower: 0.01 * (count - i),
      lastBlockTime: Date.now() - i * 60 * 60 * 1000, // Hours ago
      ...baseOverrides,
    })
  );
}

// ============================================================================
// NODE FACTORIES
// ============================================================================

/**
 * Creates a mock node.
 */
export function createNode(overrides: Partial<MockNode> = {}): MockNode {
  const id = nodeIdCounter++;
  return {
    nodeId: `node-${id.toString().padStart(8, '0')}-abcdef`,
    nodeName: `Node-${id}`,
    consensusBakerId: null,
    ...overrides,
  };
}

/**
 * Creates a node linked to a specific baker.
 */
export function createBakerNode(bakerId: number, nodeName?: string): MockNode {
  return createNode({
    consensusBakerId: bakerId,
    nodeName: nodeName ?? `Validator-${bakerId}`,
  });
}

// ============================================================================
// MOCK STATE BUILDERS
// ============================================================================

/**
 * Creates useValidators hook return value.
 */
export function mockValidatorsState(
  validators: Partial<Validator>[],
  options: { isLoading?: boolean; error?: Error | null } = {}
) {
  return {
    data: options.isLoading ? null : { validators },
    isLoading: options.isLoading ?? false,
    error: options.error ?? null,
  };
}

/**
 * Creates loading state for validators.
 */
export function mockValidatorsLoading() {
  return mockValidatorsState([], { isLoading: true });
}

/**
 * Creates error state for validators.
 */
export function mockValidatorsError(message: string) {
  return mockValidatorsState([], { error: new Error(message) });
}

/**
 * Creates useNodes hook return value.
 */
export function mockNodesState(
  nodes: MockNode[],
  options: { isLoading?: boolean; error?: Error | null } = {}
) {
  return {
    data: options.isLoading ? null : nodes,
    isLoading: options.isLoading ?? false,
    error: options.error ?? null,
  };
}

/**
 * Creates empty nodes state.
 */
export function mockNodesEmpty() {
  return mockNodesState([]);
}

// ============================================================================
// DOM QUERY HELPERS
// ============================================================================

/**
 * Gets all cells in the Node Name column.
 */
export function getNodeNameCells(): NodeListOf<Element> {
  return document.querySelectorAll('.bb-node-name');
}

/**
 * Gets all No Activity badges.
 */
export function getNoActivityBadges(): Element[] {
  return Array.from(document.querySelectorAll('.bb-badge.inactive'));
}

/**
 * Gets all stat cards.
 */
export function getStatCards(): NodeListOf<Element> {
  return document.querySelectorAll('.bb-stat-card');
}

/**
 * Gets the combined stat card.
 */
export function getCombinedStatCard(): Element | null {
  return document.querySelector('.bb-stat-card-combined');
}

/**
 * Gets stat metrics from the combined card.
 */
export function getStatMetrics(): NodeListOf<Element> | undefined {
  return getCombinedStatCard()?.querySelectorAll('.bb-stat-metric');
}
