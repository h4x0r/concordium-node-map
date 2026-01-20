/**
 * Type definitions for validator visibility tracking
 */

/**
 * Consensus visibility metrics from /api/validators
 */
export interface ConsensusVisibility {
  totalRegistered: number;
  visibleReporting: number;
  phantomChainOnly: number;
  validatorCoveragePct: number;
  stakeVisibilityPct: number;
  visibleLotteryPower: number;
  phantomLotteryPower: number;
  quorumHealth: 'healthy' | 'degraded' | 'critical';
}

/**
 * Phantom validator summary for map rendering
 */
export interface PhantomValidator {
  bakerId: number;
  accountAddress: string;
  lotteryPower: number | null;
  openStatus: string | null;
  blocks24h: number;
  blocks7d: number;
  blocks30d: number;
  transactions24h: number;
  transactions7d: number;
  transactions30d: number;
  lastBlockTime: number | null;
}

/**
 * Visible validator summary
 */
export interface VisibleValidator {
  bakerId: number;
  accountAddress: string;
  linkedPeerId: string | null;
  lotteryPower: number | null;
  openStatus: string | null;
}

/**
 * Full validator record from API
 */
export interface Validator {
  bakerId: number;
  accountAddress: string;
  source: 'reporting' | 'chain_only';
  linkedPeerId: string | null;
  equityCapital: string | null;
  delegatedCapital: string | null;
  totalStake: string | null;
  lotteryPower: number | null;
  openStatus: string | null;
  commissionRates: {
    baking: number | null;
    finalization: number | null;
    transaction: number | null;
  };
  inCurrentPayday: boolean;
  effectiveStake: string | null;
  lastBlockHeight: number | null;
  lastBlockTime: number | null;
  blocks24h: number;
  blocks7d: number;
  blocks30d: number;
  transactions24h: number;
  transactions7d: number;
  transactions30d: number;
  firstObserved: number;
  lastChainUpdate: number | null;
  stateTransitionCount: number;
  dataCompleteness: number | null;
}

/**
 * Full API response from /api/validators
 */
export interface ValidatorsResponse {
  validators: Validator[];
  consensusVisibility: ConsensusVisibility;
  visible: VisibleValidator[];
  phantom: PhantomValidator[];
}
