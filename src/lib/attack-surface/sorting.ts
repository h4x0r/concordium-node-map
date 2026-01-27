/**
 * Sorting Functions
 *
 * Pure functions for sorting attack surface data, including proper numeric IP comparison.
 */

import { getRiskSortValue } from './risk-assessment';
import type { AttackSurfaceNode, SortOptions, NodeSortStage } from './types';

/**
 * Compare two IP addresses numerically.
 *
 * This fixes the bug where localeCompare would sort "192.168.1.10" before "192.168.1.2"
 * because it compares strings character by character.
 *
 * @param a - First IP address (or null)
 * @param b - Second IP address (or null)
 * @returns Negative if a < b, positive if a > b, 0 if equal
 */
export function compareIpAddresses(a: string | null, b: string | null): number {
  // Handle nulls - nulls sort to the end
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  // Parse IP octets as numbers
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  // Compare octet by octet
  for (let i = 0; i < 4; i++) {
    const octetA = partsA[i] || 0;
    const octetB = partsB[i] || 0;
    if (octetA !== octetB) {
      return octetA - octetB;
    }
  }

  return 0;
}

/**
 * Sort attack surface nodes with various options.
 *
 * @param nodes - Array of nodes to sort
 * @param options - Sorting options
 * @returns Sorted array (new array, does not mutate input)
 */
export function sortAttackSurfaceNodes(
  nodes: AttackSurfaceNode[],
  options: SortOptions
): AttackSurfaceNode[] {
  const { column, direction, nodeSortStage = 1 } = options;
  const dirMultiplier = direction === 'asc' ? 1 : -1;

  return [...nodes].sort((a, b) => {
    // Special handling for node column with 4-stage cycle
    if (column === 'node') {
      return sortByNodeStage(a, b, nodeSortStage);
    }

    let comparison = 0;

    switch (column) {
      case 'risk':
        comparison = getRiskSortValue(a.riskLevel) - getRiskSortValue(b.riskLevel);
        break;

      case 'ip':
        comparison = compareIpAddresses(a.ipAddress, b.ipAddress);
        break;

      case 'port8888':
        // Boolean: true (has port) sorts before false
        comparison = (a.hasPeeringPort ? 1 : 0) - (b.hasPeeringPort ? 1 : 0);
        break;

      case 'port20000':
        // Boolean: true (has port) sorts before false
        comparison = (a.hasGrpcDefault ? 1 : 0) - (b.hasGrpcDefault ? 1 : 0);
        break;

      case 'portGrpcOther':
        // Sort by count of other gRPC ports
        comparison = a.hasGrpcOther.length - b.hasGrpcOther.length;
        break;

      case 'portOther':
        // Sort by count of other exposed ports
        comparison = a.hasOtherPorts.length - b.hasOtherPorts.length;
        break;

      case 'vulns':
        comparison = a.osintVulns.length - b.osintVulns.length;
        break;
    }

    return comparison * dirMultiplier;
  });
}

/**
 * Sort nodes by name with 4-stage cycle.
 *
 * Stage 1: All A-Z
 * Stage 2: All Z-A
 * Stage 3: Validators first (A-Z), then rest (A-Z)
 * Stage 4: Validators first (Z-A), then rest (Z-A)
 */
function sortByNodeStage(a: AttackSurfaceNode, b: AttackSurfaceNode, stage: NodeSortStage): number {
  const validatorsFirst = stage === 3 || stage === 4;
  const descending = stage === 2 || stage === 4;

  // If validators first, sort validators to top
  if (validatorsFirst) {
    if (a.isValidator && !b.isValidator) return -1;
    if (!a.isValidator && b.isValidator) return 1;
  }

  // Then sort alphabetically
  const comparison = a.nodeName.localeCompare(b.nodeName);
  return descending ? -comparison : comparison;
}

/**
 * Get sort indicator for node column based on stage.
 */
export function getNodeSortIndicator(stage: NodeSortStage): string {
  switch (stage) {
    case 1: return '▲';      // A-Z
    case 2: return '▼';      // Z-A
    case 3: return '✓▲';     // Validators first, A-Z
    case 4: return '✓▼';     // Validators first, Z-A
  }
}

/**
 * Get next node sort stage in the cycle.
 */
export function getNextNodeSortStage(current: NodeSortStage): NodeSortStage {
  return ((current % 4) + 1) as NodeSortStage;
}

/**
 * Apply filters to attack surface nodes.
 *
 * @param nodes - Array of nodes to filter
 * @param filterMode - Mode filter (all, validators, withIp, withoutIp)
 * @param riskFilter - Risk level filter
 * @param searchTerm - Search term for node name/ID/IP
 * @returns Filtered array
 */
export function filterAttackSurfaceNodes(
  nodes: AttackSurfaceNode[],
  filterMode: 'all' | 'validators' | 'withIp' | 'withoutIp',
  riskFilter: 'all' | 'low' | 'medium' | 'high' | 'critical' | 'unknown',
  searchTerm: string
): AttackSurfaceNode[] {
  let filtered = nodes;

  // Apply mode filter
  if (filterMode === 'validators') {
    filtered = filtered.filter((n) => n.isValidator);
  } else if (filterMode === 'withIp') {
    filtered = filtered.filter((n) => n.ipAddress !== null);
  } else if (filterMode === 'withoutIp') {
    filtered = filtered.filter((n) => n.ipAddress === null);
  }

  // Apply risk filter
  if (riskFilter !== 'all') {
    filtered = filtered.filter((n) => n.riskLevel === riskFilter);
  }

  // Apply search
  const trimmedSearch = searchTerm.trim();
  if (trimmedSearch) {
    const term = trimmedSearch.toLowerCase();
    filtered = filtered.filter(
      (n) =>
        n.nodeName.toLowerCase().includes(term) ||
        n.nodeId.toLowerCase().includes(term) ||
        n.ipAddress?.toLowerCase().includes(term)
    );
  }

  return filtered;
}
