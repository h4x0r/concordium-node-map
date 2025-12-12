'use client';

import { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { useNodes } from '@/hooks/useNodes';
import { useAppStore } from '@/hooks/useAppStore';
import { toLeafletMarkers, type RegionCluster } from '@/lib/geo-inference';
import { calculateNodeHealth } from '@/lib/transforms';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function LoadingSkeleton() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-muted/20">
      <div className="text-center space-y-4">
        <Skeleton className="w-64 h-40 mx-auto rounded-lg" />
        <p className="text-muted-foreground text-sm">Loading geographic view...</p>
      </div>
    </div>
  );
}

interface ClusterMarkerProps {
  cluster: RegionCluster;
  maxHeight: number;
  onNodeSelect: (nodeId: string) => void;
}

function ClusterMarker({ cluster, maxHeight, onNodeSelect }: ClusterMarkerProps) {
  const healthCounts = useMemo(() => {
    const counts = { healthy: 0, lagging: 0, issue: 0 };
    for (const node of cluster.nodes) {
      const health = calculateNodeHealth(node, maxHeight);
      counts[health]++;
    }
    return counts;
  }, [cluster.nodes, maxHeight]);

  // Determine overall cluster color based on majority health
  const primaryColor =
    healthCounts.healthy >= healthCounts.lagging && healthCounts.healthy >= healthCounts.issue
      ? '#22c55e'
      : healthCounts.lagging >= healthCounts.issue
        ? '#eab308'
        : '#ef4444';

  // Size based on node count
  const radius = Math.min(30, Math.max(10, cluster.nodes.length * 2));

  return (
    <CircleMarker
      center={[cluster.lat, cluster.lng]}
      radius={radius}
      pathOptions={{
        fillColor: primaryColor,
        fillOpacity: 0.7,
        color: primaryColor,
        weight: 2,
      }}
    >
      <Popup>
        <div className="min-w-48 space-y-2">
          <div className="font-semibold">{cluster.label}</div>
          <div className="text-sm text-muted-foreground">
            {cluster.nodes.length} node{cluster.nodes.length !== 1 ? 's' : ''}
          </div>
          <div className="flex gap-2 text-xs">
            {healthCounts.healthy > 0 && (
              <Badge className="bg-green-500">{healthCounts.healthy} healthy</Badge>
            )}
            {healthCounts.lagging > 0 && (
              <Badge className="bg-yellow-500">{healthCounts.lagging} lagging</Badge>
            )}
            {healthCounts.issue > 0 && (
              <Badge className="bg-red-500">{healthCounts.issue} issues</Badge>
            )}
          </div>
          <div className="border-t pt-2 max-h-32 overflow-y-auto">
            <div className="text-xs text-muted-foreground mb-1">Nodes:</div>
            <div className="space-y-1">
              {cluster.nodes.slice(0, 10).map((node) => {
                const health = calculateNodeHealth(node, maxHeight);
                return (
                  <button
                    key={node.nodeId}
                    onClick={() => onNodeSelect(node.nodeId)}
                    className={cn(
                      'block w-full text-left text-xs px-2 py-1 rounded hover:bg-muted truncate',
                      health === 'healthy' && 'border-l-2 border-green-500',
                      health === 'lagging' && 'border-l-2 border-yellow-500',
                      health === 'issue' && 'border-l-2 border-red-500'
                    )}
                  >
                    {node.nodeName}
                  </button>
                );
              })}
              {cluster.nodes.length > 10 && (
                <div className="text-xs text-muted-foreground pl-2">
                  +{cluster.nodes.length - 10} more...
                </div>
              )}
            </div>
          </div>
        </div>
      </Popup>
    </CircleMarker>
  );
}

function MapContent() {
  const { data: nodes, isLoading } = useNodes();
  const { selectNode, setView } = useAppStore();

  const { markers, maxHeight } = useMemo(() => {
    if (!nodes) return { markers: [], maxHeight: 0 };
    const max = Math.max(...nodes.map((n) => n.finalizedBlockHeight));
    return {
      markers: toLeafletMarkers(nodes),
      maxHeight: max,
    };
  }, [nodes]);

  const handleNodeSelect = (nodeId: string) => {
    selectNode(nodeId);
    setView('topology'); // Switch to topology to see the selected node
  };

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {markers.map((cluster) => (
        <ClusterMarker
          key={cluster.region}
          cluster={cluster}
          maxHeight={maxHeight}
          onNodeSelect={handleNodeSelect}
        />
      ))}
    </>
  );
}

export function GeographicMap() {
  return (
    <div className="w-full h-full relative">
      {/* Disclaimer */}
      <div className="absolute top-4 left-4 z-[1000] bg-background/90 backdrop-blur px-3 py-1.5 rounded-lg text-xs text-muted-foreground border">
        Locations are approximate, inferred from node names
      </div>

      <MapContainer
        center={[30, 0]}
        zoom={2}
        className="w-full h-full"
        scrollWheelZoom={true}
      >
        <MapContent />
      </MapContainer>
    </div>
  );
}
