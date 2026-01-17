# Task Completion Checklist

When completing a task, ensure the following:

## Before Committing
1. **Run tests**: `pnpm test:run`
2. **Run linting**: `pnpm lint`
3. **Build check**: `pnpm build` (catches TypeScript errors)

## For New Features
- Add unit tests for new functionality
- Update relevant components and hooks
- Consider mobile responsiveness

## For API Changes
- Update TypeScript types in `src/types/` or `src/lib/types/`
- Test API endpoints manually or with e2e tests
- Update environment variables in Vercel if needed

## For Database Changes
- Update schema in `src/lib/db/schema.ts`
- Add migrations if needed
- Test with Turso locally

## Documentation
- Update CLAUDE.md if adding new conventions
- Update README.md for user-facing changes
