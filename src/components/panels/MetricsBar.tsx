'use client';

import { useNetworkMetrics } from '@/hooks/useNodes';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, Activity, Users, Clock, Shield } from 'lucide-react';
import { useEffect, useState } from 'react';

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
}

function MetricCard({ icon, label, value, suffix }: MetricCardProps) {
  return (
    <Card className="flex items-center gap-3 px-4 py-2 bg-card/50 border-border/50">
      <div className="text-muted-foreground">{icon}</div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold">
          {value}
          {suffix}
        </div>
      </div>
    </Card>
  );
}

function MetricCardSkeleton() {
  return (
    <Card className="flex items-center gap-3 px-4 py-2 bg-card/50 border-border/50">
      <Skeleton className="h-5 w-5 rounded" />
      <div>
        <Skeleton className="h-3 w-12 mb-1" />
        <Skeleton className="h-6 w-8" />
      </div>
    </Card>
  );
}

export function MetricsBar() {
  const { metrics, isLoading, dataUpdatedAt } = useNetworkMetrics();
  const queryClient = useQueryClient();
  const [timeSince, setTimeSince] = useState('');

  // Update time since every second
  useEffect(() => {
    const updateTime = () => setTimeSince(formatTimeSince(dataUpdatedAt));
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [dataUpdatedAt]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['nodes'] });
  };

  if (isLoading || !metrics) {
    return (
      <div
        data-testid="metrics-loading"
        className="h-16 bg-background border-t border-border shrink-0"
      >
        <div className="h-full max-w-7xl mx-auto px-4 flex items-center justify-between">
          <div className="flex gap-4">
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-24" />
            <Button variant="outline" size="sm" disabled aria-label="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-16 bg-background border-t border-border shrink-0">
      <div className="h-full max-w-7xl mx-auto px-4 flex items-center justify-between">
        <div className="flex gap-4">
          <MetricCard
            icon={<Activity className="h-5 w-5" />}
            label="Nodes"
            value={metrics.totalNodes}
          />
          <MetricCard
            icon={<Users className="h-5 w-5" />}
            label="Avg Peers"
            value={metrics.avgPeers}
          />
          <MetricCard
            icon={<Clock className="h-5 w-5" />}
            label="Max Lag"
            value={metrics.maxFinalizationLag}
          />
          <MetricCard
            icon={<Shield className="h-5 w-5" />}
            label="Consensus"
            value={metrics.consensusParticipation}
            suffix="%"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Updated {timeSince}</span>
          <Button variant="outline" size="sm" onClick={handleRefresh} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
