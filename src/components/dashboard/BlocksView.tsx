'use client';

/**
 * BlocksView - Network block production overview
 *
 * Shows block production stats aggregated from validator data:
 * - Total blocks (24h/7d/30d)
 * - Top validators by block production
 * - Block distribution by validator type
 */

import { useState } from 'react';
import { useValidators } from '@/hooks/useValidators';
import { BakerDetailPanel } from './BakerDetailPanel';
import type { Validator } from '@/lib/types/validators';

const PAGE_SIZE = 15;

type SortPeriod = '24h' | '7d' | '30d';

export function BlocksView() {
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
        <span>Loading block data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bb-view-error">
        Failed to load block data: {error.message}
      </div>
    );
  }

  // Aggregate block stats
  const totals = validators.reduce(
    (acc, v) => ({
      blocks24h: acc.blocks24h + v.blocks24h,
      blocks7d: acc.blocks7d + v.blocks7d,
      blocks30d: acc.blocks30d + v.blocks30d,
      visibleBlocks24h: acc.visibleBlocks24h + (v.source === 'reporting' ? v.blocks24h : 0),
      phantomBlocks24h: acc.phantomBlocks24h + (v.source === 'chain_only' ? v.blocks24h : 0),
    }),
    { blocks24h: 0, blocks7d: 0, blocks30d: 0, visibleBlocks24h: 0, phantomBlocks24h: 0 }
  );

  const phantomBlockPct = totals.blocks24h > 0
    ? (totals.phantomBlocks24h / totals.blocks24h) * 100
    : 0;

  // All validators sorted by blocks (by selected period)
  const sortedValidators = [...validators]
    .sort((a, b) => {
      if (sortPeriod === '24h') {
        return b.blocks24h - a.blocks24h;
      }
      if (sortPeriod === '7d') {
        return b.blocks7d - a.blocks7d;
      }
      return b.blocks30d - a.blocks30d;
    });

  // Pagination
  const totalPages = Math.ceil(sortedValidators.length / PAGE_SIZE);
  const startIdx = currentPage * PAGE_SIZE;
  const paginatedValidators = sortedValidators.slice(startIdx, startIdx + PAGE_SIZE);

  const formatNumber = (n: number) => n.toLocaleString();

  const formatLastBlockTime = (timestamp: number | null) => {
    if (timestamp === null) return '--';
    const diff = Date.now() - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="bb-data-view">
      {/* Summary Cards */}
      <div className="bb-view-summary">
        <div className="bb-stat-card">
          <div className="bb-stat-value">{formatNumber(totals.blocks24h)}</div>
          <div className="bb-stat-label">Blocks (24h)</div>
        </div>
        <div className="bb-stat-card">
          <div className="bb-stat-value">{formatNumber(totals.blocks7d)}</div>
          <div className="bb-stat-label">Blocks (7d)</div>
        </div>
        <div className="bb-stat-card">
          <div className="bb-stat-value">{formatNumber(totals.blocks30d)}</div>
          <div className="bb-stat-label">Blocks (30d)</div>
        </div>
        <div className="bb-stat-card positive">
          <div className="bb-stat-value">{formatNumber(totals.visibleBlocks24h)}</div>
          <div className="bb-stat-label">By Visible Validators</div>
        </div>
        <div className="bb-stat-card negative">
          <div className="bb-stat-value">{formatNumber(totals.phantomBlocks24h)}</div>
          <div className="bb-stat-label">By Phantom Validators ({phantomBlockPct.toFixed(1)}%)</div>
        </div>
      </div>

      {/* Validators by Blocks */}
      <div className="bb-view-section">
        <div className="bb-section-header">
          <div className="bb-section-title-row">
            <h3>Validators by Blocks</h3>
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
        <table className="bb-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Baker ID</th>
              <th>Type</th>
              <th className={sortPeriod === '24h' ? 'bb-sorted' : ''}>Blocks (24h){sortPeriod === '24h' && ' ▼'}</th>
              <th className={sortPeriod === '7d' ? 'bb-sorted' : ''}>Blocks (7d){sortPeriod === '7d' && ' ▼'}</th>
              <th className={sortPeriod === '30d' ? 'bb-sorted' : ''}>Blocks (30d){sortPeriod === '30d' && ' ▼'}</th>
              <th>Last Block</th>
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
                <td className="font-mono">{formatNumber(v.blocks24h)}</td>
                <td className="font-mono">{formatNumber(v.blocks7d)}</td>
                <td className="font-mono">{formatNumber(v.blocks30d)}</td>
                <td>{formatLastBlockTime(v.lastBlockTime)}</td>
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
