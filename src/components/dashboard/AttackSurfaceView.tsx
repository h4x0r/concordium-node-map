'use client';

import { useMemo, useState } from 'react';
import { useAttackSurface, PORT_CATEGORIES, type AttackSurfaceNode } from '@/hooks/useAttackSurface';
import { CopyableTooltip } from '@/components/ui/CopyableTooltip';

type FilterMode = 'all' | 'validators' | 'withIp' | 'withoutIp';
type RiskFilter = 'all' | 'critical' | 'high' | 'medium' | 'low' | 'unknown';

/**
 * Attack Surface view showing nodes, IPs, and open ports discovered via OSINT
 */
export function AttackSurfaceView() {
  const { nodes, stats, isLoading } = useAttackSurface();
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNode, setSelectedNode] = useState<AttackSurfaceNode | null>(null);

  // Filter nodes
  const filteredNodes = useMemo(() => {
    let filtered = nodes;

    // Apply mode filter
    if (filterMode === 'validators') {
      filtered = filtered.filter(n => n.isValidator);
    } else if (filterMode === 'withIp') {
      filtered = filtered.filter(n => n.ipAddress !== null);
    } else if (filterMode === 'withoutIp') {
      filtered = filtered.filter(n => n.ipAddress === null);
    }

    // Apply risk filter
    if (riskFilter !== 'all') {
      filtered = filtered.filter(n => n.riskLevel === riskFilter);
    }

    // Apply search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(n =>
        n.nodeName.toLowerCase().includes(term) ||
        n.nodeId.toLowerCase().includes(term) ||
        n.ipAddress?.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [nodes, filterMode, riskFilter, searchTerm]);

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[var(--bb-black)]">
        <span className="text-[var(--bb-gray)]">LOADING ATTACK SURFACE...</span>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-[var(--bb-black)] text-[var(--bb-text)]">
      {/* Header with stats */}
      <div className="bb-panel-header dark flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-6">
          <span className="text-[var(--bb-cyan)] font-bold">ATTACK SURFACE</span>
          <span className="text-[var(--bb-gray)] text-xs">
            {stats.total} nodes • {stats.withIp} with IP • {stats.validators} validators
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[var(--bb-gray)]">RISK:</span>
            {stats.riskLevels.critical > 0 && (
              <span className="text-[var(--bb-red)]">🔴 {stats.riskLevels.critical} CRITICAL</span>
            )}
            {stats.riskLevels.high > 0 && (
              <span className="text-[var(--bb-amber)]">🟠 {stats.riskLevels.high} HIGH</span>
            )}
            {stats.riskLevels.medium > 0 && (
              <span className="text-[var(--bb-amber)]">🟡 {stats.riskLevels.medium} MED</span>
            )}
            {stats.riskLevels.low > 0 && (
              <span className="text-[var(--bb-green)]">🟢 {stats.riskLevels.low} LOW</span>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--bb-border)]">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--bb-gray)]">FILTER:</span>
          <button
            onClick={() => setFilterMode('all')}
            className={`px-2 py-1 text-xs ${filterMode === 'all' ? 'bg-[var(--bb-cyan)] text-black' : 'bg-[var(--bb-panel-bg)] text-[var(--bb-gray)]'}`}
          >
            ALL ({stats.total})
          </button>
          <button
            onClick={() => setFilterMode('validators')}
            className={`px-2 py-1 text-xs ${filterMode === 'validators' ? 'bg-[var(--bb-magenta)] text-black' : 'bg-[var(--bb-panel-bg)] text-[var(--bb-gray)]'}`}
          >
            VALIDATORS ({stats.validators})
          </button>
          <button
            onClick={() => setFilterMode('withIp')}
            className={`px-2 py-1 text-xs ${filterMode === 'withIp' ? 'bg-[var(--bb-cyan)] text-black' : 'bg-[var(--bb-panel-bg)] text-[var(--bb-gray)]'}`}
          >
            WITH IP ({stats.withIp})
          </button>
          <button
            onClick={() => setFilterMode('withoutIp')}
            className={`px-2 py-1 text-xs ${filterMode === 'withoutIp' ? 'bg-[var(--bb-amber)] text-black' : 'bg-[var(--bb-panel-bg)] text-[var(--bb-gray)]'}`}
          >
            NO IP ({stats.withoutIp})
          </button>
        </div>

        <div className="flex items-center gap-2 ml-4">
          <span className="text-xs text-[var(--bb-gray)]">RISK:</span>
          {(['all', 'critical', 'high', 'medium', 'low', 'unknown'] as const).map((risk) => (
            <button
              key={risk}
              onClick={() => setRiskFilter(risk)}
              className={`px-2 py-1 text-xs ${
                riskFilter === risk
                  ? risk === 'critical' ? 'bg-[var(--bb-red)] text-black'
                  : risk === 'high' ? 'bg-[var(--bb-amber)] text-black'
                  : risk === 'medium' ? 'bg-[var(--bb-amber)] text-black'
                  : risk === 'low' ? 'bg-[var(--bb-green)] text-black'
                  : 'bg-[var(--bb-cyan)] text-black'
                  : 'bg-[var(--bb-panel-bg)] text-[var(--bb-gray)]'
              }`}
            >
              {risk.toUpperCase()}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Search nodes, IPs..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="ml-auto px-2 py-1 text-xs bg-[var(--bb-panel-bg)] border border-[var(--bb-border)] text-[var(--bb-text)] focus:outline-none focus:border-[var(--bb-cyan)]"
          style={{ width: '200px' }}
        />
      </div>

      {/* Main content area with split view */}
      <div className="flex-1 flex min-h-0">
        {/* Nodes table */}
        <div className="flex-1 overflow-auto">
          <table className="bb-table w-full">
            <thead className="sticky top-0 bg-[var(--bb-panel-bg)] z-10">
              <tr>
                <th className="text-left">RISK</th>
                <th className="text-left">NODE</th>
                <th className="text-left">IP ADDRESS</th>
                <th className="text-center">8888</th>
                <th className="text-center">20000</th>
                <th className="text-center">gRPC</th>
                <th className="text-center">OTHER</th>
                <th className="text-center">VULNS</th>
              </tr>
            </thead>
            <tbody>
              {filteredNodes.map((node) => {
                const riskColor =
                  node.riskLevel === 'critical' ? 'var(--bb-red)'
                  : node.riskLevel === 'high' ? 'var(--bb-amber)'
                  : node.riskLevel === 'medium' ? 'var(--bb-amber)'
                  : node.riskLevel === 'low' ? 'var(--bb-green)'
                  : 'var(--bb-gray)';

                return (
                  <tr
                    key={node.nodeId}
                    onClick={() => setSelectedNode(node)}
                    className={`cursor-pointer hover:bg-[var(--bb-panel-bg)] ${selectedNode?.nodeId === node.nodeId ? 'bg-[var(--bb-panel-bg)]' : ''}`}
                  >
                    <td style={{ color: riskColor }}>
                      {node.riskLevel === 'critical' && '🔴'}
                      {node.riskLevel === 'high' && '🟠'}
                      {node.riskLevel === 'medium' && '🟡'}
                      {node.riskLevel === 'low' && '🟢'}
                      {node.riskLevel === 'unknown' && '⚪'}
                    </td>
                    <td>
                      {node.isValidator && <span className="bb-validator-icon mr-1" title="Validator">✓</span>}
                      <span className="text-[var(--bb-cyan)]">{node.nodeName}</span>
                    </td>
                    <td className="font-mono text-xs">
                      {node.ipAddress ? (
                        <span className="text-[var(--bb-text)]">{node.ipAddress}:{node.port}</span>
                      ) : (
                        <span className="text-[var(--bb-gray)] italic">No IP</span>
                      )}
                    </td>
                    <td className="text-center">
                      {node.hasPeeringPort ? <span className="text-[var(--bb-cyan)]">✓</span> : <span className="text-[var(--bb-gray)]">-</span>}
                    </td>
                    <td className="text-center">
                      {node.hasGrpcDefault ? <span className="text-[var(--bb-cyan)]">✓</span> : <span className="text-[var(--bb-gray)]">-</span>}
                    </td>
                    <td className="text-center">
                      {node.hasGrpcCommon.length > 0 ? (
                        <span className="text-[var(--bb-cyan)]">{node.hasGrpcCommon.join(',')}</span>
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

          {filteredNodes.length === 0 && (
            <div className="flex items-center justify-center h-64">
              <span className="text-[var(--bb-gray)]">No nodes match the current filters</span>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedNode && (
          <div className="w-96 border-l border-[var(--bb-border)] overflow-auto">
            <div className="bb-panel">
              <div className="bb-panel-header dark flex items-center justify-between">
                <span>NODE DETAILS</span>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-[var(--bb-gray)] hover:text-[var(--bb-text)]"
                >
                  ✕
                </button>
              </div>
              <div className="bb-panel-body">
                <div className="bb-forensic">
                  {/* Identity */}
                  <div className="bb-forensic-section">
                    <div className="bb-forensic-section-header">IDENTITY</div>
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">Node ID</span>
                      <CopyableTooltip
                        value={selectedNode.nodeId}
                        displayValue={`${selectedNode.nodeId.slice(0, 24)}...`}
                        className="bb-forensic-value mono"
                      />
                    </div>
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">Name</span>
                      <span className="bb-forensic-value">{selectedNode.nodeName}</span>
                    </div>
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">Type</span>
                      <span className={`bb-forensic-value ${selectedNode.isValidator ? 'text-[var(--bb-magenta)]' : ''}`}>
                        {selectedNode.isValidator ? 'VALIDATOR' : 'REGULAR'}
                      </span>
                    </div>
                  </div>

                  {/* Network */}
                  {selectedNode.ipAddress && (
                    <div className="bb-forensic-section">
                      <div className="bb-forensic-section-header">NETWORK</div>
                      <div className="bb-forensic-row">
                        <span className="bb-forensic-label">IP Address</span>
                        <CopyableTooltip
                          value={selectedNode.ipAddress}
                          displayValue={selectedNode.ipAddress}
                          className="bb-forensic-value mono"
                        />
                      </div>
                      <div className="bb-forensic-row">
                        <span className="bb-forensic-label">Port</span>
                        <span className="bb-forensic-value">{selectedNode.port}</span>
                      </div>
                    </div>
                  )}

                  {/* Risk Assessment */}
                  <div className="bb-forensic-section">
                    <div className="bb-forensic-section-header">RISK ASSESSMENT</div>
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">Risk Level</span>
                      <span
                        className="bb-forensic-value font-bold"
                        style={{
                          color:
                            selectedNode.riskLevel === 'critical' ? 'var(--bb-red)'
                            : selectedNode.riskLevel === 'high' ? 'var(--bb-amber)'
                            : selectedNode.riskLevel === 'medium' ? 'var(--bb-amber)'
                            : selectedNode.riskLevel === 'low' ? 'var(--bb-green)'
                            : 'var(--bb-gray)',
                        }}
                      >
                        {selectedNode.riskLevel.toUpperCase()}
                      </span>
                    </div>
                    <div className="bb-forensic-row">
                      <span className="bb-forensic-label">Reputation</span>
                      <span className="bb-forensic-value">{selectedNode.osintReputation.toUpperCase()}</span>
                    </div>
                    {selectedNode.osintLastScan && (
                      <div className="bb-forensic-row">
                        <span className="bb-forensic-label">Last Scan</span>
                        <span className="bb-forensic-value text-xs">{new Date(selectedNode.osintLastScan).toLocaleString()}</span>
                      </div>
                    )}
                  </div>

                  {/* Open Ports */}
                  {selectedNode.osintPorts.length > 0 && (
                    <div className="bb-forensic-section">
                      <div className="bb-forensic-section-header">OPEN PORTS ({selectedNode.osintPorts.length})</div>
                      <div className="bb-forensic-row">
                        <span className="bb-forensic-label">Peering (8888)</span>
                        <span className={`bb-forensic-value ${selectedNode.hasPeeringPort ? 'text-[var(--bb-cyan)]' : 'text-[var(--bb-gray)]'}`}>
                          {selectedNode.hasPeeringPort ? 'OPEN' : 'CLOSED'}
                        </span>
                      </div>
                      <div className="bb-forensic-row">
                        <span className="bb-forensic-label">gRPC Default (20000)</span>
                        <span className={`bb-forensic-value ${selectedNode.hasGrpcDefault ? 'text-[var(--bb-cyan)]' : 'text-[var(--bb-gray)]'}`}>
                          {selectedNode.hasGrpcDefault ? 'OPEN' : 'CLOSED'}
                        </span>
                      </div>
                      {selectedNode.hasGrpcCommon.length > 0 && (
                        <div className="bb-forensic-row">
                          <span className="bb-forensic-label">gRPC Common</span>
                          <span className="bb-forensic-value text-[var(--bb-cyan)]">{selectedNode.hasGrpcCommon.join(', ')}</span>
                        </div>
                      )}
                      {selectedNode.hasOtherPorts.length > 0 && (
                        <div className="bb-forensic-row">
                          <span className="bb-forensic-label">Other Ports</span>
                          <span className="bb-forensic-value text-[var(--bb-amber)]">
                            {selectedNode.hasOtherPorts.slice(0, 10).join(', ')}
                            {selectedNode.hasOtherPorts.length > 10 && ` +${selectedNode.hasOtherPorts.length - 10} more`}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Vulnerabilities */}
                  {selectedNode.osintVulns.length > 0 && (
                    <div className="bb-forensic-section">
                      <div className="bb-forensic-section-header text-[var(--bb-red)]">
                        VULNERABILITIES ({selectedNode.osintVulns.length})
                      </div>
                      <div className="space-y-1">
                        {selectedNode.osintVulns.slice(0, 10).map((vuln, i) => (
                          <div key={i} className="text-xs font-mono text-[var(--bb-red)]">
                            • {vuln}
                          </div>
                        ))}
                        {selectedNode.osintVulns.length > 10 && (
                          <div className="text-xs text-[var(--bb-gray)] italic">
                            +{selectedNode.osintVulns.length - 10} more...
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  {selectedNode.osintTags.length > 0 && (
                    <div className="bb-forensic-section">
                      <div className="bb-forensic-section-header">TAGS</div>
                      <div className="flex flex-wrap gap-1">
                        {selectedNode.osintTags.map((tag, i) => (
                          <span
                            key={i}
                            className="px-2 py-1 text-xs bg-[var(--bb-panel-bg)] border border-[var(--bb-border)] text-[var(--bb-gray)]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer with legend */}
      <div className="border-t border-[var(--bb-border)] px-4 py-2 text-xs text-[var(--bb-gray)]">
        <div className="flex items-center gap-6">
          <span>LEGEND:</span>
          <span>8888 = Peering Port</span>
          <span>20000 = Default gRPC</span>
          <span>10000/10001/11000 = Common gRPC</span>
          <span className="text-[var(--bb-amber)]">⚠️ Data from OSINT only - no active scanning</span>
        </div>
      </div>
    </div>
  );
}
