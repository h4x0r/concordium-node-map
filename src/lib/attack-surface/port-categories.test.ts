/**
 * Port Categorization Tests
 */

import { describe, it, expect } from 'vitest';
import { categorizePorts, getPortLegend, isKnownPort, getPortCategory } from './port-categories';

describe('categorizePorts', () => {
  it('detects peering port 8888', () => {
    const result = categorizePorts([8888]);
    expect(result.hasPeering).toBe(true);
    expect(result.hasGrpcDefault).toBe(false);
  });

  it('detects default gRPC port 20000', () => {
    const result = categorizePorts([20000]);
    expect(result.hasPeering).toBe(false);
    expect(result.hasGrpcDefault).toBe(true);
  });

  it('detects Concordium alternative gRPC ports', () => {
    const result = categorizePorts([10000, 10001, 11000]);
    expect(result.grpcOther).toEqual([10000, 10001, 11000]);
  });

  it('categorizes non-Concordium ports as other', () => {
    // Generic gRPC ports (50051, 8080, 9000, etc.) are NOT Concordium-specific
    // They should be categorized as "other" (unknown exposed ports)
    const result = categorizePorts([50051, 8080, 8443, 9000]);
    expect(result.grpcOther).toEqual([]);
    expect(result.otherPorts).toEqual([50051, 8080, 8443, 9000]);
  });

  it('categorizes common service ports as other', () => {
    const result = categorizePorts([22, 80, 443, 3306]);
    expect(result.otherPorts).toEqual([22, 80, 443, 3306]);
    expect(result.hasPeering).toBe(false);
    expect(result.hasGrpcDefault).toBe(false);
    expect(result.grpcOther).toEqual([]);
  });

  it('handles mixed port list correctly', () => {
    const result = categorizePorts([8888, 20000, 10000, 22, 443]);
    expect(result.hasPeering).toBe(true);
    expect(result.hasGrpcDefault).toBe(true);
    expect(result.grpcOther).toEqual([10000]);
    expect(result.otherPorts).toEqual([22, 443]);
  });

  it('handles empty port list', () => {
    const result = categorizePorts([]);
    expect(result.hasPeering).toBe(false);
    expect(result.hasGrpcDefault).toBe(false);
    expect(result.grpcOther).toEqual([]);
    expect(result.otherPorts).toEqual([]);
  });
});

describe('getPortLegend', () => {
  it('returns legend with 8888 peering', () => {
    const legend = getPortLegend();
    const peering = legend.find((l) => l.label === '8888');
    expect(peering).toBeDefined();
    expect(peering?.description).toBe('Peering');
  });

  it('returns legend with 20000 gRPC', () => {
    const legend = getPortLegend();
    const grpc = legend.find((l) => l.label === '20000');
    expect(grpc).toBeDefined();
    expect(grpc?.description).toBe('Default gRPC');
  });

  it('returns legend with Other gRPC description (Concordium-only)', () => {
    const legend = getPortLegend();
    const otherGrpc = legend.find((l) => l.label === 'Other gRPC');
    expect(otherGrpc).toBeDefined();
    expect(otherGrpc?.description).toContain('10000/10001/11000');
    expect(otherGrpc?.description).toContain('alt Concordium gRPC');
  });

  it('returns legend with OTHER description', () => {
    const legend = getPortLegend();
    const other = legend.find((l) => l.label === 'OTHER');
    expect(other).toBeDefined();
    expect(other?.description).toContain('Non-Concordium');
  });
});

describe('isKnownPort', () => {
  it('returns true for peering port', () => {
    expect(isKnownPort(8888)).toBe(true);
  });

  it('returns true for default gRPC port', () => {
    expect(isKnownPort(20000)).toBe(true);
  });

  it('returns true for Concordium alternative gRPC ports', () => {
    expect(isKnownPort(10000)).toBe(true);
    expect(isKnownPort(10001)).toBe(true);
    expect(isKnownPort(11000)).toBe(true);
  });

  it('returns false for non-Concordium gRPC ports', () => {
    // Generic gRPC ports are NOT considered "known" Concordium ports
    expect(isKnownPort(50051)).toBe(false);
    expect(isKnownPort(8080)).toBe(false);
    expect(isKnownPort(9000)).toBe(false);
  });

  it('returns false for unknown ports', () => {
    expect(isKnownPort(22)).toBe(false);
    expect(isKnownPort(80)).toBe(false);
    expect(isKnownPort(443)).toBe(false);
  });
});

describe('getPortCategory', () => {
  it('returns peering for 8888', () => {
    expect(getPortCategory(8888)).toBe('peering');
  });

  it('returns grpc-default for 20000', () => {
    expect(getPortCategory(20000)).toBe('grpc-default');
  });

  it('returns grpc-other for Concordium alternative gRPC ports', () => {
    expect(getPortCategory(10000)).toBe('grpc-other');
    expect(getPortCategory(10001)).toBe('grpc-other');
    expect(getPortCategory(11000)).toBe('grpc-other');
  });

  it('returns other for non-Concordium ports', () => {
    // Generic gRPC ports are categorized as "other"
    expect(getPortCategory(50051)).toBe('other');
    expect(getPortCategory(8080)).toBe('other');
    expect(getPortCategory(9000)).toBe('other');
    // Common service ports
    expect(getPortCategory(22)).toBe('other');
    expect(getPortCategory(80)).toBe('other');
  });
});
