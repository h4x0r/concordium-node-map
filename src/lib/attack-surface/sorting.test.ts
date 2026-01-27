/**
 * Sorting Tests
 */

import { describe, it, expect } from 'vitest';
import { compareIpAddresses, sortAttackSurfaceNodes, filterAttackSurfaceNodes } from './sorting';
import type { AttackSurfaceNode } from './types';

describe('compareIpAddresses', () => {
  it('correctly compares IPs with different first octets', () => {
    expect(compareIpAddresses('10.0.0.1', '192.168.1.1')).toBeLessThan(0);
    expect(compareIpAddresses('192.168.1.1', '10.0.0.1')).toBeGreaterThan(0);
  });

  it('correctly compares IPs with different last octets', () => {
    expect(compareIpAddresses('192.168.1.2', '192.168.1.10')).toBeLessThan(0);
    expect(compareIpAddresses('192.168.1.10', '192.168.1.2')).toBeGreaterThan(0);
  });

  it('fixes the localeCompare bug where 1.10 sorted before 1.2', () => {
    // This is the key bug fix - localeCompare would incorrectly sort these
    expect(compareIpAddresses('192.168.1.10', '192.168.1.2')).toBeGreaterThan(0);
    expect(compareIpAddresses('192.168.1.2', '192.168.1.10')).toBeLessThan(0);
  });

  it('returns 0 for equal IPs', () => {
    expect(compareIpAddresses('192.168.1.1', '192.168.1.1')).toBe(0);
  });

  it('handles null values (nulls sort to end)', () => {
    expect(compareIpAddresses(null, '192.168.1.1')).toBeGreaterThan(0);
    expect(compareIpAddresses('192.168.1.1', null)).toBeLessThan(0);
    expect(compareIpAddresses(null, null)).toBe(0);
  });

  it('handles edge cases with 0 octets', () => {
    expect(compareIpAddresses('0.0.0.0', '0.0.0.1')).toBeLessThan(0);
    expect(compareIpAddresses('10.0.0.0', '10.0.0.1')).toBeLessThan(0);
  });

  it('compares middle octets correctly', () => {
    expect(compareIpAddresses('192.168.1.1', '192.168.2.1')).toBeLessThan(0);
    expect(compareIpAddresses('192.168.10.1', '192.168.2.1')).toBeGreaterThan(0);
  });
});

