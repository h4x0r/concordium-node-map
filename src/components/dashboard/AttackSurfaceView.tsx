'use client';

import { useMemo, useState } from 'react';
import { useAttackSurface, PORT_CATEGORIES, type AttackSurfaceNode } from '@/hooks/useAttackSurface';
import { useAppStore } from '@/hooks/useAppStore';

type FilterMode = 'all' | 'validators' | 'withIp' | 'withoutIp';
type RiskFilter = 'all' | 'critical' | 'high' | 'medium' | 'low' | 'unknown';
type SortColumn = 'risk' | 'node' | 'ip' | 'vulns';
type SortDirection = 'asc' | 'desc';

/**
 * Attack Surface view showing nodes, IPs, and open ports discovered via OSINT
 */
// Risk level tooltip explanations
const RISK_TOOLTIPS = {
  all: 'Show all nodes regardless of risk level',
  critical: 'Malicious reputation OR 6+ CVEs on validators',
  high: 'Validators with 1-5 CVEs or suspicious reputation, OR non-validators with 6+ CVEs',
  medium: 'Non-validators with 1-5 CVEs or suspicious reputation, OR nodes with 6+ exposed ports',
  low: 'Clean reputation with few exposed ports',
  unknown: 'No IP address or no OSINT data available',
} as const;

export function AttackSurfaceView() {
  const { nodes, stats, isLoading } = useAttackSurface();
  const { selectNode } = useAppStore();
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn>('risk');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Generate node-specific risk tooltip
  const getRiskTooltip = (node: AttackSurfaceNode): string => {
    const reasons: string[] = [];

    // No IP = unknown
    if (!node.ipAddress) {
      return 'UNKNOWN: No IP address available';
    }

    // Check for malicious reputation
    if (node.osintReputation === 'malicious') {
      reasons.push('Malicious reputation from OSINT');
    }

    // Check for suspicious reputation
    if (node.osintReputation === 'suspicious') {
      reasons.push('Suspicious reputation from OSINT');
    }

    // Check for vulnerabilities
    if (node.osintVulns.length > 0) {
      reasons.push(`${node.osintVulns.length} CVE vulnerabilit${node.osintVulns.length === 1 ? 'y' : 'ies'} detected`);
    }

    // Check for many exposed ports
    if (node.osintPorts.length > 5) {
      reasons.push(`${node.osintPorts.length} ports exposed`);
    }

    // Add validator context
    if (node.isValidator) {
      reasons.push('Validator node (higher risk threshold)');
    }

    // Build final message
    if (reasons.length === 0) {
      return `${node.riskLevel.toUpperCase()}: Clean reputation, few exposed ports`;
    }

    return `${node.riskLevel.toUpperCase()}: ${reasons.join(' • ')}`;
  };

  // Sort handler
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Risk level numeric mapping for sorting
  const riskLevelValue = (level: string): number => {
    switch (level) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      case 'unknown': return 0;
      default: return 0;
    }
  };

  // Filter and sort nodes
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

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (sortColumn) {
        case 'risk':
          comparison = riskLevelValue(a.riskLevel) - riskLevelValue(b.riskLevel);
          break;
        case 'node':
          comparison = a.nodeName.localeCompare(b.nodeName);
          break;
        case 'ip':
          const ipA = a.ipAddress || '';
          const ipB = b.ipAddress || '';
          comparison = ipA.localeCompare(ipB);
          break;
        case 'vulns':
          comparison = a.osintVulns.length - b.osintVulns.length;
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [nodes, filterMode, riskFilter, searchTerm, sortColumn, sortDirection]);

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
              title={RISK_TOOLTIPS[risk]}
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

      {/* Main content area */}
      <div className="flex-1 overflow-auto">
        <table className="bb-table w-full">
          <thead className="sticky top-0 bg-[var(--bb-panel-bg)] z-10">
            <tr>
              <th className="text-left cursor-pointer" onClick={() => handleSort('risk')}>
                RISK {sortColumn === 'risk' && (sortDirection === 'asc' ? '▲' : '▼')}
              </th>
              <th className="text-left cursor-pointer" onClick={() => handleSort('node')}>
                NODE {sortColumn === 'node' && (sortDirection === 'asc' ? '▲' : '▼')}
              </th>
              <th className="text-left cursor-pointer" onClick={() => handleSort('ip')}>
                IP {sortColumn === 'ip' && (sortDirection === 'asc' ? '▲' : '▼')}
              </th>
              <th className="text-center">8888</th>
              <th className="text-center">20000</th>
              <th className="text-center">gRPC</th>
              <th className="text-center">OTHER</th>
              <th className="text-center cursor-pointer" onClick={() => handleSort('vulns')}>
                CVE {sortColumn === 'vulns' && (sortDirection === 'asc' ? '▲' : '▼')}
              </th>
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
                    onClick={() => selectNode(node.nodeId)}
                    className="cursor-pointer hover:bg-[var(--bb-panel-bg)]"
                  >
                    <td style={{ color: riskColor }} title={getRiskTooltip(node)}>
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
                        <span className="text-[var(--bb-text)]">{node.ipAddress}</span>
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
