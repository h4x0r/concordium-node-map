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
        className={`consensus-visibility-bar cvb-compact ${className}`}
      >
        <div className="cvb-metric-inline">
          <span className="cvb-label-sm">VAL</span>
          <span className="cvb-value-sm">--</span>
        </div>
      </div>
    );
  }

  if (isError || !visibility) {
    return (
      <>
        <div
          data-testid="consensus-visibility-bar"
          className={`consensus-visibility-bar cvb-compact cvb-clickable ${className}`}
          onClick={() => setIsPanelOpen(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setIsPanelOpen(true)}
          title="Click for validator investigation (data unavailable)"
        >
          <div className="cvb-metric-inline">
            <span className="cvb-label-sm">VAL</span>
            <span className="cvb-value-sm negative">ERR</span>
          </div>
        </div>
        <ValidatorInvestigationPanel
          isOpen={isPanelOpen}
          onClose={() => setIsPanelOpen(false)}
        />
      </>
    );
  }

  // Detect "not ready" state: 0 visible validators means cron hasn't linked data yet
  const isDataNotReady = visibility.visibleReporting === 0 && visibility.totalRegistered > 0;

  // Show pending state if data not ready
  if (isDataNotReady) {
    return (
      <div
        data-testid="consensus-visibility-bar"
        className={`consensus-visibility-bar cvb-compact ${className}`}
        title="Validator visibility data syncing..."
      >
        <div className="cvb-metric-inline">
          <span className="cvb-label-sm">VAL</span>
          <span className="cvb-value-sm cvb-pending">...</span>
        </div>
      </div>
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
        className={`consensus-visibility-bar cvb-compact cvb-clickable ${className}`}
        onClick={() => setIsPanelOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setIsPanelOpen(true)}
        title="Click for detailed validator investigation"
      >
        {/* Validator Counts - compact inline */}
        <div className="cvb-metric-inline">
          <span className="cvb-label-sm">VAL</span>
          <span className="cvb-value-sm">
            {visibility.visibleReporting}
            <span className="cvb-separator">/</span>
            <span className="cvb-phantom">{phantoms.length}</span>
          </span>
        </div>

        {/* Stake Visibility - compact inline */}
        <div className="cvb-metric-inline">
          <span className="cvb-label-sm">STK</span>
          <span className={`cvb-value-sm ${visibilityColorClass}`}>
            {visibility.stakeVisibilityPct.toFixed(0)}%
          </span>
        </div>

        {/* Quorum Health Badge - compact */}
        <div className={`cvb-health-badge-sm ${healthColorClass}`}>
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
