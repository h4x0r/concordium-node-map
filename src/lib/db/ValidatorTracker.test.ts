/**
 * TDD Tests for ValidatorTracker
 *
 * Tests validator tracking including:
 * - Fetching all validators from chain
 * - Distinguishing reporting vs phantom validators
 * - Calculating consensus visibility metrics
 * - Tracking state transitions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Client } from '@libsql/client';
import { ValidatorTracker, type ChainValidator } from './ValidatorTracker';
import { createTestDb } from './test-helpers';

describe('ValidatorTracker', () => {
  let db: Client;
  let tracker: ValidatorTracker;

  // Mock chain validator data (from gRPC getBakerList + getPoolStatus)
  function createMockChainValidator(overrides: Partial<ChainValidator> = {}): ChainValidator {
    return {
      bakerId: 42,
      accountAddress: '3ABC123def456...',
      equityCapital: BigInt('500000000000'),      // 500,000 CCD
      delegatedCapital: BigInt('100000000000'),   // 100,000 CCD
      totalStake: BigInt('600000000000'),         // 600,000 CCD
      lotteryPower: 0.008,                         // 0.8% of network
      openStatus: 'openForAll',
      commissionRates: {
        baking: 0.1,
        finalization: 0.1,
        transaction: 0.1,
      },
      inCurrentPayday: true,
      effectiveStake: BigInt('600000000000'),
      ...overrides,
    };
  }

  beforeEach(async () => {
    db = await createTestDb();
    tracker = new ValidatorTracker(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('processValidators', () => {
    it('stores a new validator from chain data', async () => {
      const validators = [createMockChainValidator({ bakerId: 1 })];

      const result = await tracker.processValidators(validators, []);

      expect(result.totalProcessed).toBe(1);
      expect(result.newValidators).toContain(1);

      // Verify stored in database
      const stored = await db.execute('SELECT * FROM validators WHERE baker_id = ?', [1]);
      expect(stored.rows).toHaveLength(1);
      expect(stored.rows[0].source).toBe('chain_only'); // No reporting node linked
    });

    it('identifies phantom validators (chain_only)', async () => {
      const validators = [
        createMockChainValidator({ bakerId: 1 }),
        createMockChainValidator({ bakerId: 2 }),
        createMockChainValidator({ bakerId: 3 }),
      ];

      // No reporting peers
      const result = await tracker.processValidators(validators, []);

      expect(result.phantomCount).toBe(3);
      expect(result.visibleCount).toBe(0);
    });

    it('links reporting validators to peers', async () => {
      const validators = [createMockChainValidator({ bakerId: 42 })];

      // Mock reporting peer with matching bakerId
      const reportingPeers = [{
        peerId: 'peer-abc-123',
        consensusBakerId: 42,
        nodeName: 'My Validator Node',
      }];

      const result = await tracker.processValidators(validators, reportingPeers);

      expect(result.visibleCount).toBe(1);
      expect(result.phantomCount).toBe(0);

      // Verify link in database
      const stored = await db.execute('SELECT * FROM validators WHERE baker_id = ?', [42]);
      expect(stored.rows[0].source).toBe('reporting');
      expect(stored.rows[0].linked_peer_id).toBe('peer-abc-123');
    });

    it('correctly mixes visible and phantom validators', async () => {
      const validators = [
        createMockChainValidator({ bakerId: 1 }),   // phantom
        createMockChainValidator({ bakerId: 2 }),   // visible
        createMockChainValidator({ bakerId: 3 }),   // phantom
      ];

      const reportingPeers = [{
        peerId: 'peer-visible',
        consensusBakerId: 2,
        nodeName: 'Visible Validator',
      }];

      const result = await tracker.processValidators(validators, reportingPeers);

      expect(result.visibleCount).toBe(1);
      expect(result.phantomCount).toBe(2);
      expect(result.totalProcessed).toBe(3);
    });

    it('updates existing validator data', async () => {
      // First process
      const validator = createMockChainValidator({
        bakerId: 1,
        lotteryPower: 0.005,
        totalStake: BigInt('500000000000'),
      });
      await tracker.processValidators([validator], []);

      // Second process with updated stake
      const updatedValidator = createMockChainValidator({
        bakerId: 1,
        lotteryPower: 0.010,  // doubled
        totalStake: BigInt('1000000000000'),
      });
      await tracker.processValidators([updatedValidator], []);

      // Verify updated
      const stored = await db.execute('SELECT lottery_power, total_stake FROM validators WHERE baker_id = ?', [1]);
      expect(stored.rows[0].lottery_power).toBeCloseTo(0.010);
      expect(stored.rows[0].total_stake).toBe('1000000000000');
    });
  });

  describe('detectTransitions', () => {
    it('detects phantom to visible transition', async () => {
      // First: phantom validator
      const validator = createMockChainValidator({ bakerId: 99 });
      await tracker.processValidators([validator], []);

      // Verify it's phantom
      let stored = await db.execute('SELECT source FROM validators WHERE baker_id = ?', [99]);
      expect(stored.rows[0].source).toBe('chain_only');

      // Second: now reporting
      const reportingPeers = [{
        peerId: 'peer-new-reporter',
        consensusBakerId: 99,
        nodeName: 'Newly Reporting Validator',
      }];
      const result = await tracker.processValidators([validator], reportingPeers);

      expect(result.transitions).toContainEqual({
        bakerId: 99,
        type: 'phantom_to_visible',
        linkedPeerId: 'peer-new-reporter',
      });

      // Verify transition recorded
      const transitions = await db.execute(
        'SELECT * FROM validator_transitions WHERE baker_id = ? AND transition_type = ?',
        [99, 'phantom_to_visible']
      );
      expect(transitions.rows).toHaveLength(1);
    });

    it('detects visible to phantom transition', async () => {
      const validator = createMockChainValidator({ bakerId: 50 });
      const reportingPeers = [{
        peerId: 'peer-will-disappear',
        consensusBakerId: 50,
        nodeName: 'Soon Gone',
      }];

      // First: visible
      await tracker.processValidators([validator], reportingPeers);

      // Second: peer stopped reporting
      const result = await tracker.processValidators([validator], []);

      expect(result.transitions).toContainEqual({
        bakerId: 50,
        type: 'visible_to_phantom',
        previousPeerId: 'peer-will-disappear',
      });

      // Verify source changed
      const stored = await db.execute('SELECT source FROM validators WHERE baker_id = ?', [50]);
      expect(stored.rows[0].source).toBe('chain_only');
    });

    it('detects stake changes', async () => {
      const validator = createMockChainValidator({
        bakerId: 10,
        totalStake: BigInt('1000000000000'),
      });
      await tracker.processValidators([validator], []);

      // Significant stake change (>10%)
      const updatedValidator = createMockChainValidator({
        bakerId: 10,
        totalStake: BigInt('1500000000000'), // +50%
      });
      const result = await tracker.processValidators([updatedValidator], []);

      expect(result.transitions).toContainEqual(
        expect.objectContaining({
          bakerId: 10,
          type: 'stake_changed',
        })
      );
    });
  });

  describe('calculateConsensusVisibility', () => {
    it('calculates validator coverage percentage', async () => {
      // 3 validators: 2 phantom, 1 visible
      const validators = [
        createMockChainValidator({ bakerId: 1 }),
        createMockChainValidator({ bakerId: 2 }),
        createMockChainValidator({ bakerId: 3 }),
      ];
      const reportingPeers = [{
        peerId: 'peer-1',
        consensusBakerId: 2,
        nodeName: 'Visible',
      }];

      await tracker.processValidators(validators, reportingPeers);
      const visibility = await tracker.calculateConsensusVisibility();

      expect(visibility.totalRegistered).toBe(3);
      expect(visibility.visibleReporting).toBe(1);
      expect(visibility.phantomChainOnly).toBe(2);
      expect(visibility.validatorCoveragePct).toBeCloseTo(33.33, 1);
    });

    it('calculates stake-weighted visibility', async () => {
      // Visible validator has 60% of stake
      const validators = [
        createMockChainValidator({
          bakerId: 1,
          totalStake: BigInt('600000000000'),
          lotteryPower: 0.60,
        }),
        createMockChainValidator({
          bakerId: 2,
          totalStake: BigInt('200000000000'),
          lotteryPower: 0.20,
        }),
        createMockChainValidator({
          bakerId: 3,
          totalStake: BigInt('200000000000'),
          lotteryPower: 0.20,
        }),
      ];
      const reportingPeers = [{
        peerId: 'peer-big',
        consensusBakerId: 1,  // The big staker is visible
        nodeName: 'Big Staker',
      }];

      await tracker.processValidators(validators, reportingPeers);
      const visibility = await tracker.calculateConsensusVisibility();

      // Even though only 1/3 validators visible, 60% of stake is visible
      expect(visibility.validatorCoveragePct).toBeCloseTo(33.33, 1);
      expect(visibility.stakeVisibilityPct).toBeCloseTo(60.0, 1);
      expect(visibility.visibleLotteryPower).toBeCloseTo(0.60, 2);
      expect(visibility.phantomLotteryPower).toBeCloseTo(0.40, 2);
    });

    it('determines quorum health status', async () => {
      // Healthy: >70% stake visible
      const healthyValidators = [
        createMockChainValidator({ bakerId: 1, lotteryPower: 0.80 }),
        createMockChainValidator({ bakerId: 2, lotteryPower: 0.20 }),
      ];
      const healthyPeers = [{ peerId: 'p1', consensusBakerId: 1, nodeName: 'Big' }];

      await tracker.processValidators(healthyValidators, healthyPeers);
      let visibility = await tracker.calculateConsensusVisibility();
      expect(visibility.quorumHealth).toBe('healthy');

      // Reset for degraded test
      await db.execute('DELETE FROM validators');

      // Degraded: 50-70% stake visible
      const degradedValidators = [
        createMockChainValidator({ bakerId: 1, lotteryPower: 0.60 }),
        createMockChainValidator({ bakerId: 2, lotteryPower: 0.40 }),
      ];
      const degradedPeers = [{ peerId: 'p1', consensusBakerId: 1, nodeName: 'Medium' }];

      await tracker.processValidators(degradedValidators, degradedPeers);
      visibility = await tracker.calculateConsensusVisibility();
      expect(visibility.quorumHealth).toBe('degraded');

      // Reset for critical test
      await db.execute('DELETE FROM validators');

      // Critical: <50% stake visible
      const criticalValidators = [
        createMockChainValidator({ bakerId: 1, lotteryPower: 0.30 }),
        createMockChainValidator({ bakerId: 2, lotteryPower: 0.70 }),
      ];
      const criticalPeers = [{ peerId: 'p1', consensusBakerId: 1, nodeName: 'Small' }];

      await tracker.processValidators(criticalValidators, criticalPeers);
      visibility = await tracker.calculateConsensusVisibility();
      expect(visibility.quorumHealth).toBe('critical');
    });
  });

  describe('getPhantomValidators', () => {
    it('returns only phantom validators', async () => {
      const validators = [
        createMockChainValidator({ bakerId: 1 }),
        createMockChainValidator({ bakerId: 2 }),
        createMockChainValidator({ bakerId: 3 }),
      ];
      const reportingPeers = [
        { peerId: 'p1', consensusBakerId: 2, nodeName: 'Visible' },
      ];

      await tracker.processValidators(validators, reportingPeers);
      const phantoms = await tracker.getPhantomValidators();

      expect(phantoms).toHaveLength(2);
      expect(phantoms.map(p => p.bakerId)).toContain(1);
      expect(phantoms.map(p => p.bakerId)).toContain(3);
      expect(phantoms.map(p => p.bakerId)).not.toContain(2);
    });

    it('includes chain data for phantom validators', async () => {
      const validator = createMockChainValidator({
        bakerId: 100,
        totalStake: BigInt('999000000000'),
        lotteryPower: 0.05,
        openStatus: 'closedForAll',
      });

      await tracker.processValidators([validator], []);
      const phantoms = await tracker.getPhantomValidators();

      expect(phantoms).toHaveLength(1);
      expect(phantoms[0].bakerId).toBe(100);
      expect(phantoms[0].totalStake).toBe('999000000000');
      expect(phantoms[0].lotteryPower).toBeCloseTo(0.05);
      expect(phantoms[0].openStatus).toBe('closedForAll');
    });
  });

  describe('getAllValidators', () => {
    it('returns all validators with source indication', async () => {
      const validators = [
        createMockChainValidator({ bakerId: 1 }),
        createMockChainValidator({ bakerId: 2 }),
      ];
      const reportingPeers = [
        { peerId: 'p1', consensusBakerId: 1, nodeName: 'Visible' },
      ];

      await tracker.processValidators(validators, reportingPeers);
      const all = await tracker.getAllValidators();

      expect(all).toHaveLength(2);

      const visible = all.find(v => v.bakerId === 1);
      const phantom = all.find(v => v.bakerId === 2);

      expect(visible?.source).toBe('reporting');
      expect(visible?.linkedPeerId).toBe('p1');
      expect(phantom?.source).toBe('chain_only');
      expect(phantom?.linkedPeerId).toBeNull();
    });
  });

  describe('recordConsensusSnapshot', () => {
    it('records consensus visibility snapshot', async () => {
      const validators = [
        createMockChainValidator({ bakerId: 1, lotteryPower: 0.7 }),
        createMockChainValidator({ bakerId: 2, lotteryPower: 0.3 }),
      ];
      const reportingPeers = [
        { peerId: 'p1', consensusBakerId: 1, nodeName: 'Big' },
      ];

      await tracker.processValidators(validators, reportingPeers);
      await tracker.recordConsensusSnapshot();

      const snapshots = await db.execute('SELECT * FROM consensus_snapshots ORDER BY id DESC LIMIT 1');
      expect(snapshots.rows).toHaveLength(1);
      expect(snapshots.rows[0].total_registered).toBe(2);
      expect(snapshots.rows[0].visible_reporting).toBe(1);
      expect(snapshots.rows[0].phantom_chain_only).toBe(1);
      expect(Number(snapshots.rows[0].stake_visibility_pct)).toBeCloseTo(70.0, 1);
    });
  });

  describe('getValidatorHistory', () => {
    it('returns transition history for a validator', async () => {
      const validator = createMockChainValidator({ bakerId: 77 });

      // Phase 1: phantom
      await tracker.processValidators([validator], []);

      // Phase 2: becomes visible
      const peers = [{ peerId: 'p77', consensusBakerId: 77, nodeName: 'V77' }];
      await tracker.processValidators([validator], peers);

      // Phase 3: goes phantom again
      await tracker.processValidators([validator], []);

      const history = await tracker.getValidatorHistory(77);

      expect(history.transitions).toHaveLength(2);
      expect(history.transitions[0].type).toBe('phantom_to_visible');
      expect(history.transitions[1].type).toBe('visible_to_phantom');
    });
  });
});
