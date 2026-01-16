'use client';

/**
 * ConsensusVisibilityBar - Displays validator visibility metrics
 *
 * Shows:
 * - Validator counts (visible vs phantom)
 * - Stake visibility percentage
 * - Quorum health status badge
 *
 * Color thresholds:
 * - >= 70%: green (healthy)
 * - 50-69%: amber (degraded)
 * - < 50%: red (critical)
 */

import {
  useConsensusVisibility,
  getVisibilityColorClass,
  getHealthColorClass,
} from '@/hooks/useValidators';

export interface ConsensusVisibilityBarProps {
  className?: string;
}

export function ConsensusVisibilityBar({
  className = '',
}: ConsensusVisibilityBarProps) {
  const { visibility, phantoms, isLoading, isError } = useConsensusVisibility();

  if (isLoading) {
    return (
      <div
        data-testid="consensus-visibility-bar"
        className={`consensus-visibility-bar ${className}`}
      >
        <div className="cvb-metric">
          <span className="cvb-label">Validators</span>
          <span className="cvb-value">--</span>
        </div>
      </div>
    );
  }

  if (isError || !visibility) {
    return (
      <div
        data-testid="consensus-visibility-bar"
        className={`consensus-visibility-bar ${className}`}
      >
        <div className="cvb-metric">
          <span className="cvb-label">Validators</span>
          <span className="cvb-value negative">ERR</span>
        </div>
      </div>
    );
  }

  const visibilityColorClass = getVisibilityColorClass(
    visibility.stakeVisibilityPct
  );
  const healthColorClass = getHealthColorClass(visibility.quorumHealth);

  return (
    <div
      data-testid="consensus-visibility-bar"
      className={`consensus-visibility-bar ${className}`}
    >
      {/* Validator Counts */}
      <div className="cvb-metric">
        <span className="cvb-label">Validators</span>
        <span className="cvb-value">
          {visibility.visibleReporting}{' '}
          <span className="cvb-sub">/ {phantoms.length}</span>
        </span>
        <span className="cvb-sub">VIS / PHM</span>
      </div>

      {/* Stake Visibility */}
      <div className="cvb-metric">
        <span className="cvb-label">Stake Visibility</span>
        <span className={`cvb-value ${visibilityColorClass}`}>
          {visibility.stakeVisibilityPct.toFixed(1)}%
        </span>
      </div>

      {/* Quorum Health Badge */}
      <div className={`cvb-health-badge ${healthColorClass}`}>
        {visibility.quorumHealth.toUpperCase()}
      </div>
    </div>
  );
}
