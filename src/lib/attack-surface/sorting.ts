/**
 * Sorting Functions
 *
 * Pure functions for sorting attack surface data, including proper numeric IP comparison.
 */

import { getRiskSortValue } from './risk-assessment';
import type { AttackSurfaceNode, SortOptions } from './types';

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
  const { column, direction, validatorsFirst = false } = options;
  const dirMultiplier = direction === 'asc' ? 1 : -1;

  return [...nodes].sort((a, b) => {
    // If validatorsFirst is enabled, always sort validators to the top
    if (validatorsFirst) {
      if (a.isValidator && !b.isValidator) return -1;
      if (!a.isValidator && b.isValidator) return 1;
    }

    let comparison = 0;

    switch (column) {
      case 'risk':
        comparison = getRiskSortValue(a.riskLevel) - getRiskSortValue(b.riskLevel);
        break;

      case 'node':
        comparison = a.nodeName.localeCompare(b.nodeName);
        break;

      case 'ip':
        comparison = compareIpAddresses(a.ipAddress, b.ipAddress);
        break;

      case 'vulns':
        comparison = a.osintVulns.length - b.osintVulns.length;
        break;
    }

    return comparison * dirMultiplier;
  });
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
