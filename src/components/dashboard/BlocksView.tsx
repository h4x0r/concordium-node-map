'use client';

/**
 * BlocksView - Network block production overview
 *
 * Shows block production stats aggregated from validator data:
 * - Total blocks (24h/7d)
 * - Top validators by block production
 * - Block distribution by validator type
 */

import { useValidators } from '@/hooks/useValidators';

export function BlocksView() {
  const { data, isLoading, error } = useValidators();
  const validators = data?.validators ?? [];

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
      visibleBlocks24h: acc.visibleBlocks24h + (v.source === 'reporting' ? v.blocks24h : 0),
      phantomBlocks24h: acc.phantomBlocks24h + (v.source === 'chain_only' ? v.blocks24h : 0),
    }),
    { blocks24h: 0, blocks7d: 0, visibleBlocks24h: 0, phantomBlocks24h: 0 }
  );

  const phantomBlockPct = totals.blocks24h > 0
    ? (totals.phantomBlocks24h / totals.blocks24h) * 100
    : 0;

  // Top validators by blocks (24h)
  const topByBlocks = [...validators]
    .sort((a, b) => b.blocks24h - a.blocks24h)
    .slice(0, 10);

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
        <div className="bb-stat-card positive">
          <div className="bb-stat-value">{formatNumber(totals.visibleBlocks24h)}</div>
          <div className="bb-stat-label">By Visible Validators</div>
        </div>
        <div className="bb-stat-card negative">
          <div className="bb-stat-value">{formatNumber(totals.phantomBlocks24h)}</div>
          <div className="bb-stat-label">By Phantom ({phantomBlockPct.toFixed(1)}%)</div>
        </div>
      </div>

      {/* Top Validators by Blocks */}
      <div className="bb-view-section">
        <h3>Top Block Producers (24h)</h3>
        <table className="bb-table">
          <thead>
            <tr>
              <th>Baker ID</th>
              <th>Type</th>
              <th>Blocks (24h)</th>
              <th>Blocks (7d)</th>
              <th>Last Block</th>
              <th>Lottery Power</th>
            </tr>
          </thead>
          <tbody>
            {topByBlocks.map((v) => (
              <tr key={v.bakerId}>
                <td className="font-mono">{v.bakerId}</td>
                <td>
                  <span className={`bb-badge ${v.source === 'reporting' ? 'positive' : 'negative'}`}>
                    {v.source === 'reporting' ? 'Visible' : 'Phantom'}
                  </span>
                </td>
                <td className="font-mono">{formatNumber(v.blocks24h)}</td>
                <td className="font-mono">{formatNumber(v.blocks7d)}</td>
                <td>{formatLastBlockTime(v.lastBlockTime)}</td>
                <td className="font-mono">
                  {v.lotteryPower !== null ? `${(v.lotteryPower * 100).toFixed(3)}%` : '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
