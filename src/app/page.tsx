'use client';

import dynamic from 'next/dynamic';
import { useAppStore } from '@/hooks/useAppStore';
import { ViewToggle } from '@/components/map/ViewToggle';
import { NodeDetailPanel } from '@/components/panels/NodeDetailPanel';
import { MetricsBar } from '@/components/panels/MetricsBar';
import { Network } from 'lucide-react';

// Dynamic imports for heavy map components
const TopologyGraph = dynamic(
  () => import('@/components/map/TopologyGraph').then((m) => ({ default: m.TopologyGraph })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-muted/20">
        <p className="text-muted-foreground">Loading topology view...</p>
      </div>
    ),
  }
);

const GeographicMap = dynamic(
  () => import('@/components/map/GeographicMap').then((m) => ({ default: m.GeographicMap })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-muted/20">
        <p className="text-muted-foreground">Loading geographic view...</p>
      </div>
    ),
  }
);

export default function Home() {
  const { currentView, isPanelOpen } = useAppStore();

  return (
    <main className="h-screen w-screen flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <Network className="h-6 w-6 text-primary" />
          <h1 className="font-semibold text-lg">Concordium Network Map</h1>
        </div>
        <ViewToggle />
      </header>

      {/* Main content */}
      <div className="flex-1 relative">
        {/* Map container */}
        <div
          className="absolute inset-0 transition-all duration-300"
          style={{
            right: isPanelOpen ? '20rem' : 0,
          }}
        >
          {currentView === 'topology' ? <TopologyGraph /> : <GeographicMap />}
        </div>

        {/* Detail panel */}
        <NodeDetailPanel />
      </div>

      {/* Metrics bar */}
      <MetricsBar />
    </main>
  );
}