describe('sortAttackSurfaceNodes', () => {
  const createNode = (overrides: Partial<AttackSurfaceNode>): AttackSurfaceNode => ({
    nodeId: 'node1',
    nodeName: 'Test Node',
    isValidator: false,
    ipAddress: '192.168.1.1',
    port: 8888,
    osintPorts: [],
    osintVulns: [],
    osintTags: [],
    osintReputation: 'clean',
    osintLastScan: null,
    hasPeeringPort: false,
    hasGrpcDefault: false,
    hasGrpcOther: [],
    hasOtherPorts: [],
    riskLevel: 'low',
    ...overrides,
  });

  describe('risk sorting', () => {
    it('sorts by risk level descending', () => {
      const nodes = [
        createNode({ nodeId: '1', riskLevel: 'low' }),
        createNode({ nodeId: '2', riskLevel: 'critical' }),
        createNode({ nodeId: '3', riskLevel: 'medium' }),
      ];

      const sorted = sortAttackSurfaceNodes(nodes, {
        column: 'risk',
        direction: 'desc',
      });

      expect(sorted[0].riskLevel).toBe('critical');
      expect(sorted[1].riskLevel).toBe('medium');
      expect(sorted[2].riskLevel).toBe('low');
    });

    it('sorts by risk level ascending', () => {
      const nodes = [
        createNode({ nodeId: '1', riskLevel: 'critical' }),
        createNode({ nodeId: '2', riskLevel: 'low' }),
        createNode({ nodeId: '3', riskLevel: 'high' }),
      ];

      const sorted = sortAttackSurfaceNodes(nodes, {
        column: 'risk',
        direction: 'asc',
      });

      expect(sorted[0].riskLevel).toBe('low');
      expect(sorted[2].riskLevel).toBe('critical');
    });
  });

  describe('IP sorting', () => {
    it('sorts IP addresses numerically, not lexicographically', () => {
      const nodes = [
        createNode({ nodeId: '1', ipAddress: '192.168.1.10' }),
        createNode({ nodeId: '2', ipAddress: '192.168.1.2' }),
        createNode({ nodeId: '3', ipAddress: '192.168.1.1' }),
      ];

      const sorted = sortAttackSurfaceNodes(nodes, {
        column: 'ip',
        direction: 'asc',
      });

      expect(sorted[0].ipAddress).toBe('192.168.1.1');
      expect(sorted[1].ipAddress).toBe('192.168.1.2');
      expect(sorted[2].ipAddress).toBe('192.168.1.10');
    });

    it('puts null IPs at the end when ascending', () => {
      const nodes = [
        createNode({ nodeId: '1', ipAddress: null }),
        createNode({ nodeId: '2', ipAddress: '192.168.1.2' }),
        createNode({ nodeId: '3', ipAddress: '192.168.1.1' }),
      ];

      const sorted = sortAttackSurfaceNodes(nodes, {
        column: 'ip',
        direction: 'asc',
      });

      expect(sorted[0].ipAddress).toBe('192.168.1.1');
      expect(sorted[1].ipAddress).toBe('192.168.1.2');
      expect(sorted[2].ipAddress).toBe(null);
    });
  });

  describe('node name sorting', () => {
    it('sorts by node name alphabetically', () => {
      const nodes = [
        createNode({ nodeId: '1', nodeName: 'Charlie' }),
        createNode({ nodeId: '2', nodeName: 'Alpha' }),
        createNode({ nodeId: '3', nodeName: 'Beta' }),
      ];

      const sorted = sortAttackSurfaceNodes(nodes, {
        column: 'node',
        direction: 'asc',
      });

      expect(sorted[0].nodeName).toBe('Alpha');
      expect(sorted[1].nodeName).toBe('Beta');
      expect(sorted[2].nodeName).toBe('Charlie');
    });
  });

  describe('vulnerability sorting', () => {
    it('sorts by CVE count', () => {
      const nodes = [
        createNode({ nodeId: '1', osintVulns: ['CVE-1', 'CVE-2'] }),
        createNode({ nodeId: '2', osintVulns: [] }),
        createNode({ nodeId: '3', osintVulns: ['CVE-1'] }),
      ];

      const sorted = sortAttackSurfaceNodes(nodes, {
        column: 'vulns',
        direction: 'desc',
      });

      expect(sorted[0].osintVulns.length).toBe(2);
      expect(sorted[1].osintVulns.length).toBe(1);
      expect(sorted[2].osintVulns.length).toBe(0);
    });
  });

  describe('validatorsFirst option', () => {
    it('puts validators first when enabled', () => {
      const nodes = [
        createNode({ nodeId: '1', nodeName: 'Alpha', isValidator: false }),
        createNode({ nodeId: '2', nodeName: 'Beta', isValidator: true }),
        createNode({ nodeId: '3', nodeName: 'Charlie', isValidator: false }),
        createNode({ nodeId: '4', nodeName: 'Delta', isValidator: true }),
      ];

      const sorted = sortAttackSurfaceNodes(nodes, {
        column: 'node',
        direction: 'asc',
        validatorsFirst: true,
      });

      // Validators first, then sorted by name
      expect(sorted[0].nodeName).toBe('Beta');
      expect(sorted[1].nodeName).toBe('Delta');
      expect(sorted[2].nodeName).toBe('Alpha');
      expect(sorted[3].nodeName).toBe('Charlie');
    });

    it('maintains normal sorting when validatorsFirst is false', () => {
      const nodes = [
        createNode({ nodeId: '1', nodeName: 'Alpha', isValidator: false }),
        createNode({ nodeId: '2', nodeName: 'Beta', isValidator: true }),
      ];

      const sorted = sortAttackSurfaceNodes(nodes, {
        column: 'node',
        direction: 'asc',
        validatorsFirst: false,
      });

      expect(sorted[0].nodeName).toBe('Alpha');
      expect(sorted[1].nodeName).toBe('Beta');
    });
  });

  it('does not mutate original array', () => {
    const nodes = [
      createNode({ nodeId: '1', nodeName: 'B' }),
      createNode({ nodeId: '2', nodeName: 'A' }),
    ];
    const originalFirstId = nodes[0].nodeId;

    sortAttackSurfaceNodes(nodes, {
      column: 'node',
      direction: 'asc',
    });

    expect(nodes[0].nodeId).toBe(originalFirstId);
  });
});

