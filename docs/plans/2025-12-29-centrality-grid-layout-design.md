# Centrality-Based Grid Layout Design

**Date**: 2025-12-29
**Status**: Approved

## Overview

Redesign the topology visualization to use a grid layout where nodes are positioned by both tier (vertical) and betweenness centrality (horizontal), with vertically-aligned centrality columns across all tiers.

## Grid Layout Structure

### Axes

- **Y-axis (rows)**: 4 tiers - BAKER, HUB, STANDARD, EDGE (top to bottom)
- **X-axis (columns)**: 7 centrality buckets using fixed ranges:
  - 0.00-0.14, 0.14-0.28, 0.28-0.42, 0.42-0.57, 0.57-0.71, 0.71-0.86, 0.86-1.00

### Column Arrangement

Symmetric layout with highest centrality in center:
```
[0-0.14] [0.14-0.28] [0.28-0.42] [CENTER: 0.86+] [0.42-0.57] [0.57-0.71] [0.71-0.86]
```

Wait, that's not symmetric. Let me reconsider:
```
Left edge                    Center                    Right edge
[0-0.14] [0.14-0.28] [0.28-0.42] [0.42-0.57] [0.57-0.71] [0.71-0.86] [0.86-1.0]
  low                                                                    high
```

Actually, highest centrality nodes should be in the CENTER visually:
```
[0-0.14] [0.14-0.28] [0.28-0.42] [0.86-1.0] [0.42-0.57] [0.57-0.71] [0.71-0.86]
```

Simplified symmetric approach:
- Center column: highest centrality (0.86-1.0)
- Columns radiate outward with decreasing centrality
- Rightmost columns: lowest centrality (0-0.14) and isolated nodes (centrality = 0)

### Node Positioning

- Each node placed in cell based on (tier, centrality bucket)
- Multiple nodes in same cell: stack vertically with small offset
- Nodes without centrality data (isolated, degree 0): placed in rightmost columns

### Visual Grid Elements

- Subtle vertical column separators (faint lines)
- Column headers at top showing centrality ranges
- Tier labels on left side (existing)
- Center column slightly highlighted (faint glow)

### Spacing

- Tier row height: dynamic based on node count (existing behavior)
- Column width: equal, ~150-200px depending on canvas width
- Node jitter within cells: small random offset for organic feel

## Critical Node Badge Design

### Current Badge
- Amber diamond, 12x12px, subtle glow

### New Yellow Star Badge
- **Shape**: 5-pointed star using CSS clip-path
- **Size**: 16x16px (33% larger)
- **Color**: Bright yellow (#FFD700) with gradient to orange
- **Glow**: Double-layer effect
  - Inner: `box-shadow: 0 0 8px rgba(255, 215, 0, 0.8)`
  - Outer: `box-shadow: 0 0 16px rgba(255, 215, 0, 0.5)`
- **Position**: Top-left corner of node
- **Animation**: Subtle pulse (opacity 0.8 to 1.0, 2s cycle)
- **Tooltip**: "Critical node - network bottleneck"

### CSS Implementation
```css
.critical-star {
  width: 16px;
  height: 16px;
  background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
  clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
  box-shadow: 0 0 8px rgba(255, 215, 0, 0.8), 0 0 16px rgba(255, 215, 0, 0.5);
  animation: critical-pulse 2s ease-in-out infinite;
}

@keyframes critical-pulse {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 1; }
}
```

## Data Flow

### Current Flow
```
Nodes → toReactFlowNodes() → getLayoutedElements() → TopologyGraph
                                    ↓
                              classifyNode() uses peersCount only
```

### New Flow
```
Nodes → buildAdjacencyList() → calculateBetweennessCentrality()
                                         ↓
        toReactFlowNodes() ← centrality map injected into node data
                ↓
        getLayoutedElements() → uses tier + centrality for positioning
                ↓
        TopologyGraph renders with grid layout
```

## Files to Modify

1. **src/lib/transforms.ts**
   - Add `centrality?: number` to `ConcordiumNodeData` interface

2. **src/lib/layout.ts**
   - New function `getGridLayoutedElements()`
   - Accepts centrality map as parameter
   - Returns nodes positioned by (tier, centrality bucket)
   - Returns column labels for rendering

3. **src/components/map/TopologyGraph.tsx**
   - Compute centrality before layout
   - Pass centrality to layout function
   - Render column headers/separators
   - Replace amber diamond badge with yellow star

4. **src/app/globals.css**
   - Add `.critical-star` styles
   - Add `@keyframes critical-pulse` animation
   - Add column separator styles

## Edge Cases

1. **Empty network**: Show empty state (existing behavior)

2. **Single node**: Centrality = 0, place in center column of its tier

3. **Disconnected components**: Centrality calculated within component. Isolated nodes (degree 0) get centrality = 0 → rightmost column

4. **All nodes same centrality**: Spread evenly across center column with vertical stacking

5. **Overcrowded cells**: If >5 nodes in same cell:
   - Stack vertically with 20px offset
   - If still overflows, use 2 sub-columns within the cell

6. **Missing data**: Treat as edge tier, rightmost column

7. **Dynamic updates**: Recalculate on topology change, use React Flow animation for smooth transitions

## Performance Considerations

- Betweenness centrality: O(V × E) - acceptable for ~100-200 nodes
- Cache centrality calculation, recalculate only on topology changes
- Debounce layout updates (500ms) to avoid jitter

## Testing Strategy

- Unit tests for centrality bucket assignment
- Unit tests for grid position calculation
- Visual regression tests for badge rendering
- Edge case tests for empty/single/disconnected networks
