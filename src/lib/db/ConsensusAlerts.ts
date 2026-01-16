/**
 * ConsensusAlerts - Alerting system for consensus visibility issues
 *
 * Monitors and alerts on:
 * - High phantom block percentage
 * - Low stake visibility
 * - Quorum health changes
 *
 * Provides forensic audit trail for all alerts.
 */

import type { Client } from '@libsql/client';

export type AlertType =
  | 'phantom_blocks_high'
  | 'stake_visibility_low'
  | 'quorum_health_change';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type QuorumHealth = 'healthy' | 'degraded' | 'critical';

export interface Alert {
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  timestamp: number;
  metadata: Record<string, unknown>;
}

export interface AlertRecord extends Alert {
  id: number;
  acknowledged: boolean;
  acknowledgedAt?: number;
  acknowledgedBy?: string;
}

export interface AlertConfig {
  phantomBlockThreshold: number;    // Alert if >X% blocks from phantoms
  stakeVisibilityWarning: number;   // Warn if <X% stake visible
  stakeVisibilityCritical: number;  // Critical if <X% stake visible
  alertCooldownMs?: number;         // Cooldown between same alert types
}

export interface PhantomBlockCheckResult {
  triggered: boolean;
  phantomBlockPct: number;
  alert?: Alert;
}

export interface StakeVisibilityCheckResult {
  triggered: boolean;
  stakeVisibilityPct: number;
  alert?: Alert;
}

export interface QuorumHealthCheckResult {
  triggered: boolean;
  previousHealth?: QuorumHealth;
  currentHealth: QuorumHealth;
  alert?: Alert;
}

export interface RecordAlertResult {
  recorded: boolean;
  reason?: 'cooldown' | 'duplicate';
}

export interface AllChecksResult {
  phantomBlockCheck: PhantomBlockCheckResult;
  stakeVisibilityCheck: StakeVisibilityCheckResult;
  quorumHealthCheck: QuorumHealthCheckResult;
  alertsTriggered: number;
}

