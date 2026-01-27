'use client';

import { useState, useEffect, useRef } from 'react';
import { useOsintQuick, getReputationColor, getReputationLabel } from '@/hooks/useOsint';

interface OsintHoverCardProps {
  ip: string;
  children: React.ReactNode;
  onClickForFull?: () => void;
}

export function OsintHoverCard({ ip, children, onClickForFull }: OsintHoverCardProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const { data, isLoading } = useOsintQuick(isVisible ? ip : null);

  const handleMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    hoverTimeoutRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPosition({
          x: rect.left + rect.width / 2,
          y: rect.bottom + 8,
        });
      }
      setIsVisible(true);
    }, 300);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 100);
  };

  const handleCardMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const handleCardMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 100);
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  const handleClick = () => {
    setIsVisible(false);
    onClickForFull?.();
  };

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        className="cursor-pointer hover:underline flex-1 min-w-0"
      >
        {children}
      </span>

      {isVisible && (
        <div
          className="osint-hover-card"
          style={{
            position: 'fixed',
            left: position.x,
            top: position.y,
            transform: 'translateX(-50%)',
            zIndex: 9999,
          }}
          onMouseEnter={handleCardMouseEnter}
          onMouseLeave={handleCardMouseLeave}
        >
          {isLoading ? (
            <div className="osint-hover-loading">
              <div className="osint-hover-loading-bar" />
              <span>SCANNING...</span>
            </div>
          ) : data ? (
            <>
              {/* Header with reputation */}
              <div className="osint-hover-header">
                <span
                  className="osint-reputation-dot"
                  style={{ background: getReputationColor(data.reputation) }}
                />
                <span
                  className="osint-reputation-label"
                  style={{ color: getReputationColor(data.reputation) }}
                >
                  {getReputationLabel(data.reputation)}
                </span>
                <span className="osint-hover-ip">{ip}</span>
              </div>

              {/* Quick stats */}
              <div className="osint-hover-stats">
                <div className="osint-hover-stat">
                  <span className="osint-hover-stat-label">PORTS</span>
                  <span className="osint-hover-stat-value">
                    {data.ports.length > 0 ? data.ports.length : '-'}
                  </span>
                </div>
                <div className="osint-hover-stat">
                  <span className="osint-hover-stat-label">VULNS</span>
                  <span
                    className="osint-hover-stat-value"
                    style={{
                      color: data.vulns_count > 0 ? 'var(--bb-red)' : 'var(--bb-white)',
                    }}
                  >
                    {data.vulns_count}
                  </span>
                </div>
                <div className="osint-hover-stat">
                  <span className="osint-hover-stat-label">SCAN</span>
                  <span className="osint-hover-stat-value osint-hover-stat-time">
                    {data.last_scan === 'InternetDB'
                      ? 'LIVE'
                      : data.last_scan
                      ? formatRelativeTime(data.last_scan)
                      : 'N/A'}
                  </span>
                </div>
              </div>

              {/* CTA */}
              <button className="osint-hover-cta" onClick={handleClick}>
                <span className="osint-hover-cta-arrow">&#9654;</span>
                FULL OSINT REPORT
              </button>
            </>
          ) : (
            <div className="osint-hover-empty">
              <span>NO DATA</span>
              <button className="osint-hover-cta" onClick={handleClick}>
                <span className="osint-hover-cta-arrow">&#9654;</span>
                TRIGGER SCAN
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 30) return `${diffDays}d`;
  return `${Math.floor(diffDays / 30)}mo`;
}
