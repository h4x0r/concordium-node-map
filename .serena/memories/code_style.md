# Code Style and Conventions

## TypeScript
- Strict mode enabled
- Use `@/*` path alias for imports from `src/`
- Prefer TypeScript interfaces over types for object shapes
- Use explicit return types for functions

## React
- Functional components with hooks
- Use custom hooks for reusable logic (in `src/hooks/`)
- TanStack Query for server state
- Zustand for client state (`useAppStore`)

## File Naming
- React components: PascalCase (e.g., `NodeDetailPanel.tsx`)
- Hooks: camelCase with `use` prefix (e.g., `useNodes.ts`)
- Utilities: camelCase (e.g., `formatting.ts`)
- Tests: `*.test.ts` or `*.test.tsx` colocated with source

## API Routes
- Located in `src/app/api/`
- Use Next.js App Router conventions
- Return JSON responses with appropriate status codes

## Styling
- Tailwind CSS v4
- Use `cn()` utility from `src/lib/utils.ts` for class merging
- Radix UI for accessible primitives

## Testing
- Vitest for unit tests
- Colocate tests with source files
- Use `src/test/setup.ts` for test configuration
- Playwright for e2e tests in `e2e/` directory
