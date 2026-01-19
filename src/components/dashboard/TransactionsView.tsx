'use client';

/**
 * TransactionsView - Network transaction activity overview
 *
 * Shows transaction stats aggregated from validator data:
 * - Total transactions (24h/7d)
 * - Top validators by transaction throughput
 * - Transaction distribution by validator type
 */

import { useValidators } from '@/hooks/useValidators';

export function TransactionsView() {
  const { data, isLoading, error } = useValidators();
  const validators = data?.validators ?? [];

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

  // Top validators by transactions (24h)
  const topByTx = [...validators]
    .sort((a, b) => b.transactions24h - a.transactions24h)
    .slice(0, 10);

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
          <div className="bb-stat-label">By Phantom Validators</div>
        </div>
      </div>

      {/* Top Validators by Transactions */}
      <div className="bb-view-section">
        <h3>Top Validators by Transactions (24h)</h3>
        <table className="bb-table">
          <thead>
            <tr>
              <th>Baker ID</th>
              <th>Type</th>
              <th>Txs (24h)</th>
              <th>Txs (7d)</th>
              <th>Lottery Power</th>
            </tr>
          </thead>
          <tbody>
            {topByTx.map((v) => (
              <tr key={v.bakerId}>
                <td className="font-mono">{v.bakerId}</td>
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
      </div>
    </div>
  );
}
