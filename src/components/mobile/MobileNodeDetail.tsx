'use client';

import { useEffect, useMemo } from 'react';
import { useNodes } from '@/hooks/useNodes';
import type { ConcordiumNode } from '@/lib/transforms';
import type { PeerData } from '@/hooks/usePeers';
import { formatUptime, formatBytesPerSecond } from '@/lib/formatting';

interface MobileNodeDetailProps {
  node: ConcordiumNode;
  peer?: PeerData;
  onClose: () => void;
}

export function MobileNodeDetail({ node, peer, onClose }: MobileNodeDetailProps) {
  const { data: allNodes } = useNodes();

  // Prevent body scroll when sheet is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Calculate health status
  const maxHeight = useMemo(() => {
    if (!allNodes) return node.finalizedBlockHeight;
    return Math.max(...allNodes.map((n) => n.finalizedBlockHeight));
  }, [allNodes, node.finalizedBlockHeight]);

  const blockLag = maxHeight - node.finalizedBlockHeight;
  const isHealthy = node.consensusRunning && blockLag <= 2;
  const isLagging = node.consensusRunning && blockLag > 2;
  const isBaker = node.bakingCommitteeMember === 'ActiveInCommittee' && node.consensusBakerId !== null;

  // Get connected peers that we know about
  const connectedPeers = useMemo(() => {
    if (!allNodes) return [];
    return node.peersList
      .map((peerId) => allNodes.find((n) => n.nodeId === peerId))
      .filter((n): n is ConcordiumNode => n !== undefined)
      .slice(0, 5); // Limit for mobile
  }, [allNodes, node.peersList]);

  return (
    <>
      {/* Backdrop */}
      <div className="mobile-sheet-backdrop" onClick={onClose} />

      {/* Bottom Sheet */}
      <div className="mobile-sheet">
        {/* Drag handle */}
        <div className="mobile-sheet-handle">
          <div className="mobile-sheet-handle-bar" />
        </div>

        {/* Header */}
        <div className="mobile-sheet-header">
          <div className="mobile-sheet-title">
            <span className="mobile-sheet-name">{node.nodeName || 'Unnamed Node'}</span>
            <span className="mobile-sheet-id">{node.nodeId.slice(0, 16)}...</span>
          </div>
          <button className="mobile-sheet-close" onClick={onClose}>
            &#10005;
          </button>
        </div>

        {/* Status badges */}
        <div className="mobile-sheet-badges">
          <span className={`mobile-badge ${isHealthy ? 'healthy' : isLagging ? 'lagging' : 'issue'}`}>
            {isHealthy ? 'HEALTHY' : isLagging ? 'LAGGING' : 'ISSUE'}
          </span>
          {isBaker && <span className="mobile-badge baker">BAKER</span>}
          {peer?.isBootstrapper && <span className="mobile-badge boot">BOOTSTRAP</span>}
          <span className="mobile-badge">{node.peerType}</span>
        </div>

        {/* Stats grid */}
        <div className="mobile-sheet-stats">
          <div className="mobile-sheet-stat">
            <span className="mobile-sheet-stat-value">{node.peersCount}</span>
            <span className="mobile-sheet-stat-label">Peers</span>
          </div>
          <div className="mobile-sheet-stat">
            <span className="mobile-sheet-stat-value">{node.finalizedBlockHeight.toLocaleString()}</span>
            <span className="mobile-sheet-stat-label">Block Height</span>
          </div>
          <div className="mobile-sheet-stat">
            <span className={`mobile-sheet-stat-value ${blockLag > 2 ? 'negative' : ''}`}>
              {blockLag > 0 ? `-${blockLag}` : '0'}
            </span>
            <span className="mobile-sheet-stat-label">Block Lag</span>
          </div>
          <div className="mobile-sheet-stat">
            <span className="mobile-sheet-stat-value">
              {node.averagePing !== null ? `${Math.round(node.averagePing)}ms` : '-'}
            </span>
            <span className="mobile-sheet-stat-label">Latency</span>
          </div>
        </div>

        {/* Details section */}
        <div className="mobile-sheet-section">
          <div className="mobile-sheet-section-title">Details</div>
          <div className="mobile-sheet-row">
            <span className="mobile-sheet-label">Client</span>
            <span className="mobile-sheet-value">{node.client}</span>
          </div>
          <div className="mobile-sheet-row">
            <span className="mobile-sheet-label">Uptime</span>
            <span className="mobile-sheet-value">{formatUptime(node.uptime)}</span>
          </div>
          <div className="mobile-sheet-row">
            <span className="mobile-sheet-label">Bandwidth In</span>
            <span className="mobile-sheet-value">{formatBytesPerSecond(node.averageBytesPerSecondIn)}</span>
          </div>
          <div className="mobile-sheet-row">
            <span className="mobile-sheet-label">Bandwidth Out</span>
            <span className="mobile-sheet-value">{formatBytesPerSecond(node.averageBytesPerSecondOut)}</span>
          </div>
          {peer?.geoCountry && (
            <div className="mobile-sheet-row">
              <span className="mobile-sheet-label">Location</span>
              <span className="mobile-sheet-value">
                {peer.geoCity ? `${peer.geoCity}, ${peer.geoCountry}` : peer.geoCountry}
              </span>
            </div>
          )}
          {peer?.ipAddress && (
            <div className="mobile-sheet-row">
              <span className="mobile-sheet-label">IP Address</span>
              <span className="mobile-sheet-value mono">{peer.ipAddress}</span>
            </div>
          )}
        </div>

        {/* Connected peers section */}
        {connectedPeers.length > 0 && (
          <div className="mobile-sheet-section">
            <div className="mobile-sheet-section-title">
              Connected Peers ({node.peersList.length})
            </div>
            <div className="mobile-sheet-peers">
              {connectedPeers.map((p) => (
                <div key={p.nodeId} className="mobile-sheet-peer">
                  <span className="mobile-sheet-peer-name">{p.nodeName || 'Unnamed'}</span>
                  <span className="mobile-sheet-peer-id">{p.nodeId.slice(0, 8)}...</span>
                </div>
              ))}
              {node.peersList.length > 5 && (
                <div className="mobile-sheet-peer more">
                  +{node.peersList.length - 5} more
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
