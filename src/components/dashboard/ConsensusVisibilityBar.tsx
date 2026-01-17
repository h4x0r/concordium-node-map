'use client';

/**
 * ConsensusVisibilityBar - Displays validator visibility metrics
 *
 * Shows:
 * - Validator counts (visible vs phantom)
 * - Stake visibility percentage
 * - Quorum health status badge
 *
 * Clicking opens ValidatorInvestigationPanel for detailed analysis.
 *
 * Color thresholds:
 * - >= 70%: green (healthy)
 * - 50-69%: amber (degraded)
 * - < 50%: red (critical)
 */

import { useState } from 'react';
import {
  useConsensusVisibility,
  getVisibilityColorClass,
  getHealthColorClass,
} from '@/hooks/useValidators';
import { ValidatorInvestigationPanel } from './ValidatorInvestigationPanel';

export interface ConsensusVisibilityBarProps {
  className?: string;
}

export function ConsensusVisibilityBar({
  className = '',
}: ConsensusVisibilityBarProps) {
  const { visibility, phantoms, isLoading, isError } = useConsensusVisibility();
  const [isPanelOpen, setIsPanelOpen] = useState(false);

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
      <>
        <div
          data-testid="consensus-visibility-bar"
          className={`consensus-visibility-bar cvb-clickable ${className}`}
          onClick={() => setIsPanelOpen(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setIsPanelOpen(true)}
          title="Click for validator investigation (data unavailable)"
        >
          <div className="cvb-metric">
            <span className="cvb-label">Validators</span>
            <span className="cvb-value negative">ERR</span>
          </div>
        </div>
        <ValidatorInvestigationPanel
          isOpen={isPanelOpen}
          onClose={() => setIsPanelOpen(false)}
        />
      </>
    );
  }

  const visibilityColorClass = getVisibilityColorClass(
    visibility.stakeVisibilityPct
  );
  const healthColorClass = getHealthColorClass(visibility.quorumHealth);

  return (
    <>
      <div
        data-testid="consensus-visibility-bar"
        className={`consensus-visibility-bar cvb-clickable ${className}`}
        onClick={() => setIsPanelOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setIsPanelOpen(true)}
        title="Click for detailed validator investigation"
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

      {/* Investigation Panel */}
      <ValidatorInvestigationPanel
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
      />
    </>
  );
}
