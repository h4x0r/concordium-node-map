# LCARS Network Command Dashboard Design

**Date**: 2025-12-20
**Status**: Approved
**Goal**: Transform header into Star Trek LCARS-style network health dashboard with real-time metrics and sparkline trends

---

## Overview

Replace the current header with an immersive command center inspired by Star Trek LCARS interface. The dashboard provides at-a-glance network health confidence for investors and operators, featuring:

- **Network Pulse**: Composite health score (0-100%)
- **Five Key Metrics**: Nodes, Finalization, Latency, Packets, Consensus
- **15-Minute Sparklines**: Real-time trend visualization
- **LCARS Aesthetic**: Bold geometric panels, vibrant colors on black

## Layout Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│ ┌──────┐ CONCORDIUM          ┌─────────────────────────────────────┐│
│ │ LOGO │ NETWORK COMMAND     │  NETWORK PULSE  ████████░░ 94%     ││
│ └──────┘                     │  ▁▂▃▄▅▆▇█▇▆▅▄▃▂▁ (15min)          ││
│ ┌────────────┬────────────┬──┴──────────┬───────────┬─────────────┐│
│ │ NODES      │ FINALIZE   │ AVG LATENCY │ PACKETS   │ CONSENSUS   ││
│ │ ●157       │ ●2.4s      │ ●48ms       │ ●1.2M/s   │ ●98.7%      ││
│ │ ▂▃▄▅▆▇█▇▆▅ │ ▅▄▃▂▂▃▄▅▆▇ │ ▃▃▄▄▃▃▄▄▃▃ │ ▆▇█▇▆▅▆▇█ │ ▇▇▇▇▇▇▇▇▇▇ ││
│ └────────────┴────────────┴─────────────┴───────────┴─────────────┘│
│                                              [TOPOLOGY] [GEOGRAPHIC]│
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component 1: Network Pulse

The hero metric answering "Is the network healthy?"

### Score Calculation

```typescript
networkPulse = weighted average of:
  - Finalization health (40%): 100% if < 3s, degrades linearly to 0% at 10s
  - Latency health (30%): 100% if avg < 50ms, degrades to 0% at 500ms
  - Consensus health (30%): direct % of nodes with consensusRunning=true
```

### Visual Treatment

```
┌─────────────────────────────────────┐
│  N E T W O R K   P U L S E         │ ← Amber panel header
├─────────────────────────────────────┤
│                                     │
│      ████████████░░░░  94%         │ ← Cyan segmented bar
│                                     │
│   ▁▂▃▄▅▆▇█▇▆▅▄▃▂▁▂▃▄▅▆▇█▇▆▅▄▃▂▁   │ ← 15min sparkline
│                                     │
│   ● NOMINAL                         │ ← Status text (pulsing)
└─────────────────────────────────────┘
```

### Status States

| Score | Label | Color | Effect |
|-------|-------|-------|--------|
| 95-100% | NOMINAL | Cyan | Pulsing glow |
| 80-94% | ELEVATED | Amber | Steady |
| 60-79% | DEGRADED | Magenta | Attention animation |
| <60% | CRITICAL | Red | Flashing border |

---

## Component 2: LCARS Metric Panels

Five key metrics in distinctive LCARS-style panels.

### Panel Structure

```
╭────────────────╮
│░░░░ NODES ░░░░░│ ← Colored header tab (amber)
├────────────────┤
│                │
│     ●157       │ ← Large value with status dot
│                │
│ ▂▃▄▅▆▇█▇▆▅▄▃▂▁ │ ← 15min sparkline
│                │
│ +3 ▲           │ ← Delta indicator
╰────────────────╯
```

### Metrics & Thresholds

| Panel | Data Source | Green | Amber | Red |
|-------|-------------|-------|-------|-----|
| NODES | `totalNodes` count | >100 | 50-100 | <50 |
| FINALIZE | `finalizationPeriodEMA` avg | <3s | 3-6s | >6s |
| LATENCY | `blockArriveLatencyEMA` avg | <50ms | 50-200ms | >200ms |
| PACKETS | `packetsSent + packetsReceived` | (throughput display) | - | - |
| CONSENSUS | `% consensusRunning=true` | >95% | 80-95% | <80% |

### LCARS Styling

- Asymmetric rounded corners: `20px 5px 20px 5px`
- Header tabs extend beyond panel edge
- Subtle inner glow on hover
- Status dot pulses when value changes

---

## Component 3: Sparkline System

### Data Architecture

```typescript
interface MetricHistory {
  timestamp: number;
  nodes: number;
  finalizationTime: number;
  latency: number;
  packets: number;
  consensus: number;
  pulse: number;  // computed
}

// Rolling buffer: 180 entries (15min × 12 per minute = 5s intervals)
const MAX_HISTORY = 180;
```

### Update Strategy

- Poll API every 5 seconds
- Push new metrics to history buffer
- Trim buffer when exceeding MAX_HISTORY
- Sparklines re-render on each update

### Sparkline Rendering

```typescript
const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

function toSparkline(values: number[], min: number, max: number): string {
  return values.map(v => {
    const normalized = (v - min) / (max - min);
    const index = Math.floor(normalized * 7);
    return blocks[Math.max(0, Math.min(7, index))];
  }).join('');
}
```

### Display Compression

- 180 data points → ~30 visible characters
- Take max value per 6-point bucket (shows peaks)
- Ensures spikes are visible, not smoothed away

---

## Visual Implementation

### LCARS Color Palette

```css
:root {
  /* LCARS Colors */
  --lcars-amber: #FF9900;
  --lcars-orange: #FF7700;
  --lcars-cyan: #00FFFF;
  --lcars-magenta: #FF00FF;
  --lcars-blue: #9999FF;
  --lcars-peach: #FFAA66;

  /* Panel backgrounds */
  --lcars-panel-bg: rgba(20, 20, 40, 0.9);
  --lcars-border-radius: 20px 5px 20px 5px;
}
```

### Key Visual Effects

- **Header tabs**: Solid amber with `clip-path` for angular cutout
- **Glow states**: `box-shadow` with color matching status
- **Animations**: Subtle pulse on status dots, smooth sparkline transitions
- **Typography**: Monospace with wide letter-spacing
- **Scanlines**: Existing effect compatible with LCARS

### Responsive Behavior

| Breakpoint | Layout |
|------------|--------|
| Desktop | Full 5-panel row |
| Tablet | 3+2 panel stack |
| Mobile | Vertical stack, Network Pulse prominent |

---

## Files to Create/Modify

### New Files
- `src/components/dashboard/NetworkPulse.tsx`
- `src/components/dashboard/LcarsPanel.tsx`
- `src/components/dashboard/Sparkline.tsx`
- `src/components/dashboard/CommandHeader.tsx`
- `src/hooks/useMetricHistory.ts`
- `src/lib/pulse.ts` (calculation logic)

### Modified Files
- `src/app/globals.css` (LCARS variables and styles)
- `src/app/page.tsx` (replace header with CommandHeader)
- `src/lib/transforms.ts` (add new metric fields)

---

## Success Criteria

1. Network Pulse score visible within 1 second of page load
2. Sparklines update smoothly every 5 seconds
3. Status colors change appropriately based on thresholds
4. Visual style unmistakably "Star Trek LCARS"
5. Investors immediately understand network is healthy/unhealthy
6. Works on desktop and mobile

---

## Future Enhancements (Out of Scope)

- Backend persistence for metric history
- Audio alerts for status changes
- Baker leaderboard panel
- Customizable thresholds
- Dark/light theme toggle
