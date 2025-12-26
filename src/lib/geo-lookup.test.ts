import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeoLookupService, type GeoResult } from './geo-lookup';

describe('GeoLookupService', () => {
  let service: GeoLookupService;

  beforeEach(() => {
    service = new GeoLookupService();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('lookupIP', () => {
    it('returns geo data for valid IP', async () => {
      const mockResponse: GeoResult = {
        status: 'success',
        country: 'Germany',
        city: 'Frankfurt',
        lat: 50.1109,
        lon: 8.6821,
        isp: 'Hetzner Online GmbH',
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await service.lookupIP('185.201.8.42');

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(
        'http://ip-api.com/json/185.201.8.42?fields=status,country,city,lat,lon,isp'
      );
    });

    it('returns null for failed lookup', async () => {
      const mockResponse = {
        status: 'fail',
        message: 'invalid query',
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await service.lookupIP('invalid');

      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

      const result = await service.lookupIP('185.201.8.42');

      expect(result).toBeNull();
    });

    it('caches results to avoid duplicate requests', async () => {
      const mockResponse: GeoResult = {
        status: 'success',
        country: 'Germany',
        city: 'Frankfurt',
        lat: 50.1109,
        lon: 8.6821,
        isp: 'Hetzner Online GmbH',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      // First call
      await service.lookupIP('185.201.8.42');
      // Second call - should use cache
      await service.lookupIP('185.201.8.42');

      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('isPrivateIP', () => {
    it('returns true for private IP ranges', () => {
      expect(service.isPrivateIP('10.0.0.1')).toBe(true);
      expect(service.isPrivateIP('10.255.255.255')).toBe(true);
      expect(service.isPrivateIP('172.16.0.1')).toBe(true);
      expect(service.isPrivateIP('172.31.255.255')).toBe(true);
      expect(service.isPrivateIP('192.168.0.1')).toBe(true);
      expect(service.isPrivateIP('192.168.255.255')).toBe(true);
      expect(service.isPrivateIP('127.0.0.1')).toBe(true);
    });

    it('returns false for public IPs', () => {
      expect(service.isPrivateIP('185.201.8.42')).toBe(false);
      expect(service.isPrivateIP('8.8.8.8')).toBe(false);
      expect(service.isPrivateIP('142.250.185.78')).toBe(false);
    });
  });

  describe('rate limiting', () => {
    it('queues requests when rate limit exceeded', async () => {
      const mockResponse: GeoResult = {
        status: 'success',
        country: 'Germany',
        city: 'Frankfurt',
        lat: 50.1109,
        lon: 8.6821,
        isp: 'Hetzner',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      // Make 45 requests (at rate limit)
      const ips = Array.from({ length: 45 }, (_, i) => `1.1.1.${i}`);
      const promises = ips.map((ip) => service.lookupIP(ip));

      await Promise.all(promises);

      // All 45 should have been called
      expect(fetch).toHaveBeenCalledTimes(45);
    });
  });

  describe('batch lookup', () => {
    it('looks up multiple IPs and returns results', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            status: 'success',
            country: 'Germany',
            city: 'Frankfurt',
            lat: 50.1109,
            lon: 8.6821,
            isp: 'Hetzner',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            status: 'success',
            country: 'Japan',
            city: 'Tokyo',
            lat: 35.6762,
            lon: 139.6503,
            isp: 'NTT',
          }),
        });

      const results = await service.lookupBatch(['185.201.8.42', '203.0.113.1']);

      expect(results.size).toBe(2);
      expect(results.get('185.201.8.42')?.country).toBe('Germany');
      expect(results.get('203.0.113.1')?.country).toBe('Japan');
    });

    it('skips private IPs in batch lookup', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          status: 'success',
          country: 'Germany',
          city: 'Frankfurt',
          lat: 50.1109,
          lon: 8.6821,
          isp: 'Hetzner',
        }),
      });

      const results = await service.lookupBatch(['185.201.8.42', '192.168.1.1', '10.0.0.1']);

      // Only the public IP should be looked up
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(results.size).toBe(1);
      expect(results.has('185.201.8.42')).toBe(true);
    });
  });
});
