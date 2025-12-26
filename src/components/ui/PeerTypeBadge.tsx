'use client';

import { cn } from '@/lib/utils';

export type PeerSource = 'reporting' | 'grpc' | 'inferred';

interface PeerTypeBadgeProps {
  source: PeerSource;
  isBootstrapper?: boolean;
  className?: string;
}

/**
 * Badge component for displaying peer source type with visual differentiation
 */
export function PeerTypeBadge({
  source,
  isBootstrapper,
  className,
}: PeerTypeBadgeProps) {
  const sourceConfig = {
    reporting: {
      label: 'REPORTING',
      bgClass: 'bg-[var(--bb-cyan)]/20',
      textClass: 'text-[var(--bb-cyan)]',
      borderClass: 'border-[var(--bb-cyan)]/50',
      description: 'Actively reports to dashboard',
    },
    grpc: {
      label: 'gRPC',
      bgClass: 'bg-purple-500/20',
      textClass: 'text-purple-400',
      borderClass: 'border-purple-500/50',
      description: 'Discovered via gRPC',
    },
    inferred: {
      label: 'EXT',
      bgClass: 'bg-amber-500/20',
      textClass: 'text-amber-400',
      borderClass: 'border-amber-500/50',
      description: 'External node (inferred)',
    },
  };

  const config = sourceConfig[source];

  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      <span
        className={cn(
          'px-1.5 py-0.5 text-[10px] font-mono font-bold tracking-wide rounded border',
          config.bgClass,
          config.textClass,
          config.borderClass
        )}
        title={config.description}
      >
        {config.label}
      </span>
      {isBootstrapper && (
        <span
          className="px-1 py-0.5 text-[9px] font-mono font-bold tracking-wide rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/50"
          title="Bootstrap node - high connectivity"
        >
          BOOT
        </span>
      )}
    </div>
  );
}

/**
 * Legend component showing all peer types
 */
export function PeerTypeLegend({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-2 text-[10px] font-mono', className)}>
      <div className="flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-[var(--bb-cyan)]" />
        <span className="text-[var(--bb-gray)]">Reporting</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-purple-500" />
        <span className="text-[var(--bb-gray)]">gRPC</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-amber-500" />
        <span className="text-[var(--bb-gray)]">EXT</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/30" />
        <span className="text-[var(--bb-gray)]">Bootstrap</span>
      </div>
    </div>
  );
}
