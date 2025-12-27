'use client';

import { useEffect } from 'react';
import { useOsintFull, getReputationColor, getReputationLabel } from '@/hooks/useOsint';
import { useWebamon } from '@/hooks/useWebamon';

interface OsintDrawerProps {
  ip: string;
  onClose: () => void;
}

export function OsintDrawer({ ip, onClose }: OsintDrawerProps) {
  const { data, isLoading, error } = useOsintFull(ip);

  // Fetch Webamon data when we have ports info
  const { data: webamonData, isLoading: webamonLoading } = useWebamon(
    data ? ip : null,
    data?.ports || []
  );

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <>
      {/* Overlay */}
      <div className="osint-drawer-overlay" onClick={onClose} />

      {/* Drawer */}
      <div className="osint-drawer">
        {/* Header */}
        <div className="osint-drawer-header">
          <span className="osint-drawer-title">OSINT Report: {ip}</span>
          <button className="osint-drawer-close" onClick={onClose}>
            &#10005;
          </button>
        </div>

        {/* Body */}
        <div className="osint-drawer-body">
          {isLoading ? (
            <LoadingSkeleton />
          ) : error ? (
            <div className="osint-empty">
              <div className="osint-empty-icon">&#9888;</div>
              <span>SCAN FAILED</span>
              <span style={{ color: 'var(--bb-red)' }}>
                {error instanceof Error ? error.message : 'Unknown error'}
              </span>
            </div>
          ) : data ? (
            <>
              {/* Dashboard metrics */}
              <div className="osint-dashboard">
                <div className="osint-dashboard-metric">
                  <span
                    className={`osint-dashboard-value ${data.reputation}`}
                    style={{ color: getReputationColor(data.reputation) }}
                  >
                    {getReputationLabel(data.reputation)}
                  </span>
                  <span className="osint-dashboard-label">Reputation</span>
                </div>
                <div className="osint-dashboard-metric">
                  <span className="osint-dashboard-value">{data.ports.length}</span>
                  <span className="osint-dashboard-label">Open Ports</span>
                </div>
                <div className="osint-dashboard-metric">
                  <span
                    className="osint-dashboard-value"
                    style={{ color: data.vulns.length > 0 ? 'var(--bb-red)' : 'var(--bb-white)' }}
                  >
                    {data.vulns.length}
                  </span>
                  <span className="osint-dashboard-label">Vulns</span>
                </div>
              </div>

              {/* Infrastructure Section */}
              <div className="osint-section">
                <div className="osint-section-header">
                  <span>Infrastructure</span>
                  {data.org && <span className="osint-section-badge">{data.org}</span>}
                </div>
                <div className="osint-section-body">
                  <div className="osint-row">
                    <span className="osint-label">IP Address</span>
                    <span className="osint-value mono">{data.ip}</span>
                  </div>
                  {data.isp && (
                    <div className="osint-row">
                      <span className="osint-label">ISP</span>
                      <span className="osint-value">{data.isp}</span>
                    </div>
                  )}
                  {data.asn && (
                    <div className="osint-row">
                      <span className="osint-label">ASN</span>
                      <span className="osint-value mono">{data.asn}</span>
                    </div>
                  )}
                  {(data.city || data.country_code) && (
                    <div className="osint-row">
                      <span className="osint-label">Location</span>
                      <span className="osint-value">
                        {data.city ? `${data.city}, ` : ''}
                        {data.country_code || ''}
                      </span>
                    </div>
                  )}
                  {data.os && (
                    <div className="osint-row">
                      <span className="osint-label">OS</span>
                      <span className="osint-value">{data.os}</span>
                    </div>
                  )}
                  {data.product && (
                    <div className="osint-row">
                      <span className="osint-label">Product</span>
                      <span className="osint-value">{data.product}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Ports Section */}
              {data.ports.length > 0 && (
                <div className="osint-section">
                  <div className="osint-section-header">
                    <span>Open Ports</span>
                    <span className="osint-section-badge">{data.ports.length}</span>
                  </div>
                  <div className="osint-section-body">
                    <div className="osint-tags">
                      {data.ports.map((port) => (
                        <span key={port} className="osint-tag port">
                          {port}
                          {getPortService(port) && (
                            <span style={{ color: 'var(--bb-gray)', marginLeft: '4px' }}>
                              ({getPortService(port)})
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Hostnames Section */}
              {data.hostnames.length > 0 && (
                <div className="osint-section">
                  <div className="osint-section-header">
                    <span>Hostnames</span>
                    <span className="osint-section-badge">{data.hostnames.length}</span>
                  </div>
                  <div className="osint-section-body">
                    <div className="osint-tags">
                      {data.hostnames.map((hostname) => (
                        <span key={hostname} className="osint-tag hostname">
                          {hostname}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Vulnerabilities Section */}
              {data.vulns.length > 0 && (
                <div className="osint-section">
                  <div className="osint-section-header">
                    <span>Vulnerabilities</span>
                    <span
                      className="osint-section-badge"
                      style={{ background: 'var(--bb-red)', color: 'var(--bb-black)' }}
                    >
                      {data.vulns.length}
                    </span>
                  </div>
                  <div className="osint-section-body">
                    <div className="osint-tags">
                      {data.vulns.map((vuln) => (
                        <span key={vuln} className="osint-tag vuln">
                          {vuln}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* CPEs Section */}
              {data.cpes.length > 0 && (
                <div className="osint-section">
                  <div className="osint-section-header">
                    <span>Software (CPE)</span>
                    <span className="osint-section-badge">{data.cpes.length}</span>
                  </div>
                  <div className="osint-section-body">
                    <div className="osint-tags">
                      {data.cpes.slice(0, 10).map((cpe) => (
                        <span key={cpe} className="osint-tag cpe">
                          {formatCPE(cpe)}
                        </span>
                      ))}
                      {data.cpes.length > 10 && (
                        <span className="osint-tag" style={{ color: 'var(--bb-gray)' }}>
                          +{data.cpes.length - 10} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tags Section */}
              {data.tags.length > 0 && (
                <div className="osint-section">
                  <div className="osint-section-header">
                    <span>Tags</span>
                  </div>
                  <div className="osint-section-body">
                    <div className="osint-tags">
                      {data.tags.map((tag) => (
                        <span
                          key={tag}
                          className="osint-tag"
                          style={{
                            color: getTagColor(tag),
                            borderColor: getTagColor(tag),
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Web Screenshots Section (Webamon) */}
              <div className="osint-section">
                <div className="osint-section-header">
                  <span>Web Screenshots</span>
                  {webamonData?.total !== undefined && webamonData.total > 0 && (
                    <span className="osint-section-badge">{webamonData.total}</span>
                  )}
                </div>
                <div className="osint-section-body">
                  {webamonLoading ? (
                    <div className="osint-row">
                      <div className="osint-skeleton" style={{ width: '100%', height: '80px' }} />
                    </div>
                  ) : !webamonData?.http_available ? (
                    <div className="osint-row">
                      <span className="osint-value" style={{ color: 'var(--bb-gray)' }}>
                        No HTTP ports detected
                      </span>
                    </div>
                  ) : webamonData.scans.length === 0 ? (
                    <div className="osint-row">
                      <span className="osint-value" style={{ color: 'var(--bb-gray)' }}>
                        No web scans available
                      </span>
                    </div>
                  ) : (
                    <div className="webamon-scans">
                      {webamonData.scans.slice(0, 3).map((scan) => (
                        <div key={scan.id} className="webamon-scan">
                          {scan.screenshot_url && (
                            <a
                              href={scan.screenshot_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="webamon-screenshot"
                            >
                              <img
                                src={scan.screenshot_url}
                                alt={`Screenshot of ${scan.url}`}
                                loading="lazy"
                              />
                            </a>
                          )}
                          <div className="webamon-scan-info">
                            <a
                              href={scan.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="webamon-url"
                            >
                              {scan.url}
                            </a>
                            {scan.title && (
                              <span className="webamon-title">{scan.title}</span>
                            )}
                            {scan.status_code && (
                              <span
                                className="webamon-status"
                                style={{
                                  color:
                                    scan.status_code >= 200 && scan.status_code < 300
                                      ? 'var(--bb-green)'
                                      : scan.status_code >= 400
                                        ? 'var(--bb-red)'
                                        : 'var(--bb-amber)',
                                }}
                              >
                                HTTP {scan.status_code}
                              </span>
                            )}
                            {scan.technologies && scan.technologies.length > 0 && (
                              <div className="webamon-tech">
                                {scan.technologies.slice(0, 5).map((tech) => (
                                  <span key={tech} className="osint-tag">
                                    {tech}
                                  </span>
                                ))}
                              </div>
                            )}
                            <span className="webamon-date">
                              {new Date(scan.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Metadata Section */}
              <div className="osint-section">
                <div className="osint-section-header">
                  <span>Scan Metadata</span>
                </div>
                <div className="osint-section-body">
                  {data.last_updated && (
                    <div className="osint-row">
                      <span className="osint-label">Last Updated</span>
                      <span className="osint-value">
                        {new Date(data.last_updated).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {data.cached_at && (
                    <div className="osint-row">
                      <span className="osint-label">Cached At</span>
                      <span className="osint-value">
                        {new Date(data.cached_at).toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div className="osint-row">
                    <span className="osint-label">Sources</span>
                    <span className="osint-value">
                      InternetDB{data.cached_at ? ', Shodan' : ''}
                      {webamonData && webamonData.total > 0 ? ', Webamon' : ''}
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="osint-empty">
              <div className="osint-empty-icon">&#128269;</div>
              <span>NO DATA AVAILABLE</span>
              <span>This IP has not been scanned</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function LoadingSkeleton() {
  return (
    <>
      <div className="osint-dashboard">
        {[1, 2, 3].map((i) => (
          <div key={i} className="osint-dashboard-metric">
            <div className="osint-skeleton" style={{ width: '60px', height: '24px' }} />
            <div className="osint-skeleton" style={{ width: '80px', height: '10px' }} />
          </div>
        ))}
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="osint-section">
          <div className="osint-section-header">
            <div className="osint-skeleton" style={{ width: '100px', height: '12px' }} />
          </div>
          <div className="osint-section-body">
            {[1, 2, 3].map((j) => (
              <div key={j} className="osint-row">
                <div className="osint-skeleton" style={{ width: '80px' }} />
                <div className="osint-skeleton" style={{ flex: 1 }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function getPortService(port: number): string | null {
  const services: Record<number, string> = {
    20: 'FTP-data',
    21: 'FTP',
    22: 'SSH',
    23: 'Telnet',
    25: 'SMTP',
    53: 'DNS',
    80: 'HTTP',
    110: 'POP3',
    143: 'IMAP',
    443: 'HTTPS',
    445: 'SMB',
    993: 'IMAPS',
    995: 'POP3S',
    3306: 'MySQL',
    3389: 'RDP',
    5432: 'PostgreSQL',
    5900: 'VNC',
    6379: 'Redis',
    8080: 'HTTP-alt',
    8443: 'HTTPS-alt',
    8888: 'P2P',
    20000: 'gRPC',
    27017: 'MongoDB',
  };
  return services[port] || null;
}

function formatCPE(cpe: string): string {
  // CPE format: cpe:/a:vendor:product:version
  const parts = cpe.replace('cpe:/', '').split(':');
  if (parts.length >= 3) {
    return `${parts[1]}:${parts[2]}${parts[3] ? `:${parts[3]}` : ''}`;
  }
  return cpe;
}

function getTagColor(tag: string): string {
  const lowerTag = tag.toLowerCase();
  if (['malware', 'c2', 'botnet', 'compromised'].includes(lowerTag)) {
    return 'var(--bb-red)';
  }
  if (['self-signed', 'expired', 'honeypot'].includes(lowerTag)) {
    return 'var(--bb-amber)';
  }
  if (['tor', 'vpn', 'proxy'].includes(lowerTag)) {
    return 'var(--bb-magenta)';
  }
  return 'var(--bb-cyan)';
}
