# Concordium Node Map - Project Overview

## Purpose
A real-time visualization dashboard for Concordium blockchain network nodes. The application displays:
- Geographic distribution of nodes on a world map
- Network topology graph showing peer connections
- Node metrics, health status, and validator information
- OSINT (Open Source Intelligence) data about nodes
- Historical tracking of network events

## Tech Stack
- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript (strict mode)
- **React**: React 19
- **State Management**: Zustand
- **Data Fetching**: TanStack React Query
- **Database**: Turso (libSQL edge database)
- **Styling**: Tailwind CSS v4
- **Mapping**: Leaflet + react-leaflet
- **Graph Visualization**: @xyflow/react, dagre, d3-force
- **UI Components**: Radix UI primitives
- **Testing**: Vitest (unit), Playwright (e2e)
- **Deployment**: Vercel with Cron Jobs

## Key Dependencies
- `@concordium/web-sdk` - Concordium blockchain SDK
- `@libsql/client` - Turso database client
- `zustand` - State management
- `@tanstack/react-query` - Server state management

## Project Structure
```
src/
├── app/              # Next.js App Router pages and API routes
│   ├── api/          # API endpoints (nodes, peers, validators, cron, etc.)
│   └── map/          # Map view page
├── components/       # React components
│   ├── dashboard/    # Dashboard widgets and panels
│   ├── deep-dive/    # Deep dive analysis components
│   ├── map/          # Map and topology visualization
│   ├── mobile/       # Mobile-specific components
│   ├── osint/        # OSINT display components
│   └── ui/           # Shared UI primitives
├── hooks/            # Custom React hooks
├── lib/              # Utilities and business logic
│   └── db/           # Database schema and trackers
└── types/            # TypeScript type definitions
```
