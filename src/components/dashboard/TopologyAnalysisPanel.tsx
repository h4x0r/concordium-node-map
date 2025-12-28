'use client';

import { useMemo, useCallback, useState } from 'react';
import { useNodes } from '@/hooks/useNodes';
import { useAppStore } from '@/hooks/useAppStore';
import { useAudio } from '@/hooks/useAudio';
import {
  buildAdjacencyList,
  getNetworkSummary,
  identifyBottlenecks,
  identifyBridges,
  calculateDegreeDistribution,
  exportToGraphML,
  type GraphNode,
  type GraphEdge,
} from '@/lib/topology-analysis';
import type { ConcordiumNode } from '@/lib/transforms';

/**
 * Collapsible topology analysis bar - overlays top of topology canvas
 * Bloomberg terminal aesthetic with bright data visualization
 */
export function TopologyAnalysisBar() {
  const [isExpanded, setIsExpanded] = useState(true);
  const { data: nodes } = useNodes();
  const { selectNode } = useAppStore();
  const { playAcquisitionSequence } = useAudio();

  const handleNodeClick = useCallback((nodeId: string) => {
    playAcquisitionSequence();
    selectNode(nodeId);
  }, [playAcquisitionSequence, selectNode]);

  const analysis = useMemo(() => {
    if (!nodes || nodes.length === 0) return null;

    const graphNodes: GraphNode[] = nodes.map((n) => ({ id: n.nodeId }));
    const graphEdges: GraphEdge[] = [];
    const nodeIds = new Set(nodes.map((n) => n.nodeId));

    for (const node of nodes) {
      for (const peerId of node.peersList) {
        if (nodeIds.has(peerId)) {
          const [a, b] = [node.nodeId, peerId].sort();
          const edgeId = `${a}-${b}`;
          if (!graphEdges.some((e) => `${e.source}-${e.target}` === edgeId)) {
            graphEdges.push({ source: a, target: b });
          }
        }
      }
    }

    const adj = buildAdjacencyList(graphNodes, graphEdges);
    const summary = getNetworkSummary(adj);
    const distribution = calculateDegreeDistribution(adj);
    const bottlenecks = identifyBottlenecks(adj, 3);
    const bridges = identifyBridges(adj);

    // Build degree -> nodes mapping for clickable tooltips
    const nodesByDegree = new Map<number, Array<{ id: string; name: string }>>();
    for (const node of nodes) {
      const degree = adj.get(node.nodeId)?.size ?? 0;
      if (!nodesByDegree.has(degree)) {
        nodesByDegree.set(degree, []);
      }
      nodesByDegree.get(degree)!.push({
        id: node.nodeId,
        name: node.nodeName || node.nodeId.slice(0, 12),
      });
    }

    return { summary, distribution, bottlenecks, bridges, graphNodes, graphEdges, nodesByDegree };
  }, [nodes]);

  const handleExport = useCallback(() => {
    if (!nodes || !analysis) return;

    const enrichedNodes = nodes.map((n) => ({
      id: n.nodeId,
      label: n.nodeName || n.nodeId.slice(0, 12),
      peersCount: n.peersCount,
      client: n.client,
      isBaker: n.bakingCommitteeMember === 'ActiveInCommittee' && n.consensusBakerId !== null,
      finalizedBlockHeight: n.finalizedBlockHeight,
    }));

    const graphml = exportToGraphML(enrichedNodes, analysis.graphEdges);
    const blob = new Blob([graphml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `concordium-topology-${new Date().toISOString().slice(0, 10)}.graphml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [nodes, analysis]);

  if (!analysis) return null;

  const { summary, distribution, bottlenecks, bridges, nodesByDegree } = analysis;

  // Network health indicator
  const healthStatus = !summary.isConnected
    ? { label: 'FRAGMENTED', color: 'var(--bb-red)' }
    : bridges.length > 0
      ? { label: 'VULNERABLE', color: 'var(--bb-amber)' }
      : { label: 'RESILIENT', color: 'var(--bb-green)' };

  return (
    <div className="topo-analysis-bar">
      {/* Collapsed state - minimal metrics strip */}
      <div
        className="topo-analysis-collapsed"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="topo-analysis-toggle">
          <span className="topo-analysis-toggle-icon">{isExpanded ? '▼' : '▶'}</span>
          <span className="topo-analysis-toggle-label">TOPOLOGY ANALYSIS</span>
        </div>

        <div className="topo-analysis-quick-stats">
          <div className="topo-stat">
            <span className="topo-stat-value" style={{ color: 'var(--bb-cyan)' }}>
              {summary.nodeCount}
            </span>
            <span className="topo-stat-label">NODES</span>
          </div>
          <div className="topo-stat">
            <span className="topo-stat-value">{summary.edgeCount}</span>
            <span className="topo-stat-label">EDGES</span>
          </div>
          <div className="topo-stat">
            <span className="topo-stat-value">{summary.avgDegree.toFixed(1)}</span>
            <span className="topo-stat-label">AVG DEG</span>
          </div>
          <div className="topo-stat">
            <span className="topo-stat-value" style={{ color: 'var(--bb-amber)' }}>
              {summary.diameter === Infinity ? '∞' : summary.diameter}
            </span>
            <span className="topo-stat-label">DIAMETER</span>
          </div>
          <div className="topo-stat">
            <span className="topo-stat-value">{summary.globalClusteringCoefficient.toFixed(2)}</span>
            <span className="topo-stat-label">CLUSTER</span>
          </div>
          <div className="topo-stat status">
            <span className="topo-stat-value" style={{ color: healthStatus.color }}>
              ●
            </span>
            <span className="topo-stat-label" style={{ color: healthStatus.color }}>
              {healthStatus.label}
            </span>
          </div>
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); handleExport(); }}
          className="topo-export-btn"
          title="Export GraphML"
        >
          ⬇ EXPORT
        </button>
      </div>

      {/* Expanded state - full analysis dashboard */}
      {isExpanded && (
        <div className="topo-analysis-expanded">
          {/* Degree Distribution Chart */}
          <div className="topo-section">
            <div className="topo-section-header">DEGREE DISTRIBUTION</div>
            <DegreeChart
              distribution={distribution}
              nodesByDegree={nodesByDegree}
              onNodeClick={handleNodeClick}
            />
          </div>

          {/* Bottlenecks */}
          <div className="topo-section">
            <div className="topo-section-header">
              CRITICAL NODES
              <span className="topo-section-count">{bottlenecks.length}</span>
            </div>
            <div className="topo-bottlenecks">
              {bottlenecks.map((nodeId) => {
                const node = nodes?.find((n) => n.nodeId === nodeId);
                return (
                  <div
                    key={nodeId}
                    className="topo-bottleneck topo-clickable"
                    onClick={() => handleNodeClick(nodeId)}
                    title="Click to select node"
                  >
                    <span className="topo-bottleneck-indicator">◆</span>
                    <span className="topo-bottleneck-name">
                      {node?.nodeName || nodeId.slice(0, 12)}
                    </span>
                    <span className="topo-bottleneck-peers">{node?.peersCount ?? '?'}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bridge Edges */}
          <div className="topo-section">
            <div className="topo-section-header">
              BRIDGE EDGES
              <span className="topo-section-count" style={{ color: bridges.length > 0 ? 'var(--bb-red)' : 'var(--bb-green)' }}>
                {bridges.length}
              </span>
            </div>
            {bridges.length === 0 ? (
              <div className="topo-bridges-ok">No single points of failure</div>
            ) : (
              <div className="topo-bridges">
                {bridges.slice(0, 4).map(([a, b], i) => (
                  <div key={i} className="topo-bridge">
                    <span
                      className="topo-clickable"
                      onClick={() => handleNodeClick(a)}
                      title="Click to select node"
                    >
                      {a.slice(0, 6)}
                    </span>
                    <span className="topo-bridge-arrow">⟷</span>
                    <span
                      className="topo-clickable"
                      onClick={() => handleNodeClick(b)}
                      title="Click to select node"
                    >
                      {b.slice(0, 6)}
                    </span>
                  </div>
                ))}
                {bridges.length > 4 && (
                  <div className="topo-bridges-more">+{bridges.length - 4} more</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface DegreeChartProps {
  distribution: Map<number, number>;
  nodesByDegree: Map<number, Array<{ id: string; name: string }>>;
  onNodeClick: (nodeId: string) => void;
}

function DegreeChart({ distribution, nodesByDegree, onNodeClick }: DegreeChartProps) {
  const [hoveredDegree, setHoveredDegree] = useState<number | null>(null);
  const sorted = Array.from(distribution.entries()).sort((a, b) => a[0] - b[0]);
  const maxCount = Math.max(...sorted.map(([, count]) => count), 1);
  const totalNodes = sorted.reduce((sum, [, count]) => sum + count, 0);

  return (
    <div className="topo-degree-chart">
      {sorted.map(([degree, count]) => {
        const height = (count / maxCount) * 100;
        const percentage = ((count / totalNodes) * 100).toFixed(0);
        const nodesAtDegree = nodesByDegree.get(degree) || [];
        const isHovered = hoveredDegree === degree;

        return (
          <div
            key={degree}
            className="topo-degree-bar-wrapper"
            onMouseEnter={() => setHoveredDegree(degree)}
            onMouseLeave={() => setHoveredDegree(null)}
          >
            <div
              className={`topo-degree-bar ${degree === 0 ? 'topo-degree-bar-zero' : ''}`}
              style={{ height: `${height}%` }}
            >
              <span className="topo-degree-bar-count">{count}</span>
            </div>
            <span className="topo-degree-label">{degree}</span>

            {/* Hover dropdown with clickable nodes */}
            {isHovered && nodesAtDegree.length > 0 && (
              <div className="topo-degree-dropdown">
                <div className="topo-degree-dropdown-header">
                  Degree {degree}: {count} nodes ({percentage}%)
                </div>
                <div className="topo-degree-dropdown-list">
                  {nodesAtDegree.slice(0, 10).map((node) => (
                    <div
                      key={node.id}
                      className="topo-degree-dropdown-item topo-clickable"
                      onClick={() => onNodeClick(node.id)}
                    >
                      {node.name}
                    </div>
                  ))}
                  {nodesAtDegree.length > 10 && (
                    <div className="topo-degree-dropdown-more">
                      +{nodesAtDegree.length - 10} more
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Legacy export for backwards compatibility
export { TopologyAnalysisBar as TopologyAnalysisPanel };
