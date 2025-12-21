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
  /** Time range in minutes (for display window) */
  timeRangeMinutes?: number;
  /** Interval in minutes between data points */
  intervalMinutes?: number;
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
  timeRangeMinutes = 60,
  intervalMinutes = 5,
}: HealthTimelineProps) {
  // Calculate actual time span from data
  const now = data.length > 0 ? data[data.length - 1].timestamp : Date.now();
  const oldest = data.length > 0 ? data[0].timestamp : now;
  const actualSpanMinutes = Math.round((now - oldest) / 60000);

  // Simple markers: just start and end
  const startLabel = actualSpanMinutes > 0 ? `-${actualSpanMinutes}m` : '';
  const markers = [
    { position: 0, label: startLabel },
    { position: 100, label: 'now' },
  ];

  // Each data point gets equal width, filling the entire bar
  // Rightmost = most recent (now), leftmost = oldest
  const segments = data.map((d, i) => {
    const width = 100 / data.length;
    const left = i * width;

    return {
      ...d,
      left,
      width,
      time: new Date(d.timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }),
    };
  });

  return (
    <div className="health-timeline" style={{ height: showLabels ? height + 20 : height }}>
      {/* Timeline bar */}
      <div
        className="health-timeline-bar"
        style={{
          position: 'relative',
          height,
          width: '100%',
          borderRadius: '2px',
          overflow: 'hidden',
          background: 'var(--bb-black)',
          border: '1px solid var(--bb-border)',
        }}
      >
        {/* Segments positioned by timestamp */}
        {segments.map((s, i) => (
          <div
            key={i}
            className={`health-segment ${s.status}`}
            style={{
              position: 'absolute',
              left: `${s.left}%`,
              width: `${s.width}%`,
              height: '100%',
              background: STATUS_COLORS[s.status],
              opacity: s.status === 'healthy' ? 0.7 : 0.9,
              borderRight: i < segments.length - 1 ? '1px solid var(--bb-black)' : 'none',
            }}
            title={`${s.time}: ${s.status}`}
          />
        ))}

        {/* Segment boundary ticks - mark every 5-min block */}
        {segments.map((s, i) => (
          <div
            key={`tick-${i}`}
            style={{
              position: 'absolute',
              left: `${s.left}%`,
              top: 0,
              width: '1px',
              height: '100%',
              background: 'var(--bb-text)',
              opacity: 0.5,
            }}
          />
        ))}
      </div>

      {/* Time labels - just start and end */}
      {showLabels && (
        <div
          className="health-timeline-labels"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '2px',
            fontSize: '8px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--bb-gray)',
          }}
        >
          <span>{markers[0].label}</span>
          <span>{markers[1].label}</span>
        </div>
      )}
    </div>
  );
}