describe('filterAttackSurfaceNodes', () => {
  const createNode = (overrides: Partial<AttackSurfaceNode>): AttackSurfaceNode => ({
    nodeId: 'node1',
    nodeName: 'Test Node',
    isValidator: false,
    ipAddress: '192.168.1.1',
    port: 8888,
    osintPorts: [],
    osintVulns: [],
    osintTags: [],
    osintReputation: 'clean',
    osintLastScan: null,
    hasPeeringPort: false,
    hasGrpcDefault: false,
    hasGrpcOther: [],
    hasOtherPorts: [],
    riskLevel: 'low',
    ...overrides,
  });

  const nodes = [
    createNode({ nodeId: '1', isValidator: true, ipAddress: '10.0.0.1', riskLevel: 'high' }),
    createNode({ nodeId: '2', isValidator: false, ipAddress: '10.0.0.2', riskLevel: 'low' }),
    createNode({ nodeId: '3', isValidator: true, ipAddress: null, riskLevel: 'unknown' }),
    createNode({ nodeId: '4', isValidator: false, ipAddress: null, riskLevel: 'unknown' }),
  ];

  describe('filterMode', () => {
    it('returns all nodes with filterMode=all', () => {
      const result = filterAttackSurfaceNodes(nodes, 'all', 'all', '');
      expect(result.length).toBe(4);
    });

    it('filters to validators only', () => {
      const result = filterAttackSurfaceNodes(nodes, 'validators', 'all', '');
      expect(result.length).toBe(2);
      expect(result.every((n) => n.isValidator)).toBe(true);
    });

    it('filters to nodes with IP', () => {
      const result = filterAttackSurfaceNodes(nodes, 'withIp', 'all', '');
      expect(result.length).toBe(2);
      expect(result.every((n) => n.ipAddress !== null)).toBe(true);
    });

    it('filters to nodes without IP', () => {
      const result = filterAttackSurfaceNodes(nodes, 'withoutIp', 'all', '');
      expect(result.length).toBe(2);
      expect(result.every((n) => n.ipAddress === null)).toBe(true);
    });
  });

  describe('riskFilter', () => {
    it('filters by specific risk level', () => {
      const result = filterAttackSurfaceNodes(nodes, 'all', 'high', '');
      expect(result.length).toBe(1);
      expect(result[0].riskLevel).toBe('high');
    });

    it('returns all risks with riskFilter=all', () => {
      const result = filterAttackSurfaceNodes(nodes, 'all', 'all', '');
      expect(result.length).toBe(4);
    });
  });

  describe('searchTerm', () => {
    it('filters by node ID', () => {
      const nodesWithNames = [
        createNode({ nodeId: 'abc123', nodeName: 'Node A' }),
        createNode({ nodeId: 'def456', nodeName: 'Node B' }),
      ];

      const result = filterAttackSurfaceNodes(nodesWithNames, 'all', 'all', 'abc');
      expect(result.length).toBe(1);
      expect(result[0].nodeId).toBe('abc123');
    });

    it('filters by node name', () => {
      const nodesWithNames = [
        createNode({ nodeId: '1', nodeName: 'Alpha Node' }),
        createNode({ nodeId: '2', nodeName: 'Beta Node' }),
      ];

      const result = filterAttackSurfaceNodes(nodesWithNames, 'all', 'all', 'alpha');
      expect(result.length).toBe(1);
      expect(result[0].nodeName).toBe('Alpha Node');
    });

    it('filters by IP address', () => {
      const result = filterAttackSurfaceNodes(nodes, 'all', 'all', '10.0.0.1');
      expect(result.length).toBe(1);
      expect(result[0].ipAddress).toBe('10.0.0.1');
    });

    it('is case-insensitive', () => {
      const nodesWithNames = [createNode({ nodeId: '1', nodeName: 'ALPHA' })];
      const result = filterAttackSurfaceNodes(nodesWithNames, 'all', 'all', 'alpha');
      expect(result.length).toBe(1);
    });

    it('trims whitespace', () => {
      const nodesWithNames = [createNode({ nodeId: '1', nodeName: 'Alpha' })];
      const result = filterAttackSurfaceNodes(nodesWithNames, 'all', 'all', '  alpha  ');
      expect(result.length).toBe(1);
    });
  });

  describe('combined filters', () => {
    it('applies all filters together', () => {
      const result = filterAttackSurfaceNodes(nodes, 'validators', 'high', '10.0');
      expect(result.length).toBe(1);
      expect(result[0].isValidator).toBe(true);
      expect(result[0].riskLevel).toBe('high');
      expect(result[0].ipAddress).toContain('10.0');
    });
  });
});
