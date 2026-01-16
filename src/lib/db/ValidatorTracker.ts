/**
 * ValidatorTracker - Tracks all validators (bakers) from Concordium chain
 *
 * Handles:
 * - Fetching validator data from chain (getBakerList, getPoolStatus)
 * - Distinguishing reporting (visible) vs phantom (chain_only) validators
 * - Calculating consensus visibility metrics
 * - Tracking state transitions (phantom↔visible, stake changes)
 */

import type { Client } from '@libsql/client';
import type {
  ValidatorRecord,
  ValidatorTransitionType,
  QuorumHealth,
} from './schema';

/**
 * Chain validator data from gRPC (getBakerList + getPoolStatus)
 */
export interface ChainValidator {
  bakerId: number;
  accountAddress: string;
  equityCapital: bigint;
  delegatedCapital: bigint;
  totalStake: bigint;
  lotteryPower: number;
  openStatus: string;
  commissionRates: {
    baking: number;
    finalization: number;
    transaction: number;
  };
  inCurrentPayday: boolean;
  effectiveStake: bigint;
}

/**
 * Reporting peer that may be a validator
 */
export interface ReportingPeer {
  peerId: string;
  consensusBakerId: number | null;
  nodeName: string;
}

/**
 * Result of processing validators
 */
export interface ProcessValidatorsResult {
  totalProcessed: number;
  newValidators: number[];
  visibleCount: number;
  phantomCount: number;
  transitions: ValidatorTransition[];
}

/**
 * Validator state transition
 */
export interface ValidatorTransition {
  bakerId: number;
  type: ValidatorTransitionType;
  linkedPeerId?: string;
  previousPeerId?: string;
  oldValue?: string;
  newValue?: string;
}

/**
 * Consensus visibility metrics
 */
export interface ConsensusVisibility {
  totalRegistered: number;
  visibleReporting: number;
  phantomChainOnly: number;
  validatorCoveragePct: number;
  totalNetworkStake: string;
  visibleStake: string;
  phantomStake: string;
  stakeVisibilityPct: number;
  visibleLotteryPower: number;
  phantomLotteryPower: number;
  quorumHealth: QuorumHealth;
}

/**
 * Validator with source info
 */
export interface ValidatorWithSource {
  bakerId: number;
  accountAddress: string;
  source: 'reporting' | 'chain_only';
  linkedPeerId: string | null;
  totalStake: string | null;
  lotteryPower: number | null;
  openStatus: string | null;
}

/**
 * Validator history
 */
export interface ValidatorHistory {
  bakerId: number;
  firstObserved: number;
  transitions: Array<{
    timestamp: number;
    type: ValidatorTransitionType;
    oldValue: string | null;
    newValue: string | null;
  }>;
}

// Stake change threshold for recording transition (10%)
const STAKE_CHANGE_THRESHOLD = 0.10;

// Quorum health thresholds
const QUORUM_HEALTHY_THRESHOLD = 0.70;    // >70% stake visible = healthy
const QUORUM_DEGRADED_THRESHOLD = 0.50;   // 50-70% = degraded, <50% = critical

export class ValidatorTracker {
  private db: Client;

  constructor(db: Client) {
    this.db = db;
  }

