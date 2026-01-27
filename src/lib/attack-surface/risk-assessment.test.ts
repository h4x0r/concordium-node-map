/**
 * Risk Assessment Tests
 */

import { describe, it, expect } from 'vitest';
import { assessRisk, formatRiskTooltip, getRiskSortValue } from './risk-assessment';
import { RISK_THRESHOLDS } from './config';

describe('assessRisk', () => {
  const baseInput = {
    osintPorts: [8888, 20000],
    osintVulns: [],
    osintReputation: 'clean' as const,
    isValidator: false,
    ipAddress: '192.168.1.1',
  };

  describe('unknown risk', () => {
    it('returns unknown when no IP address', () => {
      const result = assessRisk({ ...baseInput, ipAddress: null });
      expect(result.level).toBe('unknown');
      expect(result.reasons).toContain('No IP address available');
    });

    it('returns unknown when no OSINT data (empty ports)', () => {
      const result = assessRisk({ ...baseInput, osintPorts: [] });
      expect(result.level).toBe('unknown');
      expect(result.reasons).toContain('No OSINT data available');
    });
  });

  describe('critical risk', () => {
    it('returns critical for malicious reputation', () => {
      const result = assessRisk({
        ...baseInput,
        osintReputation: 'malicious',
      });
      expect(result.level).toBe('critical');
      expect(result.reasons).toContain('Malicious reputation from OSINT');
    });

    it('returns critical for validators with many CVEs', () => {
      const vulns = Array(RISK_THRESHOLDS.HIGH_VULN_COUNT + 1).fill('CVE-2024-1234');
      const result = assessRisk({
        ...baseInput,
        osintVulns: vulns,
        isValidator: true,
      });
      expect(result.level).toBe('critical');
    });
  });

  describe('high risk', () => {
    it('returns high for non-validators with many CVEs', () => {
      const vulns = Array(RISK_THRESHOLDS.HIGH_VULN_COUNT + 1).fill('CVE-2024-1234');
      const result = assessRisk({
        ...baseInput,
        osintVulns: vulns,
        isValidator: false,
      });
      expect(result.level).toBe('high');
    });

    it('returns high for validators with suspicious reputation', () => {
      const result = assessRisk({
        ...baseInput,
        osintReputation: 'suspicious',
        isValidator: true,
      });
      expect(result.level).toBe('high');
    });

    it('returns high for validators with some CVEs', () => {
      const result = assessRisk({
        ...baseInput,
        osintVulns: ['CVE-2024-1234'],
        isValidator: true,
      });
      expect(result.level).toBe('high');
    });
  });

  describe('medium risk', () => {
    it('returns medium for non-validators with suspicious reputation', () => {
      const result = assessRisk({
        ...baseInput,
        osintReputation: 'suspicious',
        isValidator: false,
      });
      expect(result.level).toBe('medium');
    });

    it('returns medium for non-validators with some CVEs', () => {
      const result = assessRisk({
        ...baseInput,
        osintVulns: ['CVE-2024-1234'],
        isValidator: false,
      });
      expect(result.level).toBe('medium');
    });

    it('returns medium for nodes with many exposed ports', () => {
      const ports = Array(RISK_THRESHOLDS.HIGH_PORT_COUNT + 1).fill(0).map((_, i) => 8000 + i);
      const result = assessRisk({
        ...baseInput,
        osintPorts: ports,
      });
      expect(result.level).toBe('medium');
    });
  });

  describe('low risk', () => {
    it('returns low for clean nodes with few ports', () => {
      const result = assessRisk(baseInput);
      expect(result.level).toBe('low');
    });

    it('includes "Clean reputation, few exposed ports" in reasons', () => {
      const result = assessRisk(baseInput);
      expect(result.reasons).toContain('Clean reputation, few exposed ports');
    });
  });

  describe('validator escalation', () => {
    it('escalates risk one level for validators', () => {
      // Non-validator with CVE = medium
      const nonValidator = assessRisk({
        ...baseInput,
        osintVulns: ['CVE-2024-1234'],
        isValidator: false,
      });
      expect(nonValidator.level).toBe('medium');

      // Validator with CVE = high
      const validator = assessRisk({
        ...baseInput,
        osintVulns: ['CVE-2024-1234'],
        isValidator: true,
      });
      expect(validator.level).toBe('high');
    });
  });

  describe('reasons accumulation', () => {
    it('accumulates multiple risk reasons', () => {
      const vulns = Array(RISK_THRESHOLDS.HIGH_VULN_COUNT + 1).fill('CVE-2024-1234');
      const ports = Array(RISK_THRESHOLDS.HIGH_PORT_COUNT + 1).fill(0).map((_, i) => 8000 + i);

      const result = assessRisk({
        ...baseInput,
        osintVulns: vulns,
        osintPorts: ports,
        osintReputation: 'suspicious',
        isValidator: true,
      });

      expect(result.reasons).toContain('Suspicious reputation from OSINT');
      expect(result.reasons.some(r => r.includes('CVE'))).toBe(true);
      expect(result.reasons.some(r => r.includes('ports exposed'))).toBe(true);
      expect(result.reasons).toContain('Validator node (higher risk threshold)');
    });
  });
});

describe('formatRiskTooltip', () => {
  it('formats single reason', () => {
    const tooltip = formatRiskTooltip({
      level: 'low',
      reasons: ['Clean reputation, few exposed ports'],
    });
    expect(tooltip).toBe('LOW: Clean reputation, few exposed ports');
  });

  it('joins multiple reasons with bullet', () => {
    const tooltip = formatRiskTooltip({
      level: 'high',
      reasons: ['3 CVE vulnerabilities detected', 'Validator node (higher risk threshold)'],
    });
    expect(tooltip).toBe('HIGH: 3 CVE vulnerabilities detected • Validator node (higher risk threshold)');
  });

  it('uppercases level', () => {
    const tooltip = formatRiskTooltip({
      level: 'critical',
      reasons: ['Malicious reputation from OSINT'],
    });
    expect(tooltip).toMatch(/^CRITICAL:/);
  });
});

describe('getRiskSortValue', () => {
  it('returns higher values for more severe risks', () => {
    expect(getRiskSortValue('critical')).toBeGreaterThan(getRiskSortValue('high'));
    expect(getRiskSortValue('high')).toBeGreaterThan(getRiskSortValue('medium'));
    expect(getRiskSortValue('medium')).toBeGreaterThan(getRiskSortValue('low'));
    expect(getRiskSortValue('low')).toBeGreaterThan(getRiskSortValue('unknown'));
  });

  it('returns 0 for unknown', () => {
    expect(getRiskSortValue('unknown')).toBe(0);
  });

  it('returns 4 for critical', () => {
    expect(getRiskSortValue('critical')).toBe(4);
  });
});
