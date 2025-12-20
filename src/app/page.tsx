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
          <div className="relative logo-glow">
            <svg
              width="36"
              height="36"
              viewBox="0 0 170 169"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M25.9077 84.5718C25.9077 116.886 52.3315 143.06 84.9828 143.06C93.7219 143.06 102.014 141.105 109.48 137.743V165.186C101.739 167.485 93.5155 168.754 84.9828 168.754C38.053 168.754 0 131.088 0 84.5718C0 38.0553 38.053 0.389404 85.0172 0.389404C93.5499 0.389404 101.739 1.65866 109.514 3.95703V31.4003C102.048 28.0042 93.7563 26.0832 85.0172 26.0832C52.4003 26.0832 25.9421 52.2573 25.9421 84.5718H25.9077ZM84.9828 120.214C65.0961 120.214 48.9597 104.262 48.9597 84.5375C48.9597 64.8126 65.0961 48.8611 84.9828 48.8611C104.869 48.8611 121.006 64.8469 121.006 84.5375C121.006 104.228 104.869 120.214 84.9828 120.214ZM162.018 120.214H131.741C139.413 110.334 144.058 98.019 144.058 84.5718C144.058 71.1245 139.413 58.775 131.706 48.8955H161.983C167.11 59.7356 170 71.8106 170 84.5718C170 97.3329 167.11 109.408 161.983 120.214"
                fill="var(--concordium-teal)"
              />
            </svg>
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