  /**
   * Process validators from chain data
   * Links to reporting peers where bakerId matches
   */
  async processValidators(
    chainValidators: ChainValidator[],
    reportingPeers: ReportingPeer[]
  ): Promise<ProcessValidatorsResult> {
    const now = Date.now();
    const newValidators: number[] = [];
    const transitions: ValidatorTransition[] = [];
    let visibleCount = 0;
    let phantomCount = 0;

    // Build map of bakerId -> peerId for quick lookup
    const bakerToPeer = new Map<number, ReportingPeer>();
    for (const peer of reportingPeers) {
      if (peer.consensusBakerId !== null) {
        bakerToPeer.set(peer.consensusBakerId, peer);
      }
    }

    for (const validator of chainValidators) {
      const reportingPeer = bakerToPeer.get(validator.bakerId);
      const source = reportingPeer ? 'reporting' : 'chain_only';
      const linkedPeerId = reportingPeer?.peerId ?? null;

      if (source === 'reporting') {
        visibleCount++;
      } else {
        phantomCount++;
      }

      // Check if validator exists
      const existing = await this.db.execute(
        'SELECT * FROM validators WHERE baker_id = ?',
        [validator.bakerId]
      );

      if (existing.rows.length === 0) {
        // New validator
        await this.db.execute(
          `INSERT INTO validators (
            baker_id, account_address, source, linked_peer_id,
            equity_capital, delegated_capital, total_stake, lottery_power,
            open_status, commission_baking, commission_finalization, commission_transaction,
            in_current_payday, effective_stake,
            first_observed, last_chain_update, data_completeness
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            validator.bakerId,
            validator.accountAddress,
            source,
            linkedPeerId,
            validator.equityCapital.toString(),
            validator.delegatedCapital.toString(),
            validator.totalStake.toString(),
            validator.lotteryPower,
            validator.openStatus,
            validator.commissionRates.baking,
            validator.commissionRates.finalization,
            validator.commissionRates.transaction,
            validator.inCurrentPayday ? 1 : 0,
            validator.effectiveStake.toString(),
            now,
            now,
            source === 'reporting' ? 1.0 : 0.5, // Phantom has less data completeness
          ]
        );
        newValidators.push(validator.bakerId);
      } else {
        // Existing validator - check for transitions
        const prev = existing.rows[0] as unknown as ValidatorRecord;

        // Check for phantom ↔ visible transition
        if (prev.source === 'chain_only' && source === 'reporting') {
          transitions.push({
            bakerId: validator.bakerId,
            type: 'phantom_to_visible',
            linkedPeerId: linkedPeerId!,
          });
          await this.recordTransition(validator.bakerId, 'phantom_to_visible', 'chain_only', 'reporting', {
            linkedPeerId,
            timestamp: now,
          });
        } else if (prev.source === 'reporting' && source === 'chain_only') {
          transitions.push({
            bakerId: validator.bakerId,
            type: 'visible_to_phantom',
            previousPeerId: prev.linked_peer_id ?? undefined,
          });
          await this.recordTransition(validator.bakerId, 'visible_to_phantom', 'reporting', 'chain_only', {
            previousPeerId: prev.linked_peer_id,
            timestamp: now,
          });
        }

        // Check for significant stake change (>10%)
        const prevStake = BigInt(prev.total_stake ?? '0');
        const newStake = validator.totalStake;
        if (prevStake > BigInt(0)) {
          const changeRatio = Math.abs(
            Number(newStake - prevStake) / Number(prevStake)
          );
          if (changeRatio > STAKE_CHANGE_THRESHOLD) {
            transitions.push({
              bakerId: validator.bakerId,
              type: 'stake_changed',
              oldValue: prevStake.toString(),
              newValue: newStake.toString(),
            });
            await this.recordTransition(
              validator.bakerId,
              'stake_changed',
              prevStake.toString(),
              newStake.toString(),
              { changeRatio, timestamp: now }
            );
          }
        }

        // Update existing record
        await this.db.execute(
          `UPDATE validators SET
            source = ?,
            linked_peer_id = ?,
            equity_capital = ?,
            delegated_capital = ?,
            total_stake = ?,
            lottery_power = ?,
            open_status = ?,
            commission_baking = ?,
            commission_finalization = ?,
            commission_transaction = ?,
            in_current_payday = ?,
            effective_stake = ?,
            last_chain_update = ?,
            data_completeness = ?,
            state_transition_count = state_transition_count + ?
          WHERE baker_id = ?`,
          [
            source,
            linkedPeerId,
            validator.equityCapital.toString(),
            validator.delegatedCapital.toString(),
            validator.totalStake.toString(),
            validator.lotteryPower,
            validator.openStatus,
            validator.commissionRates.baking,
            validator.commissionRates.finalization,
            validator.commissionRates.transaction,
            validator.inCurrentPayday ? 1 : 0,
            validator.effectiveStake.toString(),
            now,
            source === 'reporting' ? 1.0 : 0.5,
            transitions.filter(t => t.bakerId === validator.bakerId).length,
            validator.bakerId,
          ]
        );
      }
    }

    return {
      totalProcessed: chainValidators.length,
      newValidators,
      visibleCount,
      phantomCount,
      transitions,
    };
  }

  /**
   * Record a state transition for forensic audit trail
   */
  private async recordTransition(
    bakerId: number,
    type: ValidatorTransitionType,
    oldValue: string | null,
    newValue: string | null,
    evidence: Record<string, unknown>
  ): Promise<void> {
    await this.db.execute(
      `INSERT INTO validator_transitions (baker_id, timestamp, transition_type, old_value, new_value, evidence)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [bakerId, Date.now(), type, oldValue, newValue, JSON.stringify(evidence)]
    );
  }

  /**
   * Calculate consensus visibility metrics
   */
  async calculateConsensusVisibility(): Promise<ConsensusVisibility> {
    const result = await this.db.execute('SELECT * FROM validators');
    const validators = result.rows as unknown as ValidatorRecord[];

    let visibleCount = 0;
    let phantomCount = 0;
    let visibleLotteryPower = 0;
    let phantomLotteryPower = 0;
    let visibleStake = BigInt(0);
    let phantomStake = BigInt(0);

    for (const v of validators) {
      const stake = BigInt(v.total_stake ?? '0');
      const lotteryPower = v.lottery_power ?? 0;

      if (v.source === 'reporting') {
        visibleCount++;
        visibleLotteryPower += lotteryPower;
        visibleStake += stake;
      } else {
        phantomCount++;
        phantomLotteryPower += lotteryPower;
        phantomStake += stake;
      }
    }

    const totalRegistered = validators.length;
    const totalNetworkStake = visibleStake + phantomStake;
    const validatorCoveragePct = totalRegistered > 0
      ? (visibleCount / totalRegistered) * 100
      : 0;

    // Use lottery power for stake visibility since it represents actual consensus influence
    const totalLotteryPower = visibleLotteryPower + phantomLotteryPower;
    const stakeVisibilityPct = totalLotteryPower > 0
      ? (visibleLotteryPower / totalLotteryPower) * 100
      : 0;

    // Determine quorum health based on lottery power (consensus influence)
    let quorumHealth: QuorumHealth;
    const visibilityRatio = stakeVisibilityPct / 100;
    if (visibilityRatio >= QUORUM_HEALTHY_THRESHOLD) {
      quorumHealth = 'healthy';
    } else if (visibilityRatio >= QUORUM_DEGRADED_THRESHOLD) {
      quorumHealth = 'degraded';
    } else {
      quorumHealth = 'critical';
    }

    return {
      totalRegistered,
      visibleReporting: visibleCount,
      phantomChainOnly: phantomCount,
      validatorCoveragePct,
      totalNetworkStake: totalNetworkStake.toString(),
      visibleStake: visibleStake.toString(),
      phantomStake: phantomStake.toString(),
      stakeVisibilityPct,
      visibleLotteryPower,
      phantomLotteryPower,
      quorumHealth,
    };
  }

  /**
   * Get all phantom (chain_only) validators
   */
  async getPhantomValidators(): Promise<ValidatorWithSource[]> {
    const result = await this.db.execute(
      `SELECT baker_id, account_address, source, linked_peer_id, total_stake, lottery_power, open_status
       FROM validators WHERE source = 'chain_only'`
    );

    return result.rows.map((row) => ({
      bakerId: row.baker_id as number,
      accountAddress: row.account_address as string,
      source: row.source as 'chain_only',
      linkedPeerId: row.linked_peer_id as string | null,
      totalStake: row.total_stake as string | null,
      lotteryPower: row.lottery_power as number | null,
      openStatus: row.open_status as string | null,
    }));
  }

  /**
   * Get all validators with source indication
   */
  async getAllValidators(): Promise<ValidatorWithSource[]> {
    const result = await this.db.execute(
      `SELECT baker_id, account_address, source, linked_peer_id, total_stake, lottery_power, open_status
       FROM validators ORDER BY lottery_power DESC`
    );

    return result.rows.map((row) => ({
      bakerId: row.baker_id as number,
      accountAddress: row.account_address as string,
      source: row.source as 'reporting' | 'chain_only',
      linkedPeerId: row.linked_peer_id as string | null,
      totalStake: row.total_stake as string | null,
      lotteryPower: row.lottery_power as number | null,
      openStatus: row.open_status as string | null,
    }));
  }

  /**
   * Record a consensus visibility snapshot
   */
  async recordConsensusSnapshot(): Promise<void> {
    const visibility = await this.calculateConsensusVisibility();

    await this.db.execute(
      `INSERT INTO consensus_snapshots (
        timestamp, total_registered, visible_reporting, phantom_chain_only,
        validator_coverage_pct, total_network_stake, visible_stake, phantom_stake,
        stake_visibility_pct, visible_lottery_power, phantom_lottery_power,
        quorum_health
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Date.now(),
        visibility.totalRegistered,
        visibility.visibleReporting,
        visibility.phantomChainOnly,
        visibility.validatorCoveragePct,
        visibility.totalNetworkStake,
        visibility.visibleStake,
        visibility.phantomStake,
        visibility.stakeVisibilityPct,
        visibility.visibleLotteryPower,
        visibility.phantomLotteryPower,
        visibility.quorumHealth,
      ]
    );
  }

  /**
   * Get transition history for a validator
   */
  async getValidatorHistory(bakerId: number): Promise<ValidatorHistory> {
    const validatorResult = await this.db.execute(
      'SELECT first_observed FROM validators WHERE baker_id = ?',
      [bakerId]
    );

    const firstObserved = validatorResult.rows.length > 0
      ? (validatorResult.rows[0].first_observed as number)
      : Date.now();

    const transitionsResult = await this.db.execute(
      `SELECT timestamp, transition_type, old_value, new_value
       FROM validator_transitions WHERE baker_id = ? ORDER BY timestamp ASC`,
      [bakerId]
    );

    return {
      bakerId,
      firstObserved,
      transitions: transitionsResult.rows.map((row) => ({
        timestamp: row.timestamp as number,
        type: row.transition_type as ValidatorTransitionType,
        oldValue: row.old_value as string | null,
        newValue: row.new_value as string | null,
      })),
    };
  }
}
