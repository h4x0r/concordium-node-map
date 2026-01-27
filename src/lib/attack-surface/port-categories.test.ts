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

  it('detects standard gRPC port 50051', () => {
    const result = categorizePorts([50051]);
    expect(result.grpcOther).toContain(50051);
  });

  it('detects gRPC-web ports 8080 and 8443', () => {
    const result = categorizePorts([8080, 8443]);
    expect(result.grpcOther).toContain(8080);
    expect(result.grpcOther).toContain(8443);
  });

  it('detects common gRPC ports in 9000 range', () => {
    const result = categorizePorts([9000, 9090, 9999]);
    expect(result.grpcOther).toContain(9000);
    expect(result.grpcOther).toContain(9090);
    expect(result.grpcOther).toContain(9999);
  });

  it('categorizes unknown ports as other', () => {
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

  it('returns legend with Other gRPC description', () => {
    const legend = getPortLegend();
    const otherGrpc = legend.find((l) => l.label === 'Other gRPC');
    expect(otherGrpc).toBeDefined();
    expect(otherGrpc?.description).toContain('10000/10001/11000');
    expect(otherGrpc?.description).toContain('50051');
    expect(otherGrpc?.description).toContain('8080/8443');
    expect(otherGrpc?.description).toContain('9000/9090/9999');
  });
});

describe('isKnownPort', () => {
  it('returns true for peering port', () => {
    expect(isKnownPort(8888)).toBe(true);
  });

  it('returns true for default gRPC port', () => {
    expect(isKnownPort(20000)).toBe(true);
  });

  it('returns true for alternative gRPC ports', () => {
    expect(isKnownPort(10000)).toBe(true);
    expect(isKnownPort(10001)).toBe(true);
    expect(isKnownPort(11000)).toBe(true);
    expect(isKnownPort(50051)).toBe(true);
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

  it('returns grpc-other for alternative gRPC ports', () => {
    expect(getPortCategory(10000)).toBe('grpc-other');
    expect(getPortCategory(50051)).toBe('grpc-other');
    expect(getPortCategory(8080)).toBe('grpc-other');
  });

  it('returns other for unknown ports', () => {
    expect(getPortCategory(22)).toBe('other');
    expect(getPortCategory(80)).toBe('other');
  });
});
