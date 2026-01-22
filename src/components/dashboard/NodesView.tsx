'use client';

/**
 * NodesView - Network node list with lottery power
 *
 * Shows all network nodes with baker nodes highlighted at the top,
 * sorted by lottery power. Non-baker nodes appear below.
 */

import { useState, useRef, useMemo } from 'react';
import { useNodes } from '@/hooks/useNodes';
import { useValidators } from '@/hooks/useValidators';
import { useResponsivePageSize } from '@/hooks/useResponsivePageSize';
import { formatNumber, formatLotteryPower } from '@/lib/format-utils';
import { calculateNodeHealth, type ConcordiumNode } from '@/lib/transforms';
import type { Validator } from '@/lib/types/validators';

interface NodeWithLotteryPower extends ConcordiumNode {
  lotteryPower: number | null;
  validator: Validator | null;
}

export function NodesView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { data: nodes, isLoading: nodesLoading, error: nodesError } = useNodes();
  const { data: validatorsData, isLoading: validatorsLoading } = useValidators();
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const pageSize = useResponsivePageSize({ containerRef });

  const isLoading = nodesLoading || validatorsLoading;

  // Create a map of bakerId -> Validator for quick lookup
  const validatorMap = useMemo(() => {
    const map = new Map<number, Validator>();
    if (validatorsData?.validators) {
      for (const v of validatorsData.validators) {
        map.set(v.bakerId, v);
      }
    }
    return map;
  }, [validatorsData]);

  // Join nodes with lottery power and sort: bakers first (by lottery power desc), then non-bakers
  const sortedNodes = useMemo<NodeWithLotteryPower[]>(() => {
    if (!nodes) return [];

    const nodesWithPower = nodes.map((node): NodeWithLotteryPower => {
      const validator = node.consensusBakerId !== null
        ? validatorMap.get(node.consensusBakerId) ?? null
        : null;
      return {
        ...node,
        lotteryPower: validator?.lotteryPower ?? null,
        validator,
      };
    });

    // Sort: bakers at top by lottery power desc, then non-bakers alphabetically
    return nodesWithPower.sort((a, b) => {
      const aIsBaker = a.consensusBakerId !== null;
      const bIsBaker = b.consensusBakerId !== null;

      // Bakers come first
      if (aIsBaker && !bIsBaker) return -1;
      if (!aIsBaker && bIsBaker) return 1;

      // Both bakers: sort by lottery power descending
      if (aIsBaker && bIsBaker) {
        const aPower = a.lotteryPower ?? 0;
        const bPower = b.lotteryPower ?? 0;
        return bPower - aPower;
      }

      // Both non-bakers: sort by node name
      return (a.nodeName || a.nodeId).localeCompare(b.nodeName || b.nodeId);
    });
  }, [nodes, validatorMap]);

  // Calculate max height for health comparison
  const maxHeight = useMemo(() => {
    if (!sortedNodes.length) return 0;
    return Math.max(...sortedNodes.map(n => n.finalizedBlockHeight));
  }, [sortedNodes]);

  // Stats
  const stats = useMemo(() => {
    const bakerNodes = sortedNodes.filter(n => n.consensusBakerId !== null);
    const totalLotteryPower = bakerNodes.reduce((sum, n) => sum + (n.lotteryPower ?? 0), 0);
    return {
      totalNodes: sortedNodes.length,
      bakerNodes: bakerNodes.length,
      nonBakerNodes: sortedNodes.length - bakerNodes.length,
      totalLotteryPower,
    };
  }, [sortedNodes]);

  // Pagination
  const totalPages = Math.ceil(sortedNodes.length / pageSize);
  const startIdx = currentPage * pageSize;
  const paginatedNodes = sortedNodes.slice(startIdx, startIdx + pageSize);

  if (isLoading) {
    return (
      <div className="bb-view-loading">
        <div className="bb-spinner" />
        <span>Loading node data...</span>
      </div>
    );
  }

  if (nodesError) {
    return (
      <div className="bb-view-error">
        Failed to load node data: {nodesError.message}
      </div>
    );
  }

  const formatUptime = (ms: number) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  return (
    <div className="bb-data-view" ref={containerRef}>
      {/* Summary Cards */}
      <div className="bb-view-summary">
        <div className="bb-stat-card bb-stat-card-combined">
          <div className="bb-stat-card-title">Nodes</div>
          <div className="bb-stat-metrics">
            <div className="bb-stat-metric">
              <span className="bb-stat-value">{stats.totalNodes}</span>
              <span className="bb-stat-period">Total</span>
            </div>
            <div className="bb-stat-metric">
              <span className="bb-stat-value">{stats.bakerNodes}</span>
              <span className="bb-stat-period">Bakers</span>
            </div>
            <div className="bb-stat-metric">
              <span className="bb-stat-value">{stats.nonBakerNodes}</span>
              <span className="bb-stat-period">Non-Baker</span>
            </div>
          </div>
        </div>
        <div className="bb-stat-card positive">
          <div className="bb-stat-value">{(stats.totalLotteryPower * 100).toFixed(1)}%</div>
          <div className="bb-stat-label">Visible Lottery Power</div>
        </div>
        <div className="bb-stat-card">
          <div className="bb-stat-value">{((stats.bakerNodes / stats.totalNodes) * 100).toFixed(1)}%</div>
          <div className="bb-stat-label">Baker Node Ratio</div>
        </div>
      </div>

      {/* Nodes Table */}
      <div className="bb-view-section">
        <div className="bb-section-header">
          <h3>Network Nodes</h3>
          <span className="bb-section-count">{sortedNodes.length} nodes</span>
        </div>
        <div className="bb-table-wrapper">
          <table className="bb-table">
            <thead>
              <tr>
                <th>#</th>
                <th className="bb-status-col"></th>
                <th>Node Name</th>
                <th>Baker ID</th>
                <th>Lottery Power</th>
                <th>Peers</th>
                <th>Height</th>
                <th>Uptime</th>
                <th>Client</th>
              </tr>
            </thead>
            <tbody>
              {paginatedNodes.map((node, idx) => {
                const isBaker = node.consensusBakerId !== null;
                const health = calculateNodeHealth(node, maxHeight);
                const statusClass = {
                  healthy: 'bb-status-dot-healthy',
                  lagging: 'bb-status-dot-lagging',
                  issue: 'bb-status-dot-issue',
                }[health];
                const statusTitle = {
                  healthy: 'Healthy',
                  lagging: 'Lagging',
                  issue: 'Issue',
                }[health];
                return (
                  <tr
                    key={node.nodeId}
                    className={`${isBaker ? 'bb-baker-row' : ''} ${selectedNodeId === node.nodeId ? 'selected' : ''}`}
                    onClick={() => setSelectedNodeId(node.nodeId === selectedNodeId ? null : node.nodeId)}
                  >
                    <td className="font-mono bb-rank">{startIdx + idx + 1}</td>
                    <td className="bb-status-cell">
                      <span className={`bb-status-dot ${statusClass}`} title={statusTitle} />
                    </td>
                    <td className="bb-node-name" title={node.nodeId}>
                      {isBaker && <span className="bb-baker-emoji" title="Baker">🥖</span>}
                      {node.nodeName || node.nodeId.slice(0, 16) + '...'}
                    </td>
                    <td className="font-mono">
                      {isBaker ? (
                        <span className="bb-baker-id">{node.consensusBakerId}</span>
                      ) : (
                        <span className="bb-no-baker">--</span>
                      )}
                    </td>
                    <td className="font-mono">
                      {isBaker ? (
                        <span className="bb-lottery-power">{formatLotteryPower(node.lotteryPower)}</span>
                      ) : (
                        <span className="bb-no-baker">--</span>
                      )}
                    </td>
                    <td className="font-mono">{node.peersCount}</td>
                    <td className="font-mono">{formatNumber(node.finalizedBlockHeight)}</td>
                    <td className="font-mono">{formatUptime(node.uptime)}</td>
                    <td className="bb-client">{node.client || '--'}</td>
                  </tr>
                );
              })}
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
    </div>
  );
}
