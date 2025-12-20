'use client';

import dynamic from 'next/dynamic';
import { useAppStore } from '@/hooks/useAppStore';
import { ViewToggle } from '@/components/map/ViewToggle';
import { NodeDetailPanel } from '@/components/panels/NodeDetailPanel';
import { MetricsBar } from '@/components/panels/MetricsBar';

// Dynamic imports for heavy map components
const TopologyGraph = dynamic(
  () => import('@/components/map/TopologyGraph').then((m) => ({ default: m.TopologyGraph })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-2 border-[var(--concordium-teal)] opacity-20" />
            <div className="absolute inset-0 rounded-full border-2 border-[var(--concordium-teal)] border-t-transparent animate-spin" />
          </div>
          <p className="text-muted-foreground font-mono text-sm tracking-wider">
            INITIALIZING TOPOLOGY VIEW<span className="cursor-blink" />
          </p>
        </div>
      </div>
    ),
  }
);

const GeographicMap = dynamic(
  () => import('@/components/map/GeographicMap').then((m) => ({ default: m.GeographicMap })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-2 border-[var(--concordium-teal)] opacity-20" />
            <div className="absolute inset-0 rounded-full border-2 border-[var(--concordium-teal)] border-t-transparent animate-spin" />
          </div>
          <p className="text-muted-foreground font-mono text-sm tracking-wider">
            INITIALIZING GEOGRAPHIC VIEW<span className="cursor-blink" />
          </p>
        </div>
      </div>
    ),
  }
);

export default function Home() {
  const { currentView, isPanelOpen } = useAppStore();

  return (
    <main className="h-screen w-screen flex flex-col overflow-hidden bg-background cyber-grid scan-lines">
      {/* Header */}
      <header className="h-16 header-glow flex items-center justify-between px-6 shrink-0 bg-background/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-4">
          {/* Logo with glow effect */}
          <div className="relative">
            <img
              src="/concordium-logo.svg"
              alt="Concordium"
              width={36}
              height={36}
              className="logo-glow"
              style={{ filter: 'brightness(1.2)' }}
            />
          </div>

          {/* Title */}
          <div className="flex flex-col">
            <h1 className="font-mono font-bold text-lg tracking-wide text-glow" style={{ color: 'var(--concordium-teal)' }}>
              CONCORDIUM
            </h1>
            <span className="text-[10px] font-mono text-muted-foreground tracking-[0.3em] -mt-1">
              NETWORK MAP
            </span>
          </div>

          {/* Status indicator */}
          <div className="flex items-center gap-2 ml-6 px-3 py-1.5 rounded border border-[var(--concordium-teal)]/30 bg-[var(--concordium-teal)]/5">
            <div className="w-2 h-2 rounded-full bg-[var(--concordium-teal)] status-pulse" />
            <span className="text-xs font-mono text-[var(--concordium-teal)] tracking-wider">LIVE</span>
          </div>
        </div>

        <ViewToggle />
      </header>

      {/* Main content - map area */}
      <div className="flex-1 relative min-h-0 overflow-hidden">
        <div
          className="h-full w-full transition-all duration-300"
          style={{
            paddingRight: isPanelOpen ? '24rem' : 0,
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
