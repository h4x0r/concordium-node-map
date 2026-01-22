'use client';

/**
 * BakerDetailPanel - Detailed view of a single baker/validator
 *
 * Shows when user clicks on a baker ID in BlocksView or TransactionsView:
 * - Baker info (ID, address, type)
 * - Block production stats
 * - Transaction stats
 * - Commission rates
 * - Pool status
 */

import { useState, useEffect } from 'react';
import type { Validator } from '@/lib/types/validators';
import { AddressIdenticon } from '@/components/ui/AddressIdenticon';
import { formatNumber, formatLotteryPower, formatCommission, formatRelativeTime } from '@/lib/format-utils';

export interface BakerDetailPanelProps {
  isOpen: boolean;
  validator: Validator | null;
  onClose: () => void;
}

export function BakerDetailPanel({
  isOpen,
  validator,
  onClose,
}: BakerDetailPanelProps) {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Track client mount to avoid hydration mismatches with Date.now()
  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isOpen) return null;

  if (!validator) {
    return (
      <div className="bdp-overlay" onClick={onClose}>
        <div className="bdp-panel" onClick={(e) => e.stopPropagation()}>
          <div className="bdp-header">
            <h2>Baker Details</h2>
            <button className="bdp-close" onClick={onClose} aria-label="Close">
              &times;
            </button>
          </div>
          <div className="bdp-empty">No validator selected</div>
        </div>
      </div>
    );
  }

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
    return `${address.slice(0, 8)}...${address.slice(-2)}`;
  };

  const formatDataCompleteness = (value: number | null) => {
    if (value === null) return '--';
    return `${Math.round(value * 100)}%`;
  };

  const isVisible = validator.source === 'reporting';

  return (
    <div className="bdp-overlay" onClick={onClose}>
      <div className="bdp-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bdp-header">
          <h2>Baker Details</h2>
          <button className="bdp-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {/* Baker Identity */}
        <div className="bdp-identity">
          <div className="bdp-baker-id">Baker #{validator.bakerId}</div>
          <span className={`bdp-badge ${isVisible ? 'positive' : 'negative'}`}>
            {isVisible ? 'Visible' : 'Phantom'}
          </span>
          {validator.inCurrentPayday && (
            <span className="bdp-badge payday">In Payday</span>
          )}
        </div>

        {/* Account Address */}
        <div className="bdp-address-row">
          {validator.accountAddress && (
            <AddressIdenticon
              address={validator.accountAddress}
              diameter={24}
              className="bdp-identicon"
            />
          )}
          <span className="bdp-address" title={validator.accountAddress}>
            {truncateAddress(validator.accountAddress)}
          </span>
          <button
            className="bdp-copy-btn"
            onClick={() => copyToClipboard(validator.accountAddress)}
            title="Copy full address"
          >
            {copiedAddress === validator.accountAddress ? '✓' : '⎘'}
          </button>
        </div>

        {/* Stats Grid */}
        <div className="bdp-stats">
          <div className="bdp-stat-group">
            <h3>Block Production</h3>
            <div className="bdp-stat-row">
              <span className="bdp-stat-label">24h</span>
              <span className="bdp-stat-value">{formatNumber(validator.blocks24h)}</span>
            </div>
            <div className="bdp-stat-row">
              <span className="bdp-stat-label">7d</span>
              <span className="bdp-stat-value">{formatNumber(validator.blocks7d)}</span>
            </div>
            <div className="bdp-stat-row">
              <span className="bdp-stat-label">30d</span>
              <span className="bdp-stat-value">{formatNumber(validator.blocks30d)}</span>
            </div>
            <div className="bdp-stat-row">
              <span className="bdp-stat-label">Last Block</span>
              <span className="bdp-stat-value">{formatRelativeTime(validator.lastBlockTime, isMounted)}</span>
            </div>
            <div className="bdp-stat-row">
              <span className="bdp-stat-label">Last Height</span>
              <span className="bdp-stat-value">
                {validator.lastBlockHeight !== null
                  ? formatNumber(validator.lastBlockHeight)
                  : '--'}
              </span>
            </div>
          </div>

          <div className="bdp-stat-group">
            <h3>Transactions</h3>
            <div className="bdp-stat-row">
              <span className="bdp-stat-label">24h</span>
              <span className="bdp-stat-value">{formatNumber(validator.transactions24h)}</span>
            </div>
            <div className="bdp-stat-row">
              <span className="bdp-stat-label">7d</span>
              <span className="bdp-stat-value">{formatNumber(validator.transactions7d)}</span>
            </div>
            <div className="bdp-stat-row">
              <span className="bdp-stat-label">30d</span>
              <span className="bdp-stat-value">{formatNumber(validator.transactions30d)}</span>
            </div>
          </div>

          <div className="bdp-stat-group">
            <h3>Stake & Power</h3>
            <div className="bdp-stat-row">
              <span className="bdp-stat-label">Lottery Power</span>
              <span className="bdp-stat-value">{formatLotteryPower(validator.lotteryPower)}</span>
            </div>
            <div className="bdp-stat-row">
              <span className="bdp-stat-label">Pool Status</span>
              <span className="bdp-stat-value">{validator.openStatus ?? '--'}</span>
            </div>
          </div>

          <div className="bdp-stat-group">
            <h3>Commission Rates</h3>
            <div className="bdp-stat-row">
              <span className="bdp-stat-label">Baking</span>
              <span className="bdp-stat-value">{formatCommission(validator.commissionRates.baking)}</span>
            </div>
            <div className="bdp-stat-row">
              <span className="bdp-stat-label">Finalization</span>
              <span className="bdp-stat-value">{formatCommission(validator.commissionRates.finalization)}</span>
            </div>
            <div className="bdp-stat-row">
              <span className="bdp-stat-label">Transaction</span>
              <span className="bdp-stat-value">{formatCommission(validator.commissionRates.transaction)}</span>
            </div>
          </div>

          <div className="bdp-stat-group">
            <h3>Metadata</h3>
            <div className="bdp-stat-row">
              <span className="bdp-stat-label">State Transitions</span>
              <span className="bdp-stat-value">{formatNumber(validator.stateTransitionCount)}</span>
            </div>
            <div className="bdp-stat-row">
              <span className="bdp-stat-label">Data Completeness</span>
              <span className="bdp-stat-value">{formatDataCompleteness(validator.dataCompleteness)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