const DEFAULT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export class ConsensusAlerts {
  private db: Client;
  private config: AlertConfig;
  private cooldownMs: number;

  constructor(db: Client, config: AlertConfig) {
    this.db = db;
    this.config = config;
    this.cooldownMs = config.alertCooldownMs ?? DEFAULT_COOLDOWN_MS;
  }

  /**
   * Check if phantom block percentage exceeds threshold
   */
  async checkPhantomBlockAlert(timeWindowMs: number): Promise<PhantomBlockCheckResult> {
    const cutoff = Date.now() - timeWindowMs;

    // Get all blocks in the time window with validator source
    const result = await this.db.execute(
      `SELECT
        b.baker_id,
        v.source
       FROM blocks b
       LEFT JOIN validators v ON b.baker_id = v.baker_id
       WHERE b.timestamp >= ?`,
      [cutoff]
    );

    let totalBlocks = 0;
    let phantomBlocks = 0;

    for (const row of result.rows) {
      totalBlocks++;
      const source = row.source as string | null;

      // chain_only or unknown (no validator record) = phantom
      if (source !== 'reporting') {
        phantomBlocks++;
      }
    }

    const phantomBlockPct = totalBlocks > 0
      ? (phantomBlocks / totalBlocks) * 100
      : 0;

    if (phantomBlockPct > this.config.phantomBlockThreshold) {
      const alert: Alert = {
        type: 'phantom_blocks_high',
        severity: 'warning',
        message: `Phantom block percentage at ${Math.round(phantomBlockPct)}% (threshold: ${this.config.phantomBlockThreshold}%)`,
        timestamp: Date.now(),
        metadata: {
          phantomBlockPct,
          totalBlocks,
          phantomBlocks,
          timeWindowMs,
        },
      };

      return {
        triggered: true,
        phantomBlockPct,
        alert,
      };
    }

    return {
      triggered: false,
      phantomBlockPct,
    };
  }

  /**
   * Check if stake visibility is below thresholds
   */
  async checkStakeVisibilityAlert(): Promise<StakeVisibilityCheckResult> {
    // Calculate visibility based on lottery power
    const result = await this.db.execute(
      `SELECT source, lottery_power FROM validators`
    );

    let totalLotteryPower = 0;
    let visibleLotteryPower = 0;

    for (const row of result.rows) {
      const lotteryPower = (row.lottery_power as number) || 0;
      totalLotteryPower += lotteryPower;

      if (row.source === 'reporting') {
        visibleLotteryPower += lotteryPower;
      }
    }

    const stakeVisibilityPct = totalLotteryPower > 0
      ? (visibleLotteryPower / totalLotteryPower) * 100
      : 100;

    // Check critical threshold first (more severe)
    if (stakeVisibilityPct < this.config.stakeVisibilityCritical) {
      const alert: Alert = {
        type: 'stake_visibility_low',
        severity: 'critical',
        message: `Stake visibility critically low at ${Math.round(stakeVisibilityPct)}% (threshold: ${this.config.stakeVisibilityCritical}%)`,
        timestamp: Date.now(),
        metadata: {
          stakeVisibilityPct,
          visibleLotteryPower,
          totalLotteryPower,
        },
      };

      return {
        triggered: true,
        stakeVisibilityPct,
        alert,
      };
    }

    // Check warning threshold
    if (stakeVisibilityPct < this.config.stakeVisibilityWarning) {
      const alert: Alert = {
        type: 'stake_visibility_low',
        severity: 'warning',
        message: `Stake visibility low at ${Math.round(stakeVisibilityPct)}% (threshold: ${this.config.stakeVisibilityWarning}%)`,
        timestamp: Date.now(),
        metadata: {
          stakeVisibilityPct,
          visibleLotteryPower,
          totalLotteryPower,
        },
      };

      return {
        triggered: true,
        stakeVisibilityPct,
        alert,
      };
    }

    return {
      triggered: false,
      stakeVisibilityPct,
    };
  }

  /**
   * Determine current quorum health based on stake visibility
   */
  private async calculateCurrentQuorumHealth(): Promise<QuorumHealth> {
    const result = await this.db.execute(
      `SELECT source, lottery_power FROM validators`
    );

    let totalLotteryPower = 0;
    let visibleLotteryPower = 0;

    for (const row of result.rows) {
      const lotteryPower = (row.lottery_power as number) || 0;
      totalLotteryPower += lotteryPower;

      if (row.source === 'reporting') {
        visibleLotteryPower += lotteryPower;
      }
    }

    const visibilityPct = totalLotteryPower > 0
      ? (visibleLotteryPower / totalLotteryPower) * 100
      : 100;

    if (visibilityPct < this.config.stakeVisibilityCritical) {
      return 'critical';
    } else if (visibilityPct < this.config.stakeVisibilityWarning) {
      return 'degraded';
    }
    return 'healthy';
  }

  /**
   * Get the most recent quorum health snapshot
   */
  private async getPreviousQuorumHealth(): Promise<QuorumHealth | undefined> {
    const result = await this.db.execute(
      `SELECT health FROM quorum_health_history ORDER BY timestamp DESC LIMIT 1`
    );

    if (result.rows.length === 0) {
      return undefined;
    }

    return result.rows[0].health as QuorumHealth;
  }

  /**
   * Check if quorum health has changed from previous state
   */
  async checkQuorumHealthAlert(): Promise<QuorumHealthCheckResult> {
    const currentHealth = await this.calculateCurrentQuorumHealth();
    const previousHealth = await this.getPreviousQuorumHealth();

    // No previous health or same health = no alert
    if (!previousHealth || previousHealth === currentHealth) {
      return {
        triggered: false,
        previousHealth,
        currentHealth,
      };
    }

    // Health has changed - determine severity
    const severity: AlertSeverity = currentHealth === 'critical' ? 'critical' :
                                    currentHealth === 'degraded' ? 'warning' : 'info';

    const alert: Alert = {
      type: 'quorum_health_change',
      severity,
      message: `Quorum health changed from ${previousHealth} to ${currentHealth}`,
      timestamp: Date.now(),
      metadata: {
        previousHealth,
        currentHealth,
      },
    };

    return {
      triggered: true,
      previousHealth,
      currentHealth,
      alert,
    };
  }

  /**
   * Record a quorum health snapshot for tracking transitions
   */
  async recordQuorumHealthSnapshot(health: QuorumHealth): Promise<void> {
    const now = Date.now();
    await this.db.execute(
      `INSERT INTO quorum_health_history (timestamp, health) VALUES (?, ?)`,
      [now, health]
    );
  }

  /**
   * Check if an alert of this type was recently recorded (within cooldown)
   */
  private async isInCooldown(alertType: AlertType): Promise<boolean> {
    const cutoff = Date.now() - this.cooldownMs;

    const result = await this.db.execute(
      `SELECT id FROM consensus_alerts WHERE alert_type = ? AND timestamp >= ? LIMIT 1`,
      [alertType, cutoff]
    );

    return result.rows.length > 0;
  }

  /**
   * Record an alert to the database
   */
  async recordAlert(alert: Alert): Promise<RecordAlertResult> {
    // Check cooldown
    if (await this.isInCooldown(alert.type)) {
      return { recorded: false, reason: 'cooldown' };
    }

    await this.db.execute(
      `INSERT INTO consensus_alerts (alert_type, severity, message, timestamp, metadata)
       VALUES (?, ?, ?, ?, ?)`,
      [
        alert.type,
        alert.severity,
        alert.message,
        alert.timestamp,
        JSON.stringify(alert.metadata),
      ]
    );

    return { recorded: true };
  }

  /**
   * Get recent alerts from the database
   */
  async getRecentAlerts(limit: number): Promise<AlertRecord[]> {
    const result = await this.db.execute(
      `SELECT id, alert_type, severity, message, timestamp, metadata,
              acknowledged, acknowledged_at, acknowledged_by
       FROM consensus_alerts
       ORDER BY timestamp DESC
       LIMIT ?`,
      [limit]
    );

    return result.rows.map((row) => ({
      id: row.id as number,
      type: row.alert_type as AlertType,
      severity: row.severity as AlertSeverity,
      message: row.message as string,
      timestamp: row.timestamp as number,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : {},
      acknowledged: Boolean(row.acknowledged),
      acknowledgedAt: row.acknowledged_at as number | undefined,
      acknowledgedBy: row.acknowledged_by as string | undefined,
    }));
  }

  /**
   * Run all alert checks and return combined results
   */
  async runAllChecks(): Promise<AllChecksResult> {
    const phantomBlockCheck = await this.checkPhantomBlockAlert(24 * 60 * 60 * 1000);
    const stakeVisibilityCheck = await this.checkStakeVisibilityAlert();
    const quorumHealthCheck = await this.checkQuorumHealthAlert();

    let alertsTriggered = 0;

    if (phantomBlockCheck.triggered) {
      alertsTriggered++;
      if (phantomBlockCheck.alert) {
        await this.recordAlert(phantomBlockCheck.alert);
      }
    }

    if (stakeVisibilityCheck.triggered) {
      alertsTriggered++;
      if (stakeVisibilityCheck.alert) {
        await this.recordAlert(stakeVisibilityCheck.alert);
      }
    }

    if (quorumHealthCheck.triggered) {
      alertsTriggered++;
      if (quorumHealthCheck.alert) {
        await this.recordAlert(quorumHealthCheck.alert);
      }
    }

    // Record current quorum health for next check
    await this.recordQuorumHealthSnapshot(quorumHealthCheck.currentHealth);

    return {
      phantomBlockCheck,
      stakeVisibilityCheck,
      quorumHealthCheck,
      alertsTriggered,
    };
  }
}
