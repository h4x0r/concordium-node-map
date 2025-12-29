'use client';

import { useNodeFilter } from '@/hooks/useNodeFilter';
import { cn } from '@/lib/utils';
import type { NodeTier, NodeHealth } from '@/lib/transforms';

const TIER_OPTIONS: { value: NodeTier; label: string; color: string }[] = [
  { value: 'baker', label: 'BAKER', color: 'rgb(168, 85, 247)' },
  { value: 'hub', label: 'HUB', color: 'var(--bb-cyan)' },
  { value: 'standard', label: 'STD', color: 'var(--bb-green)' },
  { value: 'edge', label: 'EDGE', color: 'var(--bb-amber)' },
];

const HEALTH_OPTIONS: { value: NodeHealth; label: string; color: string }[] = [
  { value: 'healthy', label: '●', color: 'var(--bb-green)' },
  { value: 'lagging', label: '●', color: 'var(--bb-amber)' },
  { value: 'issue', label: '●', color: 'var(--bb-red)' },
];

export function NodeFilterPanel() {
  const { tiers, health, toggleTier, toggleHealth, clearFilters, hasActiveFilters } = useNodeFilter();

  return (
    <div
      className="absolute z-10 flex items-center gap-2 px-2 py-1 bg-[var(--bb-black)]/90 border border-[var(--bb-border)] rounded"
      style={{ bottom: 140, left: 20 }}
    >
      {/* Tier filters */}
      <div className="flex items-center gap-1">
        <span className="text-[9px] font-mono text-[var(--bb-gray)] mr-1">TIER:</span>
        {TIER_OPTIONS.map((tier) => {
          const isActive = tiers.includes(tier.value);
          return (
            <button
              key={tier.value}
              onClick={() => toggleTier(tier.value)}
              className={cn(
                'px-1.5 py-0.5 text-[9px] font-mono font-bold rounded transition-all',
                isActive
                  ? 'opacity-100'
                  : 'opacity-40 hover:opacity-70'
              )}
              style={{
                color: isActive ? 'var(--bb-black)' : tier.color,
                backgroundColor: isActive ? tier.color : 'transparent',
                border: `1px solid ${tier.color}`,
              }}
              title={`Filter by ${tier.label} tier`}
            >
              {tier.label}
            </button>
          );
        })}
      </div>

      <div className="w-px h-4 bg-[var(--bb-border)]" />

      {/* Health filters */}
      <div className="flex items-center gap-1">
        <span className="text-[9px] font-mono text-[var(--bb-gray)] mr-1">HEALTH:</span>
        {HEALTH_OPTIONS.map((h) => {
          const isActive = health.includes(h.value);
          return (
            <button
              key={h.value}
              onClick={() => toggleHealth(h.value)}
              className={cn(
                'w-5 h-5 flex items-center justify-center text-sm rounded transition-all',
                isActive
                  ? 'opacity-100 ring-1 ring-white/50'
                  : 'opacity-40 hover:opacity-70'
              )}
              style={{ color: h.color }}
              title={`Filter by ${h.value} health`}
            >
              {h.label}
            </button>
          );
        })}
      </div>

      {/* Clear button */}
      {hasActiveFilters() && (
        <>
          <div className="w-px h-4 bg-[var(--bb-border)]" />
          <button
            onClick={clearFilters}
            className="px-1.5 py-0.5 text-[9px] font-mono text-[var(--bb-red)] hover:bg-[var(--bb-red)]/20 rounded transition-all"
            title="Clear all filters"
          >
            ✕ CLEAR
          </button>
        </>
      )}
    </div>
  );
}
