'use client';

import { useAppStore, type ViewType } from '@/hooks/useAppStore';
import { Button } from '@/components/ui/button';
import { Network, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ViewToggle() {
  const { currentView, setView } = useAppStore();

  const views: { value: ViewType; label: string; icon: React.ReactNode }[] = [
    { value: 'topology', label: 'Topology', icon: <Network className="h-4 w-4" /> },
    { value: 'geographic', label: 'Geographic', icon: <Globe className="h-4 w-4" /> },
  ];

  return (
    <div className="flex bg-muted rounded-lg p-1">
      {views.map((view) => (
        <Button
          key={view.value}
          variant="ghost"
          size="sm"
          onClick={() => setView(view.value)}
          className={cn(
            'gap-2',
            currentView === view.value && 'bg-background shadow-sm'
          )}
        >
          {view.icon}
          {view.label}
        </Button>
      ))}
    </div>
  );
}
