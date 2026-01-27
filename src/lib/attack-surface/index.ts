/**
 * Attack Surface Module
 *
 * Pure functions and configuration for attack surface analysis.
 */

// Config exports
export {
  RISK_THRESHOLDS,
  RISK_LEVELS,
  PORT_CATEGORIES,
  RISK_FILTER_TOOLTIPS,
  getKnownPorts,
  getOtherGrpcPorts,
} from './config';

// Type exports
export type {
  RiskLevel,
  OsintReputation,
  RiskInput,
  RiskResult,
  PortCategorization,
  AttackSurfaceNode,
  SortOptions,
  SortColumn,
  SortDirection,
  FilterMode,
  RiskFilter,
  AttackSurfaceStats,
} from './types';

// Risk assessment exports
export {
  assessRisk,
  formatRiskTooltip,
  getRiskSortValue,
} from './risk-assessment';

// Port categorization exports
export {
  categorizePorts,
  getPortLegend,
} from './port-categories';

// Sorting exports
export {
  compareIpAddresses,
  sortAttackSurfaceNodes,
  filterAttackSurfaceNodes,
} from './sorting';
