'use client';

export type HealthStatusType = 'healthy' | 'lagging' | 'issue';

export interface HealthStatus {
  timestamp: number;
  status: HealthStatusType;
}

export interface HealthTimelineProps {
  data: HealthStatus[];
  showLabels?: boolean;
  height?: number;
}

const STATUS_COLORS = {
  healthy: 'var(--bb-green)',
  lagging: 'var(--bb-amber)',
  issue: 'var(--bb-red)',
};

export function HealthTimeline({
  data,
  showLabels = false,
  height = 16,
}: HealthTimelineProps) {
  return (
    <div className="health-timeline" style={{ height: showLabels ? height + 16 : height }}>
      <div
        className="health-timeline-bar"
        style={{
          display: 'flex',
          height,
          width: '100%',
          borderRadius: '2px',
          overflow: 'hidden',
          background: 'var(--bb-black)',
          border: '1px solid var(--bb-border)',
        }}
      >
        {data.map((d, i) => (
          <div
            key={i}
            className={`health-segment ${d.status}`}
            style={{
              flex: 1,
              background: STATUS_COLORS[d.status],
              opacity: d.status === 'healthy' ? 0.7 : 0.9,
              transition: 'opacity 0.2s ease',
            }}
            title={`${new Date(d.timestamp).toLocaleTimeString()}: ${d.status}`}
          />
        ))}
      </div>

      {showLabels && (
        <div
          className="health-timeline-labels"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '4px',
            fontSize: '9px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--bb-gray)',
          }}
        >
          <span>-15m</span>
          <span>now</span>
        </div>
      )}
    </div>
  );
}
