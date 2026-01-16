/**
 * TDD Tests for ConsensusAlerts (RED Phase)
 *
 * Tests for alerting on consensus visibility issues:
 * - Alert when phantom block percentage exceeds threshold
 * - Alert when stake visibility degrades
 * - Alert when quorum health changes
 * - Track alert history for forensic audit trail
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Client } from '@libsql/client';
import { ConsensusAlerts, type Alert, type AlertType, type AlertSeverity } from './ConsensusAlerts';
import { ValidatorTracker, type ChainValidator } from './ValidatorTracker';
import { BlockTracker, type BlockInfo } from './BlockTracker';
import { createTestDb } from './test-helpers';

describe('ConsensusAlerts', () => {
  let db: Client;
  let alerts: ConsensusAlerts;
  let validatorTracker: ValidatorTracker;
  let blockTracker: BlockTracker;

  // Helper to create mock chain validators
  function createMockChainValidator(overrides: Partial<ChainValidator> = {}): ChainValidator {
    return {
      bakerId: 42,
      accountAddress: '3ABC123...',
      equityCapital: BigInt('500000000000'),
      delegatedCapital: BigInt('100000000000'),
      totalStake: BigInt('600000000000'),
      lotteryPower: 0.5,
      openStatus: 'openForAll',
      commissionRates: { baking: 0.1, finalization: 0.1, transaction: 0.1 },
      inCurrentPayday: true,
      effectiveStake: BigInt('600000000000'),
      ...overrides,
    };
  }

  // Helper to create mock block info
  function createMockBlockInfo(
    height: number,
    bakerId: number,
    timestamp: number = Date.now()
  ): BlockInfo {
    return {
      height,
      bakerId,
      timestamp,
      hash: `block-${height}-${bakerId}`,
    };
  }

  beforeEach(async () => {
    db = await createTestDb();
    validatorTracker = new ValidatorTracker(db);
    blockTracker = new BlockTracker(db);
    alerts = new ConsensusAlerts(db, {
      phantomBlockThreshold: 30, // Alert if >30% blocks from phantoms
      stakeVisibilityWarning: 70, // Warn if <70% stake visible
      stakeVisibilityCritical: 50, // Critical if <50% stake visible
    });
  });

  afterEach(() => {
    db.close();
  });

  describe('checkPhantomBlockAlert', () => {
    it('triggers alert when phantom block percentage exceeds threshold', async () => {
      // Setup: 1 visible, 1 phantom validator
      await validatorTracker.processValidators([
        createMockChainValidator({ bakerId: 1, lotteryPower: 0.5 }),  // visible
        createMockChainValidator({ bakerId: 2, lotteryPower: 0.5 }),  // phantom
      ], [{ peerId: 'peer-1', consensusBakerId: 1, nodeName: 'Visible' }]);

      const now = Date.now();
      // 4 blocks from phantom (baker 2), 1 from visible (baker 1) = 80% phantom
      const blocks: BlockInfo[] = [
        createMockBlockInfo(1000, 2, now - 1000),
        createMockBlockInfo(1001, 2, now - 2000),
        createMockBlockInfo(1002, 2, now - 3000),
        createMockBlockInfo(1003, 2, now - 4000),
        createMockBlockInfo(1004, 1, now - 5000),
      ];

      await blockTracker.processBlocks(blocks);

      const result = await alerts.checkPhantomBlockAlert(24 * 60 * 60 * 1000);

      expect(result.triggered).toBe(true);
      expect(result.alert?.type).toBe('phantom_blocks_high');
      expect(result.alert?.severity).toBe('warning');
      expect(result.phantomBlockPct).toBeCloseTo(80, 0);
    });

    it('does not trigger when phantom blocks below threshold', async () => {
      await validatorTracker.processValidators([
        createMockChainValidator({ bakerId: 1, lotteryPower: 0.5 }),
        createMockChainValidator({ bakerId: 2, lotteryPower: 0.5 }),
      ], [{ peerId: 'peer-1', consensusBakerId: 1, nodeName: 'Visible' }]);

      const now = Date.now();
      // 1 phantom, 4 visible = 20% phantom (below 30% threshold)
      const blocks: BlockInfo[] = [
        createMockBlockInfo(1000, 1, now - 1000),
        createMockBlockInfo(1001, 1, now - 2000),
        createMockBlockInfo(1002, 1, now - 3000),
        createMockBlockInfo(1003, 1, now - 4000),
        createMockBlockInfo(1004, 2, now - 5000),
      ];

      await blockTracker.processBlocks(blocks);

      const result = await alerts.checkPhantomBlockAlert(24 * 60 * 60 * 1000);

      expect(result.triggered).toBe(false);
      expect(result.alert).toBeUndefined();
    });
  });

  describe('checkStakeVisibilityAlert', () => {
    it('triggers warning when stake visibility drops below warning threshold', async () => {
      // 60% lottery power visible (below 70% warning threshold)
      await validatorTracker.processValidators([
        createMockChainValidator({ bakerId: 1, lotteryPower: 0.60 }),  // visible
        createMockChainValidator({ bakerId: 2, lotteryPower: 0.40 }),  // phantom
      ], [{ peerId: 'peer-1', consensusBakerId: 1, nodeName: 'Visible' }]);

      const result = await alerts.checkStakeVisibilityAlert();

      expect(result.triggered).toBe(true);
      expect(result.alert?.type).toBe('stake_visibility_low');
      expect(result.alert?.severity).toBe('warning');
      expect(result.stakeVisibilityPct).toBeCloseTo(60, 0);
    });

    it('triggers critical when stake visibility drops below critical threshold', async () => {
      // 40% lottery power visible (below 50% critical threshold)
      await validatorTracker.processValidators([
        createMockChainValidator({ bakerId: 1, lotteryPower: 0.40 }),  // visible
        createMockChainValidator({ bakerId: 2, lotteryPower: 0.60 }),  // phantom
      ], [{ peerId: 'peer-1', consensusBakerId: 1, nodeName: 'Visible' }]);

      const result = await alerts.checkStakeVisibilityAlert();

      expect(result.triggered).toBe(true);
      expect(result.alert?.type).toBe('stake_visibility_low');
      expect(result.alert?.severity).toBe('critical');
    });

    it('does not trigger when stake visibility is healthy', async () => {
      // 80% lottery power visible (above 70% threshold)
      await validatorTracker.processValidators([
        createMockChainValidator({ bakerId: 1, lotteryPower: 0.80 }),  // visible
        createMockChainValidator({ bakerId: 2, lotteryPower: 0.20 }),  // phantom
      ], [{ peerId: 'peer-1', consensusBakerId: 1, nodeName: 'Visible' }]);

      const result = await alerts.checkStakeVisibilityAlert();

      expect(result.triggered).toBe(false);
    });
  });

  describe('checkQuorumHealthAlert', () => {
    it('triggers alert when quorum health changes from healthy to degraded', async () => {
      // First: healthy state
      await validatorTracker.processValidators([
        createMockChainValidator({ bakerId: 1, lotteryPower: 0.80 }),
        createMockChainValidator({ bakerId: 2, lotteryPower: 0.20 }),
      ], [{ peerId: 'peer-1', consensusBakerId: 1, nodeName: 'Visible' }]);

      // Record healthy snapshot
      await alerts.recordQuorumHealthSnapshot('healthy');

      // Simulate degradation: visible validator stops reporting
      await validatorTracker.processValidators([
        createMockChainValidator({ bakerId: 1, lotteryPower: 0.60 }),
        createMockChainValidator({ bakerId: 2, lotteryPower: 0.40 }),
      ], [{ peerId: 'peer-1', consensusBakerId: 1, nodeName: 'Visible' }]);

      const result = await alerts.checkQuorumHealthAlert();

      expect(result.triggered).toBe(true);
      expect(result.alert?.type).toBe('quorum_health_change');
      expect(result.previousHealth).toBe('healthy');
      expect(result.currentHealth).toBe('degraded');
    });

    it('triggers critical alert when quorum goes critical', async () => {
      // Record previous degraded state
      await alerts.recordQuorumHealthSnapshot('degraded');

      // Setup critical state
      await validatorTracker.processValidators([
        createMockChainValidator({ bakerId: 1, lotteryPower: 0.30 }),  // visible
        createMockChainValidator({ bakerId: 2, lotteryPower: 0.70 }),  // phantom
      ], [{ peerId: 'peer-1', consensusBakerId: 1, nodeName: 'Visible' }]);

      const result = await alerts.checkQuorumHealthAlert();

      expect(result.triggered).toBe(true);
      expect(result.alert?.severity).toBe('critical');
      expect(result.currentHealth).toBe('critical');
    });
  });

  describe('recordAlert', () => {
    it('stores alerts in database', async () => {
      const alert: Alert = {
        type: 'phantom_blocks_high',
        severity: 'warning',
        message: 'Phantom block percentage at 80%',
        timestamp: Date.now(),
        metadata: { phantomBlockPct: 80 },
      };

      await alerts.recordAlert(alert);

      const stored = await db.execute(
        'SELECT * FROM consensus_alerts ORDER BY id DESC LIMIT 1'
      );
      expect(stored.rows).toHaveLength(1);
      expect(stored.rows[0].alert_type).toBe('phantom_blocks_high');
      expect(stored.rows[0].severity).toBe('warning');
    });

    it('avoids duplicate alerts within cooldown period', async () => {
      const alert: Alert = {
        type: 'phantom_blocks_high',
        severity: 'warning',
        message: 'Phantom block percentage high',
        timestamp: Date.now(),
        metadata: {},
      };

      // Record first alert
      await alerts.recordAlert(alert);

      // Try to record same type immediately (should be suppressed)
      const secondResult = await alerts.recordAlert(alert);

      expect(secondResult.recorded).toBe(false);
      expect(secondResult.reason).toBe('cooldown');

      const stored = await db.execute(
        "SELECT COUNT(*) as count FROM consensus_alerts WHERE alert_type = 'phantom_blocks_high'"
      );
      expect(Number(stored.rows[0].count)).toBe(1);
    });
  });

  describe('getRecentAlerts', () => {
    it('returns alerts sorted by timestamp descending', async () => {
      const now = Date.now();

      await alerts.recordAlert({
        type: 'phantom_blocks_high',
        severity: 'warning',
        message: 'First alert',
        timestamp: now - 2000,
        metadata: {},
      });

      // Force bypass cooldown for testing
      await new Promise((resolve) => setTimeout(resolve, 100));

      await alerts.recordAlert({
        type: 'stake_visibility_low',
        severity: 'critical',
        message: 'Second alert',
        timestamp: now - 1000,
        metadata: {},
      });

      const recent = await alerts.getRecentAlerts(10);

      expect(recent).toHaveLength(2);
      expect(recent[0].type).toBe('stake_visibility_low');
      expect(recent[1].type).toBe('phantom_blocks_high');
    });
  });

  describe('runAllChecks', () => {
    it('runs all alert checks and returns combined results', async () => {
      // Setup: critical visibility
      await validatorTracker.processValidators([
        createMockChainValidator({ bakerId: 1, lotteryPower: 0.30 }),
        createMockChainValidator({ bakerId: 2, lotteryPower: 0.70 }),
      ], [{ peerId: 'peer-1', consensusBakerId: 1, nodeName: 'Visible' }]);

      const now = Date.now();
      // 80% phantom blocks
      const blocks: BlockInfo[] = [
        createMockBlockInfo(1000, 2, now - 1000),
        createMockBlockInfo(1001, 2, now - 2000),
        createMockBlockInfo(1002, 2, now - 3000),
        createMockBlockInfo(1003, 2, now - 4000),
        createMockBlockInfo(1004, 1, now - 5000),
      ];
      await blockTracker.processBlocks(blocks);

      const results = await alerts.runAllChecks();

      expect(results.phantomBlockCheck.triggered).toBe(true);
      expect(results.stakeVisibilityCheck.triggered).toBe(true);
      expect(results.alertsTriggered).toBeGreaterThan(0);
    });
  });
});
