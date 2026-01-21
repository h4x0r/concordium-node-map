'use client';

/**
 * TransactionsView - Network transaction activity overview
 *
 * Shows transaction stats aggregated from validator data:
 * - Total transactions (24h/7d)
 * - Top validators by transaction throughput
 * - Transaction distribution by validator type
 */

import { useState, useRef } from 'react';
import { useValidators } from '@/hooks/useValidators';
import { useResponsivePageSize } from '@/hooks/useResponsivePageSize';
import { BakerDetailPanel } from './BakerDetailPanel';
import type { Validator } from '@/lib/types/validators';

type SortPeriod = '24h' | '7d' | '30d';

export function TransactionsView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, error } = useValidators();
  const [selectedValidator, setSelectedValidator] = useState<Validator | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [sortPeriod, setSortPeriod] = useState<SortPeriod>('24h');
  const validators = data?.validators ?? [];
  const pageSize = useResponsivePageSize({ containerRef });

  const handleSortPeriodChange = (period: SortPeriod) => {
    setSortPeriod(period);
    setCurrentPage(0); // Reset to first page when changing sort
  };

  if (isLoading) {
    return (
      <div className="bb-view-loading">
        <div className="bb-spinner" />
        <span>Loading transaction data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bb-view-error">
        Failed to load transaction data: {error.message}
      </div>
    );
  }

  // Aggregate transaction stats
  const totals = validators.reduce(
    (acc, v) => ({
      tx24h: acc.tx24h + v.transactions24h,
      tx7d: acc.tx7d + v.transactions7d,
      tx30d: acc.tx30d + v.transactions30d,
      visibleTx24h: acc.visibleTx24h + (v.source === 'reporting' ? v.transactions24h : 0),
      phantomTx24h: acc.phantomTx24h + (v.source === 'chain_only' ? v.transactions24h : 0),
    }),
    { tx24h: 0, tx7d: 0, tx30d: 0, visibleTx24h: 0, phantomTx24h: 0 }
  );

  const phantomTxPct = totals.tx24h > 0
    ? (totals.phantomTx24h / totals.tx24h) * 100
    : 0;

  // All validators sorted by transactions (by selected period)
  const sortedValidators = [...validators]
    .sort((a, b) => {
      if (sortPeriod === '24h') {
        return b.transactions24h - a.transactions24h;
      }
      if (sortPeriod === '7d') {
        return b.transactions7d - a.transactions7d;
      }
      return b.transactions30d - a.transactions30d;
    });

  // Pagination
  const totalPages = Math.ceil(sortedValidators.length / pageSize);
  const startIdx = currentPage * pageSize;
  const paginatedValidators = sortedValidators.slice(startIdx, startIdx + pageSize);

  const formatNumber = (n: number) => n.toLocaleString();

  return (
    <div className="bb-data-view" ref={containerRef}>
      {/* Summary Cards */}
      <div className="bb-view-summary">
        <div className="bb-stat-card bb-stat-card-combined">
          <div className="bb-stat-card-title">Transactions</div>
          <div className="bb-stat-metrics">
            <div className="bb-stat-metric">
              <span className="bb-stat-value">{formatNumber(totals.tx24h)}</span>
              <span className="bb-stat-period">24h</span>
            </div>
            <div className="bb-stat-metric">
              <span className="bb-stat-value">{formatNumber(totals.tx7d)}</span>
              <span className="bb-stat-period">7d</span>
            </div>
            <div className="bb-stat-metric">
              <span className="bb-stat-value">{formatNumber(totals.tx30d)}</span>
              <span className="bb-stat-period">30d</span>
            </div>
          </div>
        </div>
        <div className="bb-stat-card positive">
          <div className="bb-stat-value">{formatNumber(totals.visibleTx24h)}</div>
          <div className="bb-stat-label">By Visible Validators</div>
        </div>
        <div className="bb-stat-card negative">
          <div className="bb-stat-value">{formatNumber(totals.phantomTx24h)}</div>
          <div className="bb-stat-label">By Phantom Validators ({phantomTxPct.toFixed(1)}%)</div>
        </div>
      </div>

      {/* Validators by Transactions */}
      <div className="bb-view-section">
        <div className="bb-section-header">
          <div className="bb-section-title-row">
            <h3>Validators by Transactions</h3>
            <div className="bb-sort-toggle">
              <button
                className={`bb-sort-btn ${sortPeriod === '24h' ? 'active' : ''}`}
                onClick={() => handleSortPeriodChange('24h')}
              >
                24h
              </button>
              <button
                className={`bb-sort-btn ${sortPeriod === '7d' ? 'active' : ''}`}
                onClick={() => handleSortPeriodChange('7d')}
              >
                7d
              </button>
              <button
                className={`bb-sort-btn ${sortPeriod === '30d' ? 'active' : ''}`}
                onClick={() => handleSortPeriodChange('30d')}
              >
                30d
              </button>
            </div>
          </div>
          <span className="bb-section-count">{sortedValidators.length} validators</span>
        </div>
        <div className="bb-table-wrapper">
          <table className="bb-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Baker ID</th>
                <th>Type</th>
                <th className={sortPeriod === '24h' ? 'bb-sorted' : ''}>Txs (24h){sortPeriod === '24h' && ' ▼'}</th>
                <th className={sortPeriod === '7d' ? 'bb-sorted' : ''}>Txs (7d){sortPeriod === '7d' && ' ▼'}</th>
                <th className={sortPeriod === '30d' ? 'bb-sorted' : ''}>Txs (30d){sortPeriod === '30d' && ' ▼'}</th>
                <th>Lottery Power</th>
              </tr>
            </thead>
            <tbody>
              {paginatedValidators.map((v, idx) => (
                <tr key={v.bakerId}>
                  <td className="font-mono bb-rank">{startIdx + idx + 1}</td>
                  <td className="font-mono">
                    <button
                      className="bb-baker-link"
                      onClick={() => setSelectedValidator(v)}
                      title="View baker details"
                    >
                      {v.bakerId}
                    </button>
                  </td>
                  <td>
                    <span className={`bb-badge ${v.source === 'reporting' ? 'positive' : 'negative'}`}>
                      {v.source === 'reporting' ? 'Visible' : 'Phantom'}
                    </span>
                    {v.transactions24h === 0 && v.transactions7d === 0 && v.transactions30d === 0 && (
                      <span className="bb-badge inactive ml-1">No Activity</span>
                    )}
                  </td>
                  <td className="font-mono">{formatNumber(v.transactions24h)}</td>
                  <td className="font-mono">{formatNumber(v.transactions7d)}</td>
                  <td className="font-mono">{formatNumber(v.transactions30d)}</td>
                  <td className="font-mono">
                    {v.lotteryPower !== null ? `${(v.lotteryPower * 100).toFixed(3)}%` : '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="bb-pagination">
            <button
              className="bb-pagination-btn"
              onClick={() => setCurrentPage(0)}
              disabled={currentPage === 0}
              title="First page"
            >
              ««
            </button>
            <button
              className="bb-pagination-btn"
              onClick={() => setCurrentPage(p => p - 1)}
              disabled={currentPage === 0}
              title="Previous page"
            >
              «
            </button>
            <span className="bb-pagination-info">
              Page {currentPage + 1} of {totalPages}
            </span>
            <button
              className="bb-pagination-btn"
              onClick={() => setCurrentPage(p => p + 1)}
              disabled={currentPage >= totalPages - 1}
              title="Next page"
            >
              »
            </button>
            <button
              className="bb-pagination-btn"
              onClick={() => setCurrentPage(totalPages - 1)}
              disabled={currentPage >= totalPages - 1}
              title="Last page"
            >
              »»
            </button>
          </div>
        )}
      </div>

      {/* Baker Detail Panel */}
      <BakerDetailPanel
        isOpen={selectedValidator !== null}
        validator={selectedValidator}
        onClose={() => setSelectedValidator(null)}
      />
    </div>
  );
}
