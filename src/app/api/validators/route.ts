import { NextResponse } from 'next/server';
import { getDbClient, initializeSchema } from '@/lib/db/client';

/**
 * GET /api/validators
 *
 * Returns all validators with consensus visibility metrics
 * Includes both visible (reporting) and phantom (chain_only) validators
 */
export async function GET() {
  try {
    await initializeSchema();
    const db = getDbClient();

    // Get validators in current payday (active bakers only)
    const validatorsResult = await db.execute(`
      SELECT
        baker_id,
        account_address,
        source,
        linked_peer_id,
        equity_capital,
        delegated_capital,
        total_stake,
        lottery_power,
        open_status,
        commission_baking,
        commission_finalization,
        commission_transaction,
        in_current_payday,
        effective_stake,
        last_block_height,
        last_block_time,
        blocks_24h,
        blocks_7d,
        blocks_30d,
        transactions_24h,
        transactions_7d,
        transactions_30d,
        first_observed,
        last_chain_update,
        state_transition_count,
        data_completeness
      FROM validators
      WHERE in_current_payday = 1
      ORDER BY lottery_power DESC
    `);

    const validators = validatorsResult.rows.map((row) => ({
      bakerId: Number(row.baker_id),
      accountAddress: row.account_address as string,
      source: row.source as 'reporting' | 'chain_only',
      linkedPeerId: row.linked_peer_id as string | null,
      equityCapital: row.equity_capital as string | null,
      delegatedCapital: row.delegated_capital as string | null,
      totalStake: row.total_stake as string | null,
      lotteryPower: row.lottery_power !== null ? Number(row.lottery_power) : null,
      openStatus: row.open_status as string | null,
      commissionRates: {
        baking: row.commission_baking !== null ? Number(row.commission_baking) : null,
        finalization: row.commission_finalization !== null ? Number(row.commission_finalization) : null,
        transaction: row.commission_transaction !== null ? Number(row.commission_transaction) : null,
      },
      inCurrentPayday: Number(row.in_current_payday) === 1,
      effectiveStake: row.effective_stake as string | null,
      lastBlockHeight: row.last_block_height !== null ? Number(row.last_block_height) : null,
      lastBlockTime: row.last_block_time !== null ? Number(row.last_block_time) : null,
      blocks24h: Number(row.blocks_24h ?? 0),
      blocks7d: Number(row.blocks_7d ?? 0),
      blocks30d: Number(row.blocks_30d ?? 0),
      transactions24h: Number(row.transactions_24h ?? 0),
      transactions7d: Number(row.transactions_7d ?? 0),
      transactions30d: Number(row.transactions_30d ?? 0),
      firstObserved: Number(row.first_observed),
      lastChainUpdate: row.last_chain_update !== null ? Number(row.last_chain_update) : null,
      stateTransitionCount: Number(row.state_transition_count ?? 0),
      dataCompleteness: row.data_completeness !== null ? Number(row.data_completeness) : null,
    }));

    // Calculate consensus visibility metrics
    const visible = validators.filter((v) => v.source === 'reporting');
    const phantom = validators.filter((v) => v.source === 'chain_only');

    const visibleLotteryPower = visible.reduce((sum, v) => sum + (v.lotteryPower ?? 0), 0);
    const phantomLotteryPower = phantom.reduce((sum, v) => sum + (v.lotteryPower ?? 0), 0);
    const totalLotteryPower = visibleLotteryPower + phantomLotteryPower;

    const stakeVisibilityPct = totalLotteryPower > 0
      ? (visibleLotteryPower / totalLotteryPower) * 100
      : 0;

    // Determine quorum health
    let quorumHealth: 'healthy' | 'degraded' | 'critical';
    if (stakeVisibilityPct >= 70) {
      quorumHealth = 'healthy';
    } else if (stakeVisibilityPct >= 50) {
      quorumHealth = 'degraded';
    } else {
      quorumHealth = 'critical';
    }

    const consensusVisibility = {
      totalRegistered: validators.length,
      visibleReporting: visible.length,
      phantomChainOnly: phantom.length,
      validatorCoveragePct: validators.length > 0
        ? (visible.length / validators.length) * 100
        : 0,
      stakeVisibilityPct,
      visibleLotteryPower,
      phantomLotteryPower,
      quorumHealth,
    };

    return NextResponse.json({
      validators,
      consensusVisibility,
      // Separate lists for convenience
      visible: visible.map((v) => ({
        bakerId: v.bakerId,
        accountAddress: v.accountAddress,
        linkedPeerId: v.linkedPeerId,
        lotteryPower: v.lotteryPower,
        openStatus: v.openStatus,
      })),
      phantom: phantom.map((v) => ({
        bakerId: v.bakerId,
        accountAddress: v.accountAddress,
        lotteryPower: v.lotteryPower,
        openStatus: v.openStatus,
        blocks24h: v.blocks24h,
        blocks7d: v.blocks7d,
        blocks30d: v.blocks30d,
        transactions24h: v.transactions24h,
        transactions7d: v.transactions7d,
        transactions30d: v.transactions30d,
        lastBlockTime: v.lastBlockTime,
      })),
    });
  } catch (error) {
    console.error('Error fetching validators:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch validators',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
