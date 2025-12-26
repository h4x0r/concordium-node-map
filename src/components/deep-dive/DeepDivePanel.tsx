'use client';

import { useState, useCallback, useMemo } from 'react';
import { useTimelineZoom } from '@/hooks/useTimelineZoom';
import { useDeepDiveData } from '@/hooks/useDeepDiveData';
import { TimelineRuler } from './TimelineRuler';
import { MetricTrack } from './MetricTrack';
import { NodeSelector, type NodeInfo } from './NodeSelector';
import { TimeRangeInput } from './TimeRangeInput';
import type { TimeRange, TimeRangePreset } from '@/lib/timeline';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const PRESETS: TimeRangePreset[] = ['1h', '6h', '24h', '7d', '30d'];

interface TrackState {
  health: boolean;
  latency: boolean;
  bandwidth: boolean;
  peers: boolean;
}

export interface DeepDivePanelProps {
  nodeId: string;
  nodeName: string;
  isOpen: boolean;
  onClose: () => void;
  onAddComparisonNode?: (nodeId: string) => void;
  allNodes?: NodeInfo[];
}

export function DeepDivePanel({
  nodeId,
  nodeName,
  isOpen,
  onClose,
  allNodes = [],
}: DeepDivePanelProps) {
  const now = useMemo(() => Date.now(), []);
  const bounds: TimeRange = useMemo(
    () => ({
      start: now - 30 * DAY,
      end: now,
    }),
    [now]
  );

  const [activePreset, setActivePreset] = useState<TimeRangePreset>('24h');
  const [collapsedTracks, setCollapsedTracks] = useState<TrackState>({
    health: false,
    latency: false,
    bandwidth: false,
    peers: false,
  });
  const [crosshairTimestamp, setCrosshairTimestamp] = useState<number | undefined>();
  const [comparisonNodeIds, setComparisonNodeIds] = useState<string[]>([]);
  const [isNodeSelectorOpen, setIsNodeSelectorOpen] = useState(false);

  const { range, zoomIn, zoomOut, pan, setPreset, setRange } = useTimelineZoom(bounds);

  const {
    primaryData,
    comparisonData,
    isLoading,
    addComparisonNode,
    removeComparisonNode,
  } = useDeepDiveData(nodeId, range, comparisonNodeIds);

  const handleZoom = useCallback(
    (cursorRatio: number, direction: 'in' | 'out') => {
      if (direction === 'in') {
        zoomIn(cursorRatio);
      } else {
        zoomOut(cursorRatio);
      }
    },
    [zoomIn, zoomOut]
  );

  const handlePresetClick = useCallback(
    (preset: TimeRangePreset) => {
      setActivePreset(preset);
      setPreset(preset);
    },
    [setPreset]
  );

  const toggleTrack = useCallback((track: keyof TrackState) => {
    setCollapsedTracks((prev) => ({ ...prev, [track]: !prev[track] }));
  }, []);

  const handleAddComparison = useCallback(() => {
    setIsNodeSelectorOpen(true);
  }, []);

  const handleNodeSelected = useCallback(
    (selectedNodeId: string) => {
      addComparisonNode(selectedNodeId);
      setComparisonNodeIds((prev) => [...prev, selectedNodeId]);
    },
    [addComparisonNode]
  );

  // Exclude primary node and already-compared nodes from selector
  const excludedNodeIds = useMemo(
    () => [nodeId, ...comparisonNodeIds],
    [nodeId, comparisonNodeIds]
  );

  if (!isOpen) {
    return null;
  }

  const presetDurations: Record<TimeRangePreset, number> = {
    '1h': HOUR,
    '6h': 6 * HOUR,
    '24h': 24 * HOUR,
    '7d': 7 * DAY,
    '30d': 30 * DAY,
  };

  return (
    <div
      data-testid="deep-dive-panel"
      className="deep-dive-panel"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: '60%',
        height: '100vh',
        background: 'var(--bb-black, #0a0a0f)',
        borderLeft: '2px solid var(--bb-border)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.5)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          background: 'var(--bb-panel)',
          borderBottom: '1px solid var(--bb-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '14px',
              fontWeight: 'bold',
              color: 'var(--bb-orange)',
            }}
          >
            {nodeName}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: 'var(--bb-gray)',
              opacity: 0.7,
            }}
          >
            {nodeId}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleAddComparison}
            aria-label="Add comparison node"
            style={{
              background: 'transparent',
              border: '1px solid var(--bb-border)',
              color: 'var(--bb-cyan)',
              padding: '4px 12px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
              borderRadius: '2px',
            }}
          >
            + Compare
          </button>
          <button
            onClick={onClose}
            aria-label="close"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--bb-gray)',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '0 8px',
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Comparison nodes bar */}
      {comparisonData.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '8px 16px',
            background: 'var(--bb-panel)',
            borderBottom: '1px solid var(--bb-border)',
          }}
        >
          <span
            style={{
              padding: '2px 8px',
              background: 'var(--bb-cyan)',
              color: 'var(--bb-bg)',
              borderRadius: '2px',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {nodeName}
          </span>
          {comparisonData.map((comp, i) => (
            <span
              key={comp.nodeId}
              style={{
                padding: '2px 8px',
                background: i === 0 ? 'var(--bb-orange)' : 'var(--bb-green)',
                color: 'var(--bb-bg)',
                borderRadius: '2px',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {comp.nodeId}
              <button
                onClick={() => removeComparisonNode(comp.nodeId)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--bb-bg)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Time range presets */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '8px 16px',
          background: 'var(--bb-panel)',
          borderBottom: '1px solid var(--bb-border)',
        }}
      >
        {PRESETS.map((preset) => {
          const currentDuration = range.end - range.start;
          const isActive =
            Math.abs(currentDuration - presetDurations[preset]) <
            presetDurations[preset] * 0.1;

          return (
            <button
              key={preset}
              onClick={() => handlePresetClick(preset)}
              data-active={isActive}
              style={{
                padding: '4px 12px',
                background: isActive ? 'var(--bb-cyan)' : 'transparent',
                border: `1px solid ${isActive ? 'var(--bb-cyan)' : 'var(--bb-border)'}`,
                color: isActive ? 'var(--bb-bg)' : 'var(--bb-gray)',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                borderRadius: '2px',
              }}
            >
              {preset}
            </button>
          );
        })}

        {/* Separator */}
        <div
          style={{
            width: '1px',
            height: '20px',
            background: 'var(--bb-border)',
            margin: '0 8px',
          }}
        />

        {/* Custom time input */}
        <TimeRangeInput onRangeChange={setRange} now={now} />
      </div>

      {/* Timeline ruler */}
      <TimelineRuler
        range={range}
        bounds={bounds}
        onZoom={handleZoom}
        onPan={pan}
        onSetRange={setRange}
      />

      {/* Loading indicator */}
      {isLoading && (
        <div
          data-testid="loading-indicator"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            padding: '16px 24px',
            background: 'var(--bb-panel)',
            border: '1px solid var(--bb-border)',
            borderRadius: '4px',
            zIndex: 10,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--bb-cyan)',
            }}
          >
            Loading data...
          </span>
        </div>
      )}

      {/* Metric tracks */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
        }}
      >
        <MetricTrack
          label="Health"
          metric="health"
          range={range}
          primaryData={primaryData}
          comparisonData={comparisonData}
          height={40}
          collapsed={collapsedTracks.health}
          onToggleCollapse={() => toggleTrack('health')}
          crosshairTimestamp={crosshairTimestamp}
        />
        <MetricTrack
          label="Latency"
          metric="latency"
          range={range}
          primaryData={primaryData}
          comparisonData={comparisonData}
          height={80}
          collapsed={collapsedTracks.latency}
          onToggleCollapse={() => toggleTrack('latency')}
          crosshairTimestamp={crosshairTimestamp}
        />
        <MetricTrack
          label="Bandwidth"
          metric="bandwidth"
          range={range}
          primaryData={primaryData}
          comparisonData={comparisonData}
          height={80}
          collapsed={collapsedTracks.bandwidth}
          onToggleCollapse={() => toggleTrack('bandwidth')}
          crosshairTimestamp={crosshairTimestamp}
        />
        <MetricTrack
          label="Peers"
          metric="peers"
          range={range}
          primaryData={primaryData}
          comparisonData={comparisonData}
          height={80}
          collapsed={collapsedTracks.peers}
          onToggleCollapse={() => toggleTrack('peers')}
          crosshairTimestamp={crosshairTimestamp}
        />
      </div>

      {/* Node selector dialog */}
      <NodeSelector
        isOpen={isNodeSelectorOpen}
        nodes={allNodes}
        excludeNodeIds={excludedNodeIds}
        onSelect={handleNodeSelected}
        onClose={() => setIsNodeSelectorOpen(false)}
      />
    </div>
  );
}
