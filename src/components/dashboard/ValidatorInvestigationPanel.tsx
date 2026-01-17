'use client';

/**
 * ValidatorInvestigationPanel - Detailed view of validator visibility
 *
 * Shows when user clicks on the ConsensusVisibilityBar:
 * - Summary metrics (total, visible, phantom, stake visibility)
 * - Explanation of what phantom validators mean
 * - Table of phantom validators with details
 * - Recommendations for improving visibility
 */

import { useState } from 'react';
import {
  useConsensusVisibility,
  useValidators,
  getVisibilityColorClass,
  getHealthColorClass,
} from '@/hooks/useValidators';

export interface ValidatorInvestigationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ValidatorInvestigationPanel({
  isOpen,
  onClose,
}: ValidatorInvestigationPanelProps) {
  const { visibility, phantoms } = useConsensusVisibility();
  const { data: validatorData } = useValidators();
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyToClipboard = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch {
      console.error('Failed to copy address');
    }
  };

  const truncateAddress = (address: string) => {
    if (address.length <= 16) return address;
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  };

  const formatLotteryPower = (power: number | null) => {
    if (power === null) return '--';
    return `${(power * 100).toFixed(3)}%`;
  };

  const visibilityColorClass = visibility
    ? getVisibilityColorClass(visibility.stakeVisibilityPct)
    : 'negative';
  const healthColorClass = visibility
    ? getHealthColorClass(visibility.quorumHealth)
    : 'negative';

  return (
    <div className="vip-overlay" onClick={onClose}>
      <div className="vip-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="vip-header">
          <h2>Validator Visibility Investigation</h2>
          <button className="vip-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {/* Summary Cards */}
        <div className="vip-summary">
          <div className="vip-card">
            <div className="vip-card-value">{visibility?.totalRegistered ?? '--'}</div>
            <div className="vip-card-label">Total Validators</div>
            <div className="vip-card-sub">on-chain registered</div>
          </div>
          <div className="vip-card positive">
            <div className="vip-card-value">{visibility?.visibleReporting ?? 0}</div>
            <div className="vip-card-label">Visible</div>
            <div className="vip-card-sub">reporting to dashboard</div>
          </div>
          <div className="vip-card negative">
            <div className="vip-card-value">{visibility?.phantomChainOnly ?? phantoms.length}</div>
            <div className="vip-card-label">Phantom</div>
            <div className="vip-card-sub">chain-only (not reporting)</div>
          </div>
          <div className={`vip-card ${visibilityColorClass}`}>
            <div className="vip-card-value">
              {visibility?.stakeVisibilityPct.toFixed(1) ?? '0.0'}%
            </div>
            <div className="vip-card-label">Stake Visibility</div>
            <div className={`vip-card-badge ${healthColorClass}`}>
              {visibility?.quorumHealth.toUpperCase() ?? 'CRITICAL'}
            </div>
          </div>
        </div>

        {/* Explanation Section */}
        <div className="vip-section">
          <h3>Why This Matters</h3>
          <div className="vip-explanation">
            <p>
              <strong>Phantom validators</strong> appear on the Concordium blockchain but don&apos;t
              report to the network dashboard. This creates blind spots:
            </p>
            <ul>
              <li>Geographic location unknown - can&apos;t assess decentralization</li>
              <li>Health monitoring unavailable - can&apos;t detect issues early</li>
              <li>Network topology incomplete - missing peer connections</li>
              <li>Stake visibility reduced - affects quorum health assessment</li>
            </ul>
            <p className="vip-highlight">
              Currently <strong>{visibility?.stakeVisibilityPct.toFixed(1) ?? 0}%</strong> of
              staked CCD is visible. For healthy quorum monitoring, aim for &gt;67%.
            </p>
          </div>
        </div>

        {/* Phantom Validators Table */}
        <div className="vip-section">
          <h3>Phantom Validators ({phantoms.length})</h3>
          {phantoms.length === 0 ? (
            <div className="vip-empty">
              No phantom validators detected. All validators are reporting!
            </div>
          ) : (
            <div className="vip-table-container">
              <table className="vip-table">
                <thead>
                  <tr>
                    <th>Baker ID</th>
                    <th>Account Address</th>
                    <th>Lottery Power</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {phantoms.slice(0, 50).map((validator) => (
                    <tr key={validator.bakerId}>
                      <td className="vip-baker-id">{validator.bakerId}</td>
                      <td className="vip-address">
                        <span title={validator.accountAddress}>
                          {truncateAddress(validator.accountAddress)}
                        </span>
                        <button
                          className="vip-copy-btn"
                          onClick={() => copyToClipboard(validator.accountAddress)}
                          title="Copy full address"
                        >
                          {copiedAddress === validator.accountAddress ? '✓' : '⎘'}
                        </button>
                      </td>
                      <td className="vip-lottery">
                        {formatLotteryPower(validator.lotteryPower)}
                      </td>
                      <td className="vip-status">
                        {validator.openStatus ?? '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {phantoms.length > 50 && (
                <div className="vip-table-note">
                  Showing 50 of {phantoms.length} phantom validators
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recommendations */}
        <div className="vip-section">
          <h3>How to Improve Visibility</h3>
          <div className="vip-recommendations">
            <p>Validators can report to the dashboard by:</p>
            <ol>
              <li>
                Enable the <code>--report-to-network</code> flag in node configuration
              </li>
              <li>
                Ensure port <code>8888</code> (or configured port) is accessible
              </li>
              <li>
                Wait for next polling cycle (every 5 minutes)
              </li>
            </ol>
            <p className="vip-note">
              Reporting improves network observability and helps the community monitor
              consensus health.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
