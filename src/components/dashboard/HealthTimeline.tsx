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
  // Calculate the display window
  const now = data.length > 0 ? data[data.length - 1].timestamp : Date.now();
  const windowStart = now - timeRangeMinutes * 60 * 1000;
  const windowEnd = now;
  const windowDuration = windowEnd - windowStart;

  // Generate time markers every 15 minutes
  const markers: { position: number; label: string }[] = [];
  const markerInterval = 15 * 60 * 1000; // 15 minutes

  // Start from a round 15-minute mark
  const firstMarkerTime = Math.ceil(windowStart / markerInterval) * markerInterval;
  for (let t = firstMarkerTime; t <= windowEnd; t += markerInterval) {
    const position = ((t - windowStart) / windowDuration) * 100;
    const minutesAgo = Math.round((windowEnd - t) / 60000);
    const label = minutesAgo === 0 ? 'now' : `-${minutesAgo}m`;
    markers.push({ position, label });
  }

  // Calculate segment positions based on actual timestamps
  // Each data point represents data collected at that timestamp
  // The segment extends from that point to the next (or to now for the last one)
  const segments = data.map((d, i) => {
    const segmentStart = d.timestamp;
    const segmentEnd = i < data.length - 1 ? data[i + 1].timestamp : windowEnd;

    // Calculate position and width as percentage of window
    const left = Math.max(0, ((segmentStart - windowStart) / windowDuration) * 100);
    const right = Math.min(100, ((segmentEnd - windowStart) / windowDuration) * 100);
    const width = right - left;

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
  }).filter(s => s.width > 0 && s.left < 100); // Only show segments in view

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

        {/* Time marker ticks */}
        {showLabels && markers.map((m, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${m.position}%`,
              top: 0,
              width: '1px',
              height: '100%',
              background: 'var(--bb-border)',
              opacity: 0.5,
            }}
          />
        ))}
      </div>

      {/* Time labels */}
      {showLabels && (
        <div
          className="health-timeline-labels"
          style={{
            position: 'relative',
            height: '16px',
            marginTop: '2px',
            fontSize: '8px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--bb-gray)',
          }}
        >
          {markers.map((m, i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                left: `${m.position}%`,
                transform: 'translateX(-50%)',
                whiteSpace: 'nowrap',
              }}
            >
              {m.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
