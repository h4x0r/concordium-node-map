/**
 * Risk Assessment Functions
 *
 * Pure functions for assessing node risk levels based on OSINT data.
 */

import { RISK_THRESHOLDS, RISK_LEVELS } from './config';
import type { RiskLevel, RiskInput, RiskResult } from './types';

/**
 * Assess risk level based on exposed ports and vulnerabilities.
 *
 * Risk Criteria:
 * - Critical: Malicious reputation OR >HIGH_VULN_COUNT CVEs on validators
 * - High: Validators with 1-HIGH_VULN_COUNT CVEs or suspicious reputation,
 *         OR non-validators with >HIGH_VULN_COUNT CVEs
 * - Medium: Non-validators with 1-HIGH_VULN_COUNT CVEs or suspicious reputation,
 *           OR nodes with >HIGH_PORT_COUNT exposed ports
 * - Low: Clean reputation with few exposed ports
 * - Unknown: No IP address or no OSINT data
 *
 * @param input - Risk assessment input data
 * @returns Risk result with level and reasoning
 */
export function assessRisk(input: RiskInput): RiskResult {
  const { osintPorts, osintVulns, osintReputation, isValidator, ipAddress } = input;
  const reasons: string[] = [];

  // No IP = unknown risk
  if (!ipAddress || osintPorts.length === 0) {
    return {
      level: 'unknown',
      reasons: ipAddress ? ['No OSINT data available'] : ['No IP address available'],
    };
  }

  // Track risk factors
  const isMalicious = osintReputation === 'malicious';
  const isSuspicious = osintReputation === 'suspicious';
  const hasHighVulns = osintVulns.length > RISK_THRESHOLDS.HIGH_VULN_COUNT;
  const hasVulns = osintVulns.length > 0;
  const hasHighPorts = osintPorts.length > RISK_THRESHOLDS.HIGH_PORT_COUNT;

  // Build reasons list
  if (isMalicious) {
    reasons.push('Malicious reputation from OSINT');
  }
  if (isSuspicious) {
    reasons.push('Suspicious reputation from OSINT');
  }
  if (hasVulns) {
    const vulnWord = osintVulns.length === 1 ? 'vulnerability' : 'vulnerabilities';
    reasons.push(`${osintVulns.length} CVE ${vulnWord} detected`);
  }
  if (hasHighPorts) {
    reasons.push(`${osintPorts.length} ports exposed`);
  }
  if (isValidator) {
    reasons.push('Validator node (higher risk threshold)');
  }

  // Determine risk level based on criteria
  let level: RiskLevel;

  if (isMalicious) {
    // Malicious reputation = critical
    level = 'critical';
  } else if (hasHighVulns) {
    // Many vulns = critical for validators, high for others
    level = isValidator ? 'critical' : 'high';
  } else if (isSuspicious || hasVulns) {
    // Suspicious reputation or some vulns = high for validators, medium for others
    level = isValidator ? 'high' : 'medium';
  } else if (hasHighPorts) {
    // Many exposed ports = medium risk
    level = 'medium';
  } else {
    // Clean with few ports = low risk
    level = 'low';
  }

  // Default reason for low risk
  if (reasons.length === 0) {
    reasons.push('Clean reputation, few exposed ports');
  }

  return { level, reasons };
}

/**
 * Format risk result as a human-readable tooltip.
 *
 * @param result - Risk assessment result
 * @returns Formatted tooltip string
 */
export function formatRiskTooltip(result: RiskResult): string {
  const label = result.level.toUpperCase();
  return `${label}: ${result.reasons.join(' • ')}`;
}

/**
 * Get numeric value for a risk level for sorting purposes.
 *
 * @param level - Risk level
 * @returns Numeric sort value (higher = more severe)
 */
export function getRiskSortValue(level: RiskLevel): number {
  return RISK_LEVELS[level].value;
}
