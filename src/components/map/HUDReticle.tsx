'use client';

import { memo } from 'react';

export type NodeHealth = 'healthy' | 'lagging' | 'issue';
export type NodeTier = 'baker' | 'hub' | 'standard' | 'edge';

interface HUDReticleProps {
  health: NodeHealth;
  tier: NodeTier;
  selected?: boolean;
  isConnectedPeer?: boolean;
}

// Tier-based sizing
const TIER_CONFIG = {
  baker: { radius: 40, stroke: 3 },
  hub: { radius: 35, stroke: 2 },
  standard: { radius: 25, stroke: 1.5 },
  edge: { radius: 18, stroke: 1 },
};

// Health-based colors, animation speeds, and opacity
const HEALTH_CONFIG = {
  healthy: { color: '#FFB800', duration: 8, opacity: 0.15 },    // Gold, slow, very translucent
  lagging: { color: '#FF8C00', duration: 5, opacity: 0.5 },     // Orange, medium
  issue: { color: '#FF4444', duration: 3, opacity: 0.6 },       // Red, fast
};

// Selected state uses cyan
const SELECTED_COLOR = '#00CCFF';

/**
 * Creates an SVG arc path
 */
function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

export const HUDReticle = memo(function HUDReticle({
  health,
  tier,
  selected = false,
  isConnectedPeer = false,
}: HUDReticleProps) {
  const tierConfig = TIER_CONFIG[tier];
  const healthConfig = HEALTH_CONFIG[health];

  const size = tierConfig.radius * 2 + 20; // Extra space for glow
  const center = size / 2;
  const radius = tierConfig.radius;
  const stroke = tierConfig.stroke;

  const color = selected ? SELECTED_COLOR : healthConfig.color;
  const duration = selected ? 2 : healthConfig.duration;
  const opacity = selected ? 0.9 : healthConfig.opacity;

  // Connected peers just get corner brackets
  if (isConnectedPeer && !selected) {
    const bracketSize = radius * 0.6;
    const bracketOffset = radius * 0.7;
    return (
      <svg
        width={size}
        height={size}
        className="hud-reticle connected-peer"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      >
        {/* Corner brackets */}
        <g stroke={SELECTED_COLOR} strokeWidth={1.5} fill="none" opacity={0.7}>
          {/* Top-left */}
          <path d={`M ${center - bracketOffset} ${center - bracketOffset + bracketSize * 0.4} L ${center - bracketOffset} ${center - bracketOffset} L ${center - bracketOffset + bracketSize * 0.4} ${center - bracketOffset}`} />
          {/* Top-right */}
          <path d={`M ${center + bracketOffset - bracketSize * 0.4} ${center - bracketOffset} L ${center + bracketOffset} ${center - bracketOffset} L ${center + bracketOffset} ${center - bracketOffset + bracketSize * 0.4}`} />
          {/* Bottom-left */}
          <path d={`M ${center - bracketOffset} ${center + bracketOffset - bracketSize * 0.4} L ${center - bracketOffset} ${center + bracketOffset} L ${center - bracketOffset + bracketSize * 0.4} ${center + bracketOffset}`} />
          {/* Bottom-right */}
          <path d={`M ${center + bracketOffset - bracketSize * 0.4} ${center + bracketOffset} L ${center + bracketOffset} ${center + bracketOffset} L ${center + bracketOffset} ${center + bracketOffset - bracketSize * 0.4}`} />
        </g>
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      className={`hud-reticle ${selected ? 'selected' : 'ambient'} health-${health}`}
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }}
    >
      {/* Glow filter */}
      <defs>
        <filter id={`glow-${health}-${selected ? 'sel' : 'amb'}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={selected ? 4 : 2} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Ambient scanning arcs - two opposing 60° segments */}
      <g
        className="scanning-arcs"
        style={{
          transformOrigin: `${center}px ${center}px`,
          animation: `hud-rotate ${duration}s linear infinite`,
        }}
        filter={`url(#glow-${health}-${selected ? 'sel' : 'amb'})`}
      >
        <path
          d={describeArc(center, center, radius, 0, 60)}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          opacity={opacity}
          strokeLinecap="round"
        />
        <path
          d={describeArc(center, center, radius, 180, 240)}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          opacity={opacity}
          strokeLinecap="round"
        />
      </g>

      {/* Selected state: additional counter-rotating ring */}
      {selected && (
        <>
          {/* Inner static ring */}
          <circle
            cx={center}
            cy={center}
            r={radius * 0.7}
            stroke={SELECTED_COLOR}
            strokeWidth={1}
            fill="none"
            opacity={0.4}
            strokeDasharray="4 4"
          />

          {/* Counter-rotating outer arcs */}
          <g
            style={{
              transformOrigin: `${center}px ${center}px`,
              animation: `hud-rotate-reverse 3s linear infinite`,
            }}
            filter={`url(#glow-${health}-sel)`}
          >
            <path
              d={describeArc(center, center, radius * 1.15, 30, 70)}
              stroke={SELECTED_COLOR}
              strokeWidth={stroke * 0.8}
              fill="none"
              opacity={0.7}
              strokeLinecap="round"
            />
            <path
              d={describeArc(center, center, radius * 1.15, 120, 160)}
              stroke={SELECTED_COLOR}
              strokeWidth={stroke * 0.8}
              fill="none"
              opacity={0.7}
              strokeLinecap="round"
            />
            <path
              d={describeArc(center, center, radius * 1.15, 210, 250)}
              stroke={SELECTED_COLOR}
              strokeWidth={stroke * 0.8}
              fill="none"
              opacity={0.7}
              strokeLinecap="round"
            />
            <path
              d={describeArc(center, center, radius * 1.15, 300, 340)}
              stroke={SELECTED_COLOR}
              strokeWidth={stroke * 0.8}
              fill="none"
              opacity={0.7}
              strokeLinecap="round"
            />
          </g>

          {/* Corner brackets for selected node */}
          <g
            className="corner-brackets"
            stroke={SELECTED_COLOR}
            strokeWidth={2}
            fill="none"
          >
            {/* Top-left */}
            <path d={`M ${center - radius * 0.9} ${center - radius * 0.6} L ${center - radius * 0.9} ${center - radius * 0.9} L ${center - radius * 0.6} ${center - radius * 0.9}`} />
            {/* Top-right */}
            <path d={`M ${center + radius * 0.6} ${center - radius * 0.9} L ${center + radius * 0.9} ${center - radius * 0.9} L ${center + radius * 0.9} ${center - radius * 0.6}`} />
            {/* Bottom-left */}
            <path d={`M ${center - radius * 0.9} ${center + radius * 0.6} L ${center - radius * 0.9} ${center + radius * 0.9} L ${center - radius * 0.6} ${center + radius * 0.9}`} />
            {/* Bottom-right */}
            <path d={`M ${center + radius * 0.6} ${center + radius * 0.9} L ${center + radius * 0.9} ${center + radius * 0.9} L ${center + radius * 0.9} ${center + radius * 0.6}`} />
          </g>

          {/* Data ticks around outer ring */}
          <g className="data-ticks" opacity={0.5}>
            {[...Array(12)].map((_, i) => {
              const angle = i * 30;
              const innerR = radius * 1.25;
              const outerR = radius * 1.32;
              const p1 = polarToCartesian(center, center, innerR, angle);
              const p2 = polarToCartesian(center, center, outerR, angle);
              return (
                <line
                  key={i}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={SELECTED_COLOR}
                  strokeWidth={i % 3 === 0 ? 2 : 1}
                />
              );
            })}
          </g>
        </>
      )}

      {/* Issue state: pulsing effect */}
      {health === 'issue' && !selected && (
        <circle
          cx={center}
          cy={center}
          r={radius}
          stroke={HEALTH_CONFIG.issue.color}
          strokeWidth={stroke * 0.5}
          fill="none"
          className="pulse-ring"
          style={{
            animation: 'hud-pulse 1.5s ease-in-out infinite',
          }}
        />
      )}
    </svg>
  );
});
