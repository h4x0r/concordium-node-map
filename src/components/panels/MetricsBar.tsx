'use client';

import { useNetworkMetrics } from '@/hooks/useNodes';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, Activity, Users, Clock, Shield } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

function formatTimeSince(timestamp: number): string {
  if (!timestamp) return 'Never';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  suffix?: string;
  highlight?: boolean;
}

function MetricCard({ icon, label, value, suffix, highlight }: MetricCardProps) {
  return (
    <div
      className={cn(
        'metric-card flex items-center gap-3 px-4 py-2.5 rounded bg-card/30 backdrop-blur-sm corner-decor',
        highlight && 'glow-teal'
      )}
    >
      <div className="text-[var(--concordium-teal)] opacity-80">{icon}</div>
      <div className="flex flex-col">
        <span className="text-[10px] font-mono text-muted-foreground tracking-wider uppercase">
          {label}
        </span>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-mono font-bold text-foreground data-readout">
            {value}
          </span>
          {suffix && (
            <span className="text-sm font-mono text-[var(--concordium-teal)]">{suffix}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCardSkeleton() {
  return (
    <div className="metric-card flex items-center gap-3 px-4 py-2.5 rounded bg-card/30 backdrop-blur-sm">
      <Skeleton className="h-5 w-5 rounded bg-muted/50" />
      <div className="flex flex-col gap-1">
        <Skeleton className="h-2.5 w-12 bg-muted/50" />
        <Skeleton className="h-6 w-10 bg-muted/50" />
      </div>
    </div>
  );
}

export function MetricsBar() {
  const { metrics, isLoading, dataUpdatedAt } = useNetworkMetrics();
  const queryClient = useQueryClient();
  const [timeSince, setTimeSince] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Update time since every second
  useEffect(() => {
    const updateTime = () => setTimeSince(formatTimeSince(dataUpdatedAt));
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [dataUpdatedAt]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['nodes'] });
    setTimeout(() => setIsRefreshing(false), 500);
  };

  if (isLoading || !metrics) {
    return (
      <div
        data-testid="metrics-loading"
        className="h-20 bg-background/80 backdrop-blur-sm border-t border-[var(--concordium-teal)]/20 shrink-0"
      >
        <div className="h-full max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex gap-4">
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-24 bg-muted/50" />
            <Button
              variant="outline"
              size="sm"
              disabled
              className="btn-cyber opacity-50"
              aria-label="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-20 bg-background/80 backdrop-blur-sm border-t border-[var(--concordium-teal)]/20 shrink-0 relative">
      {/* Top border glow */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--concordium-teal)]/50 to-transparent" />

      <div className="h-full max-w-7xl mx-auto px-6 flex items-center justify-between">
        <div className="flex gap-4">
          <MetricCard
            icon={<Activity className="h-5 w-5" />}
            label="Nodes"
            value={metrics.totalNodes}
            highlight
          />
          <MetricCard
            icon={<Users className="h-5 w-5" />}
            label="Avg Peers"
            value={metrics.avgPeers}
          />
          <MetricCard
            icon={<Clock className="h-5 w-5" />}
            label="Max Lag"
            value={metrics.maxFinalizationLag.toLocaleString()}
          />
          <MetricCard
            icon={<Shield className="h-5 w-5" />}
            label="Consensus"
            value={metrics.consensusParticipation}
            suffix="%"
          />
        </div>

        <div className="flex items-center gap-4">
          {/* Last updated indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-border/50 bg-card/20">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--concordium-teal)] data-pulse" />
            <span className="text-xs font-mono text-muted-foreground tracking-wide">
              SYNCED {timeSince.toUpperCase()}
            </span>
          </div>

          {/* Refresh button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="btn-cyber h-9 px-4 font-mono text-xs tracking-wider"
            aria-label="Refresh"
          >
            <RefreshCw
              className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')}
            />
            REFRESH
          </Button>
        </div>
      </div>
    </div>
  );
}
