import type { ConcordiumNode } from './transforms';

export type Region =
  | 'north-america'
  | 'europe-west'
  | 'europe-north'
  | 'europe-east'
  | 'asia-east'
  | 'asia-south'
  | 'oceania'
  | 'south-america'
  | 'africa'
  | 'unknown';

interface RegionInfo {
  lat: number;
  lng: number;
  label: string;
}

export const REGIONS: Record<Region, RegionInfo> = {
  'north-america': { lat: 40.0, lng: -100.0, label: 'North America' },
  'europe-west': { lat: 48.0, lng: 2.0, label: 'Western Europe' },
  'europe-north': { lat: 60.0, lng: 10.0, label: 'Nordic' },
  'europe-east': { lat: 50.0, lng: 20.0, label: 'Eastern Europe' },
  'asia-east': { lat: 35.0, lng: 120.0, label: 'East Asia' },
  'asia-south': { lat: 20.0, lng: 78.0, label: 'South Asia' },
  oceania: { lat: -25.0, lng: 135.0, label: 'Oceania' },
  'south-america': { lat: -15.0, lng: -60.0, label: 'South America' },
  africa: { lat: 0.0, lng: 20.0, label: 'Africa' },
  unknown: { lat: 0.0, lng: 0.0, label: 'Unknown Location' },
};

// Pattern matching rules: [regex, region]
const LOCATION_PATTERNS: [RegExp, Region][] = [
  // Cities/Countries - Europe West
  [/london/i, 'europe-west'],
  [/paris/i, 'europe-west'],
  [/amsterdam/i, 'europe-west'],
  [/\bnl\b/i, 'europe-west'],
  [/berlin/i, 'europe-west'],
  [/germany/i, 'europe-west'],
  [/\bde\b/i, 'europe-west'],
  [/france/i, 'europe-west'],
  [/\bfr\b/i, 'europe-west'],
  [/switzerland/i, 'europe-west'],
  [/swiss/i, 'europe-west'],
  [/zurich/i, 'europe-west'],
  [/lugano/i, 'europe-west'],

  // Nordic
  [/nordic/i, 'europe-north'],
  [/sweden/i, 'europe-north'],
  [/norway/i, 'europe-north'],
  [/finland/i, 'europe-north'],
  [/denmark/i, 'europe-north'],
  [/stockholm/i, 'europe-north'],
  [/oslo/i, 'europe-north'],
  [/helsinki/i, 'europe-north'],
  [/copenhagen/i, 'europe-north'],

  // North America
  [/\bus\b/i, 'north-america'],
  [/usa/i, 'north-america'],
  [/america/i, 'north-america'],
  [/nyc/i, 'north-america'],
  [/new.?york/i, 'north-america'],
  [/chicago/i, 'north-america'],
  [/seattle/i, 'north-america'],
  [/california/i, 'north-america'],
  [/texas/i, 'north-america'],
  [/canada/i, 'north-america'],
  [/toronto/i, 'north-america'],
  [/vancouver/i, 'north-america'],
  [/\bca\b/i, 'north-america'],

  // Asia
  [/singapore/i, 'asia-south'],
  [/\bsg\b/i, 'asia-south'],
  [/india/i, 'asia-south'],
  [/mumbai/i, 'asia-south'],
  [/japan/i, 'asia-east'],
  [/tokyo/i, 'asia-east'],
  [/\bjp\b/i, 'asia-east'],
  [/korea/i, 'asia-east'],
  [/seoul/i, 'asia-east'],
  [/\bkr\b/i, 'asia-east'],
  [/china/i, 'asia-east'],
  [/hong.?kong/i, 'asia-east'],
  [/\bhk\b/i, 'asia-east'],
  [/taiwan/i, 'asia-east'],

  // Oceania
  [/australia/i, 'oceania'],
  [/sydney/i, 'oceania'],
  [/melbourne/i, 'oceania'],
  [/\bau\b/i, 'oceania'],

  // Known providers
  [/figment/i, 'north-america'],
  [/bitnordic/i, 'europe-north'],
  [/luganodes/i, 'europe-west'],
];

export function inferRegion(nodeName: string): Region {
  if (!nodeName) return 'unknown';

  for (const [pattern, region] of LOCATION_PATTERNS) {
    if (pattern.test(nodeName)) {
      return region;
    }
  }

  return 'unknown';
}

export interface RegionCluster {
  region: Region;
  lat: number;
  lng: number;
  label: string;
  nodes: ConcordiumNode[];
}

export function toLeafletMarkers(nodes: ConcordiumNode[]): RegionCluster[] {
  if (nodes.length === 0) return [];

  // Group nodes by region
  const regionMap = new Map<Region, ConcordiumNode[]>();

  for (const node of nodes) {
    const region = inferRegion(node.nodeName);
    const existing = regionMap.get(region) || [];
    existing.push(node);
    regionMap.set(region, existing);
  }

  // Convert to markers
  const markers: RegionCluster[] = [];

  for (const [region, regionNodes] of regionMap) {
    const regionInfo = REGIONS[region];
    markers.push({
      region,
      lat: regionInfo.lat,
      lng: regionInfo.lng,
      label: regionInfo.label,
      nodes: regionNodes,
    });
  }

  return markers;
}
