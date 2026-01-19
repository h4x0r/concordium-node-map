'use client';

/**
 * ValidatorInvestigationPanel - Detailed view of validator visibility
 *
 * Shows when user clicks on the ConsensusVisibilityBar:
 * - Summary metrics (total, visible, phantom, stake visibility)
 * - Table of phantom validators with details
 */

import { useState } from 'react';
import {
  useConsensusVisibility,
  getVisibilityColorClass,
  getHealthColorClass,
} from '@/hooks/useValidators';
import { AddressIdenticon } from '@/components/ui/AddressIdenticon';

export interface ValidatorInvestigationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ValidatorInvestigationPanel({
  isOpen,
  onClose,
}: ValidatorInvestigationPanelProps) {
  const { visibility, phantoms } = useConsensusVisibility();
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

  const formatLastBlockTime = (timestamp: number | null) => {
    if (timestamp === null) return '--';
    const diff = Date.now() - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
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
          <h2>Validator Visibility Details</h2>
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
                    <th>Blocks (24h)</th>
                    <th>Blocks (7d)</th>
                    <th>Last Block</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {phantoms.slice(0, 50).map((validator) => (
                    <tr key={validator.bakerId}>
                      <td className="vip-baker-id">{validator.bakerId}</td>
                      <td className="vip-address">
                        {validator.accountAddress && (
                          <AddressIdenticon
                            address={validator.accountAddress}
                            diameter={16}
                            className="vip-identicon"
                          />
                        )}
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
                      <td className="vip-blocks">
                        {validator.blocks24h ?? 0}
                      </td>
                      <td className="vip-blocks">
                        {validator.blocks7d ?? 0}
                      </td>
                      <td className="vip-last-block">
                        {formatLastBlockTime(validator.lastBlockTime)}
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
      </div>
    </div>
  );
}
