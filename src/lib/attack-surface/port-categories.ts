/**
 * Port Categorization Functions
 *
 * Pure functions for categorizing ports by type for attack surface analysis.
 */

import { PORT_CATEGORIES, getKnownPorts, getOtherGrpcPorts } from './config';
import type { PortCategorization } from './types';

/**
 * Categorize ports into Concordium-specific groups.
 *
 * @param osintPorts - Array of discovered port numbers
 * @returns Port categorization result
 */
export function categorizePorts(osintPorts: number[]): PortCategorization {
  const knownPorts = new Set(getKnownPorts());
  const otherGrpcPorts = getOtherGrpcPorts();

  return {
    hasPeering: osintPorts.includes(PORT_CATEGORIES.PEERING.port),
    hasGrpcDefault: osintPorts.includes(PORT_CATEGORIES.GRPC_DEFAULT.port),
    grpcOther: otherGrpcPorts.filter((p) => osintPorts.includes(p)),
    otherPorts: osintPorts.filter((p) => !knownPorts.has(p)),
  };
}

/**
 * Legend item for port display
 */
export interface PortLegendItem {
  label: string;
  description: string;
}

/**
 * Get the port legend for UI display.
 * Single source of truth for port descriptions shown in the footer.
 *
 * @returns Array of legend items
 */
export function getPortLegend(): PortLegendItem[] {
  const altGrpcPorts = PORT_CATEGORIES.GRPC_OTHER.map((p) => p.port).join('/');

  return [
    { label: '8888', description: 'Peering' },
    { label: '20000', description: 'Default gRPC' },
    { label: 'Other gRPC', description: `${altGrpcPorts} (alt Concordium gRPC)` },
    { label: 'OTHER', description: 'Non-Concordium exposed ports' },
  ];
}

/**
 * Check if a port is a known Concordium port.
 *
 * @param port - Port number to check
 * @returns True if port is a known Concordium-related port
 */
export function isKnownPort(port: number): boolean {
  return getKnownPorts().includes(port);
}

/**
 * Get the category of a specific port.
 *
 * @param port - Port number
 * @returns Category string or 'other' if not categorized
 */
export function getPortCategory(port: number): 'peering' | 'grpc-default' | 'grpc-other' | 'other' {
  if (port === PORT_CATEGORIES.PEERING.port) {
    return 'peering';
  }
  if (port === PORT_CATEGORIES.GRPC_DEFAULT.port) {
    return 'grpc-default';
  }
  if (getOtherGrpcPorts().includes(port)) {
    return 'grpc-other';
  }
  return 'other';
}
