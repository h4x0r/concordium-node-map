'use client';

/**
 * TransactionsView - Network transaction activity overview
 *
 * Shows transaction stats aggregated from validator data:
 * - Total transactions (24h/7d)
 * - Top validators by transaction throughput
 * - Transaction distribution by validator type
 */

import { useState } from 'react';
import { useValidators } from '@/hooks/useValidators';
import { BakerDetailPanel } from './BakerDetailPanel';
import type { Validator } from '@/lib/types/validators';

const PAGE_SIZE = 15;

type SortPeriod = '24h' | '7d';

export function TransactionsView() {
  const { data, isLoading, error } = useValidators();
  const [selectedValidator, setSelectedValidator] = useState<Validator | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [sortPeriod, setSortPeriod] = useState<SortPeriod>('24h');
  const validators = data?.validators ?? [];

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
      visibleTx24h: acc.visibleTx24h + (v.source === 'reporting' ? v.transactions24h : 0),
      phantomTx24h: acc.phantomTx24h + (v.source === 'chain_only' ? v.transactions24h : 0),
    }),
    { tx24h: 0, tx7d: 0, visibleTx24h: 0, phantomTx24h: 0 }
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
      return b.transactions7d - a.transactions7d;
    });

  // Pagination
  const totalPages = Math.ceil(sortedValidators.length / PAGE_SIZE);
  const startIdx = currentPage * PAGE_SIZE;
  const paginatedValidators = sortedValidators.slice(startIdx, startIdx + PAGE_SIZE);

  const formatNumber = (n: number) => n.toLocaleString();

  return (
    <div className="bb-data-view">
      {/* Summary Cards */}
      <div className="bb-view-summary">
        <div className="bb-stat-card">
          <div className="bb-stat-value">{formatNumber(totals.tx24h)}</div>
          <div className="bb-stat-label">Transactions (24h)</div>
        </div>
        <div className="bb-stat-card">
          <div className="bb-stat-value">{formatNumber(totals.tx7d)}</div>
          <div className="bb-stat-label">Transactions (7d)</div>
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
            </div>
          </div>
          <span className="bb-section-count">{sortedValidators.length} validators</span>
        </div>
        <table className="bb-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Baker ID</th>
              <th>Type</th>
              <th className={sortPeriod === '24h' ? 'bb-sorted' : ''}>Txs (24h){sortPeriod === '24h' && ' ▼'}</th>
              <th className={sortPeriod === '7d' ? 'bb-sorted' : ''}>Txs (7d){sortPeriod === '7d' && ' ▼'}</th>
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
                </td>
                <td className="font-mono">{formatNumber(v.transactions24h)}</td>
                <td className="font-mono">{formatNumber(v.transactions7d)}</td>
                <td className="font-mono">
                  {v.lotteryPower !== null ? `${(v.lotteryPower * 100).toFixed(3)}%` : '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

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
