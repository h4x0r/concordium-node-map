# Concordium Network Map - Design Document

**Date**: 2025-12-12
**Status**: Approved
**Data Source**: https://dashboard.mainnet.concordium.software/nodesSummary

## Overview

A production-ready network visualization dashboard for the Concordium blockchain, featuring hybrid topology/geographic views, real-time monitoring, and network health analytics.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Visualization type | Hybrid (topology + geographic) | Topology shows actual connections; geographic provides context |
| Primary use case | Full dashboard (monitoring, exploration, analytics) | Comprehensive operational tool |
| Topology library | React Flow | React-native, shadcn-compatible, modern API |
| Geographic library | React Leaflet | Free, well-maintained, good React integration |
| Data refresh | Hybrid (30s auto + manual) | Balance freshness with API load |
| Geographic accuracy | Approximate clustering | API lacks coordinates; focus accuracy on topology |
| Analytics focus | Network health metrics | Most actionable for monitoring |
| Layout | Map-centric (70% map) | Keeps focus on network visualization |

## Tech Stack

- **Next.js 14+** with App Router
- **React Flow** for topology graph
- **React Leaflet** for geographic view
- **shadcn/ui** for all UI components
- **TanStack Query** for data fetching, caching, auto-refresh
- **Zustand** for lightweight global state
- **Tailwind CSS** for styling
- **Vitest** + **React Testing Library** for unit/component tests
- **Playwright** for E2E tests

## Project Structure

```
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx              # Main dashboard
│   └── api/
│       └── nodes/route.ts    # Proxy to avoid CORS
├── components/
│   ├── ui/                   # shadcn components
│   ├── map/
│   │   ├── TopologyGraph.tsx
│   │   ├── GeographicMap.tsx
│   │   └── ViewToggle.tsx
│   ├── panels/
│   │   ├── NodeDetailPanel.tsx
│   │   └── MetricsBar.tsx
│   └── shared/
│       └── RefreshIndicator.tsx
├── lib/
│   ├── api.ts               # Fetch logic
│   ├── transforms.ts        # API → React Flow/Leaflet
│   └── geo-inference.ts     # Name → approximate region
├── hooks/
│   └── useNodes.ts          # TanStack Query hook
└── types/
    └── node.ts              # TypeScript interfaces
```

## Data Flow

1. `useNodes` hook fetches from `/api/nodes` (our proxy)
2. Proxy fetches from Concordium API, caches response
3. Transform functions convert raw data to React Flow nodes/edges and Leaflet markers
4. Components subscribe to Zustand store for selected node state

## Component Specifications

### TopologyGraph.tsx (React Flow)

Force-directed graph showing actual network connections:

- **Nodes**: Each Concordium node as custom React Flow node
  - Color-coded by status: green (healthy), yellow (lagging), red (issue)
  - Size scaled by peer count
  - Icon badge for bakers vs regular nodes
- **Edges**: Lines from `peersList` connections
  - Thickness based on connection quality (ping times)
  - Animated flow direction
- **Interactions**: Click to select, hover for quick stats, zoom/pan, minimap

### GeographicMap.tsx (React Leaflet)

Approximate world map clustering:

- **Clustering strategy**: Parse node names for location hints → map to predefined regions
  - Known patterns: "London", "NL", "Nordic", "US", etc.
  - Unknown nodes → "Unlocated" cluster
- **Markers**: Clustered circles showing node count per region
  - Click cluster to expand individual nodes
  - Same color-coding as topology view
- **Disclaimer**: Label "Locations approximate based on node names"

### ViewToggle.tsx

- Two buttons: "Topology" (default) | "Geographic"
- Smooth transition between views
- Both views share selection state

### NodeDetailPanel.tsx (Collapsible Side Panel)

Right-side panel, ~30% width, slides in when node selected:

- **Header**: Node name, status badge, close button
- **Sections** (accordion-style):
  - **Overview**: Client version, uptime, peer type, consensus status
  - **Connectivity**: Peer count, peers list (clickable), avg ping, bandwidth
  - **Blockchain State**: Best block height, finalized height, blocks behind
  - **Performance**: Block arrival EMA, latency, transactions per block
  - **Baker Info** (if applicable): Committee membership, baker ID
- **Actions**: "View peers" button highlights connected nodes

### MetricsBar.tsx (Bottom Bar)

Persistent bottom bar, ~80px height:

- **4 metric cards**:
  - Total nodes online (with trend arrow)
  - Avg peer connections
  - Finalization lag (highest blocks-behind)
  - Consensus participation %
- **Data freshness**: "Updated 12s ago" with refresh button
- **Auto-refresh indicator**: Progress bar to next refresh

## Data Handling

### API Proxy Route

```typescript
// /api/nodes/route.ts
export async function GET() {
  const res = await fetch(
    'https://dashboard.mainnet.concordium.software/nodesSummary',
    { next: { revalidate: 10 } }
  );
  const data = await res.json();
  return Response.json(data);
}
```

### useNodes Hook

```typescript
const { data, isLoading, isError, dataUpdatedAt, refetch } = useNodes({
  refetchInterval: 30_000,  // 30 seconds auto-refresh
  staleTime: 10_000,        // Consider fresh for 10s
  retry: 3,                 // Retry failed requests
});
```

### Transform Functions

- `toReactFlowNodes()`: API nodes → React Flow nodes with force-layout positions
- `toReactFlowEdges()`: Build edges from `peersList`, deduplicate bidirectional
- `toLeafletMarkers()`: Group by inferred region, return clustered markers

## Error Handling

| State | Behavior |
|-------|----------|
| Loading | Skeleton UI with shimmer effect |
| Error | Full-screen error with retry, preserve last data if available |
| Partial failure | Filter bad nodes, show warning badge |
| Offline | Detect via `navigator.onLine`, show banner with cached data |

## Testing Strategy

### Unit Tests (Vitest)

- `transforms.ts`: API data → React Flow/Leaflet formats
- `geo-inference.ts`: Name parsing accuracy
- Metric calculation utilities

### Component Tests (React Testing Library)

- MetricsBar renders correct values
- NodeDetailPanel shows/hides on selection
- ViewToggle switches views

### E2E Tests (Playwright)

- Dashboard loads and displays nodes
- Click node → panel opens with correct data
- Refresh button works
- View toggle functions

## Responsive Design

| Breakpoint | Layout |
|------------|--------|
| Desktop (1024px+) | Full layout as designed |
| Tablet (768-1023px) | Side panel → bottom sheet, metrics scroll horizontal |
| Mobile (< 768px) | Full-screen map, FAB for metrics, bottom sheet for details |

## Production Checklist

- [ ] Error boundaries around map components
- [ ] SEO meta tags and OpenGraph image
- [ ] Dynamic imports for React Flow and Leaflet
- [ ] Keyboard navigation in graph
- [ ] ARIA labels on metrics
- [ ] Dark mode support via shadcn theme

## API Data Structure Reference

Key fields from `/nodesSummary`:

```typescript
interface ConcordiumNode {
  nodeName: string;
  nodeId: string;
  peerType: string;
  client: string;
  peersCount: number;
  peersList: string[];
  averagePing: number;
  averageBytesPerSecondIn: number;
  averageBytesPerSecondOut: number;
  bestBlock: string;
  bestBlockHeight: number;
  finalizedBlock: string;
  finalizedBlockHeight: number;
  consensusRunning: boolean;
  bakingCommitteeMember: string;
  finalizationCommitteeMember: boolean;
  consensusBakerId: number | null;
  uptime: number;
  // ... additional metrics
}
```
