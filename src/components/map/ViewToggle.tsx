'use client';

import { useAppStore, type ViewType } from '@/hooks/useAppStore';
import { Network, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ViewToggle() {
  const { currentView, setView } = useAppStore();

  const views: { value: ViewType; label: string; icon: React.ReactNode }[] = [
    { value: 'topology', label: 'TOPOLOGY', icon: <Network className="h-4 w-4" /> },
    { value: 'geographic', label: 'GEOGRAPHIC', icon: <Globe className="h-4 w-4" /> },
  ];

  return (
    <div className="flex bg-card/30 backdrop-blur-sm rounded border border-border/50 p-1">
      {views.map((view) => (
        <button
          key={view.value}
          onClick={() => setView(view.value)}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded font-mono text-xs tracking-wider transition-all duration-200',
            currentView === view.value
              ? 'bg-[var(--concordium-teal)]/20 text-[var(--concordium-teal)] border border-[var(--concordium-teal)]/50 shadow-[0_0_10px_var(--concordium-teal-dim)]'
              : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
          )}
        >
          <span className={cn(
            'transition-all',
            currentView === view.value && 'drop-shadow-[0_0_5px_var(--concordium-teal-glow)]'
          )}>
            {view.icon}
          </span>
          {view.label}
        </button>
      ))}
    </div>
  );
}
