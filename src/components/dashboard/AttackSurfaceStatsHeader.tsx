'use client';

import { RISK_LEVELS } from '@/lib/attack-surface';
import type { AttackSurfaceStats } from '@/lib/attack-surface';

interface AttackSurfaceStatsHeaderProps {
  stats: AttackSurfaceStats;
}

/**
 * Header component showing attack surface statistics
 */
export function AttackSurfaceStatsHeader({ stats }: AttackSurfaceStatsHeaderProps) {
  return (
    <div className="bb-panel-header dark flex items-center justify-between px-4 py-2">
      <div className="flex items-center gap-6">
        <span className="text-[var(--bb-cyan)] font-bold">ATTACK SURFACE</span>
        <span className="text-[var(--bb-gray)] text-xs">
          {stats.total} nodes • {stats.withIp} with IP • {stats.validators} validators
        </span>
      </div>
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[var(--bb-gray)]">RISK:</span>
          {stats.riskLevels.critical > 0 && (
            <span className="text-[var(--bb-red)]">
              {RISK_LEVELS.critical.emoji} {stats.riskLevels.critical} CRITICAL
            </span>
          )}
          {stats.riskLevels.high > 0 && (
            <span className="text-[var(--bb-amber)]">
              {RISK_LEVELS.high.emoji} {stats.riskLevels.high} HIGH
            </span>
          )}
          {stats.riskLevels.medium > 0 && (
            <span className="text-[var(--bb-amber)]">
              {RISK_LEVELS.medium.emoji} {stats.riskLevels.medium} MED
            </span>
          )}
          {stats.riskLevels.low > 0 && (
            <span className="text-[var(--bb-green)]">
              {RISK_LEVELS.low.emoji} {stats.riskLevels.low} LOW
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
