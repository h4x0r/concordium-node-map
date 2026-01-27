'use client';

import {
  RISK_LEVELS,
  assessRisk,
  formatRiskTooltip,
  getPortLegend,
  getNodeSortIndicator,
  type AttackSurfaceNode,
  type SortColumn,
  type SortDirection,
  type NodeSortStage,
} from '@/lib/attack-surface';

interface AttackSurfaceTableProps {
  nodes: AttackSurfaceNode[];
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  nodeSortStage: NodeSortStage;
  onSort: (column: SortColumn) => void;
  onNodeSelect: (nodeId: string) => void;
}

/**
 * Get risk tooltip for a specific node
 */
function getNodeRiskTooltip(node: AttackSurfaceNode): string {
  const result = assessRisk({
    osintPorts: node.osintPorts,
    osintVulns: node.osintVulns,
    osintReputation: node.osintReputation,
    isValidator: node.isValidator,
    ipAddress: node.ipAddress,
  });
  return formatRiskTooltip(result);
}

/**
 * Table component for displaying attack surface data
 */
export function AttackSurfaceTable({
  nodes,
  sortColumn,
  sortDirection,
  nodeSortStage,
  onSort,
  onNodeSelect,
}: AttackSurfaceTableProps) {
  const legend = getPortLegend();

  // Sort indicator for non-node columns (simple asc/desc)
  const sortIndicator = (column: SortColumn) => {
    if (column === 'node') {
      // Node column uses 4-stage indicator
      return sortColumn === 'node' ? getNodeSortIndicator(nodeSortStage) : '';
    }
    return sortColumn === column ? (sortDirection === 'asc' ? '▲' : '▼') : '';
  };

  return (
    <>
      <div className="flex-1 overflow-auto">
        <table className="bb-table w-full">
          <thead className="sticky top-0 bg-[var(--bb-panel-bg)] z-10">
            <tr>
              <th className="text-left cursor-pointer" onClick={() => onSort('risk')}>
                RISK {sortIndicator('risk')}
              </th>
              <th className="text-left cursor-pointer" onClick={() => onSort('node')}>
                NODE {sortIndicator('node')}
              </th>
              <th className="text-left cursor-pointer" onClick={() => onSort('ip')}>
                IP {sortIndicator('ip')}
              </th>
              <th className="text-center cursor-pointer" onClick={() => onSort('port8888')}>
                8888 {sortIndicator('port8888')}
              </th>
              <th className="text-center cursor-pointer" onClick={() => onSort('port20000')}>
                20000 {sortIndicator('port20000')}
              </th>
              <th className="text-center cursor-pointer" onClick={() => onSort('portGrpcOther')}>
                Other gRPC {sortIndicator('portGrpcOther')}
              </th>
              <th className="text-center cursor-pointer" onClick={() => onSort('portOther')}>
                OTHER {sortIndicator('portOther')}
              </th>
              <th className="text-center cursor-pointer" onClick={() => onSort('vulns')}>
                CVE {sortIndicator('vulns')}
              </th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((node) => {
              const riskConfig = RISK_LEVELS[node.riskLevel];

              return (
                <tr
                  key={node.nodeId}
                  onClick={() => onNodeSelect(node.nodeId)}
                  className="cursor-pointer hover:bg-[var(--bb-panel-bg)]"
                >
                  <td style={{ color: riskConfig.color }} title={getNodeRiskTooltip(node)}>
                    {riskConfig.emoji}
                  </td>
                  <td>
                    {node.isValidator && (
                      <span className="bb-validator-icon mr-1" title="Validator">
                        ✓
                      </span>
                    )}
                    <span className="text-[var(--bb-cyan)]">{node.nodeName}</span>
                  </td>
                  <td className="font-mono text-xs">
                    {node.ipAddress ? (
                      <span className="text-[var(--bb-text)]">{node.ipAddress}</span>
                    ) : (
                      <span className="text-[var(--bb-gray)] italic">No IP</span>
                    )}
                  </td>
                  <td className="text-center">
                    {node.hasPeeringPort ? (
                      <span className="text-[var(--bb-cyan)]">✓</span>
                    ) : (
                      <span className="text-[var(--bb-gray)]">-</span>
                    )}
                  </td>
                  <td className="text-center">
                    {node.hasGrpcDefault ? (
                      <span className="text-[var(--bb-cyan)]">✓</span>
                    ) : (
                      <span className="text-[var(--bb-gray)]">-</span>
                    )}
                  </td>
                  <td className="text-center">
                    {node.hasGrpcOther.length > 0 ? (
                      <span className="text-[var(--bb-cyan)]">{node.hasGrpcOther.join(',')}</span>
                    ) : (
                      <span className="text-[var(--bb-gray)]">-</span>
                    )}
                  </td>
                  <td className="text-center">
                    {node.hasOtherPorts.length > 0 ? (
                      <span className="text-[var(--bb-amber)]">{node.hasOtherPorts.length}</span>
                    ) : (
                      <span className="text-[var(--bb-gray)]">-</span>
                    )}
                  </td>
                  <td className="text-center">
                    {node.osintVulns.length > 0 ? (
                      <span className="text-[var(--bb-red)]">{node.osintVulns.length}</span>
                    ) : (
                      <span className="text-[var(--bb-gray)]">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {nodes.length === 0 && (
          <div className="flex items-center justify-center h-64">
            <span className="text-[var(--bb-gray)]">No nodes match the current filters</span>
          </div>
        )}
      </div>

      {/* Footer with legend - using single source of truth */}
      <div className="border-t border-[var(--bb-border)] px-4 py-2 text-xs text-[var(--bb-gray)]">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span>LEGEND:</span>
          {legend.map((item) => (
            <span key={item.label}>
              {item.label} = {item.description}
            </span>
          ))}
          <span className="text-[var(--bb-amber)]">⚠️ Data from OSINT only - no active scanning</span>
        </div>
      </div>
    </>
  );
}
