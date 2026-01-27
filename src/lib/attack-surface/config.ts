/**
 * Attack Surface Configuration
 *
 * Centralized constants and thresholds for attack surface analysis.
 * Single source of truth for port definitions, risk thresholds, and display settings.
 */

/**
 * Thresholds for risk assessment
 */
export const RISK_THRESHOLDS = {
  /** Number of CVEs that triggers elevated risk */
  HIGH_VULN_COUNT: 5,
  /** Number of exposed ports that triggers medium risk */
  HIGH_PORT_COUNT: 5,
} as const;

/**
 * Risk level definitions with visual properties
 */
export const RISK_LEVELS = {
  critical: {
    value: 4,
    color: 'var(--bb-red)',
    emoji: '🔴',
    label: 'CRITICAL',
  },
  high: {
    value: 3,
    color: 'var(--bb-amber)',
    emoji: '🟠',
    label: 'HIGH',
  },
  medium: {
    value: 2,
    color: 'var(--bb-amber)',
    emoji: '🟡',
    label: 'MEDIUM',
  },
  low: {
    value: 1,
    color: 'var(--bb-green)',
    emoji: '🟢',
    label: 'LOW',
  },
  unknown: {
    value: 0,
    color: 'var(--bb-gray)',
    emoji: '⚪',
    label: 'UNKNOWN',
  },
} as const;

/**
 * Concordium port categories for attack surface analysis
 */
export const PORT_CATEGORIES = {
  /** P2P peering port */
  PEERING: {
    port: 8888,
    description: 'Peering',
    category: 'concordium',
  },
  /** Default gRPC port */
  GRPC_DEFAULT: {
    port: 20000,
    description: 'Default gRPC',
    category: 'concordium',
  },
  /** Alternative Concordium gRPC ports (some operators use these instead of 20000) */
  GRPC_OTHER: [
    { port: 10000, description: 'Alt gRPC' },
    { port: 10001, description: 'Alt gRPC' },
    { port: 11000, description: 'Alt gRPC' },
  ],
} as const;

/**
 * Risk filter tooltip explanations
 */
export const RISK_FILTER_TOOLTIPS = {
  all: 'Show all nodes regardless of risk level',
  critical: `Malicious reputation OR ${RISK_THRESHOLDS.HIGH_VULN_COUNT + 1}+ CVEs on validators`,
  high: `Validators with 1-${RISK_THRESHOLDS.HIGH_VULN_COUNT} CVEs or suspicious reputation, OR non-validators with ${RISK_THRESHOLDS.HIGH_VULN_COUNT + 1}+ CVEs`,
  medium: `Non-validators with 1-${RISK_THRESHOLDS.HIGH_VULN_COUNT} CVEs or suspicious reputation, OR nodes with ${RISK_THRESHOLDS.HIGH_PORT_COUNT + 1}+ exposed ports`,
  low: 'Clean reputation with few exposed ports',
  unknown: 'No IP address or no OSINT data available',
} as const;

/**
 * Get flat array of all known port numbers
 */
export function getKnownPorts(): number[] {
  return [
    PORT_CATEGORIES.PEERING.port,
    PORT_CATEGORIES.GRPC_DEFAULT.port,
    ...PORT_CATEGORIES.GRPC_OTHER.map((p) => p.port),
  ];
}

/**
 * Get flat array of all other gRPC port numbers
 */
export function getOtherGrpcPorts(): number[] {
  return PORT_CATEGORIES.GRPC_OTHER.map((p) => p.port);
}
