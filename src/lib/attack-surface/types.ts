/**
 * Attack Surface Type Definitions
 */

/**
 * Risk level values
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical' | 'unknown';

/**
 * OSINT reputation values
 */
export type OsintReputation = 'clean' | 'suspicious' | 'malicious' | 'unknown';

/**
 * Input for risk assessment
 */
export interface RiskInput {
  osintPorts: number[];
  osintVulns: string[];
  osintReputation: OsintReputation | string;
  isValidator: boolean;
  ipAddress: string | null;
}

/**
 * Result of risk assessment with reasoning
 */
export interface RiskResult {
  level: RiskLevel;
  reasons: string[];
}

/**
 * Port categorization for a node
 */
export interface PortCategorization {
  hasPeering: boolean;
  hasGrpcDefault: boolean;
  grpcOther: number[];
  otherPorts: number[];
}

/**
 * Attack surface node data
 */
export interface AttackSurfaceNode {
  nodeId: string;
  nodeName: string;
  isValidator: boolean;
  ipAddress: string | null;
  port: number | null;

  // OSINT data
  osintPorts: number[];
  osintVulns: string[];
  osintTags: string[];
  osintReputation: OsintReputation;
  osintLastScan: string | null;

  // Port categorization
  hasPeeringPort: boolean;
  hasGrpcDefault: boolean;
  hasGrpcOther: number[];
  hasOtherPorts: number[];

  // Risk assessment
  riskLevel: RiskLevel;
}

/**
 * Sorting options for attack surface data
 */
export interface SortOptions {
  column: SortColumn;
  direction: SortDirection;
  /** For node column only: which stage of the 4-stage cycle */
  nodeSortStage?: NodeSortStage;
}

export type SortColumn = 'risk' | 'node' | 'ip' | 'port8888' | 'port20000' | 'portGrpcOther' | 'portOther' | 'vulns';
export type SortDirection = 'asc' | 'desc';

/**
 * Node column sort stage (4-stage cycle)
 * 1: All A-Z
 * 2: All Z-A
 * 3: Validators first (A-Z), then rest (A-Z)
 * 4: Validators first (Z-A), then rest (Z-A)
 */
export type NodeSortStage = 1 | 2 | 3 | 4;

/**
 * Filter mode for node display
 */
export type FilterMode = 'all' | 'validators' | 'withIp' | 'withoutIp';

/**
 * Risk filter type
 */
export type RiskFilter = 'all' | RiskLevel;

/**
 * Attack surface statistics
 */
export interface AttackSurfaceStats {
  total: number;
  withIp: number;
  withoutIp: number;
  validators: number;
  validatorsWithIp: number;
  riskLevels: Record<RiskLevel, number>;
  portExposure: {
    peering: number;
    grpcDefault: number;
    grpcOther: number;
  };
}
