# Concordium Node Map - Project Instructions

## Vercel Environment Variables

**IMPORTANT**: When environment variables need to be added to Vercel, do NOT tell the user to do it. Add them directly using the Vercel CLI which is already authenticated.

### How to add environment variables to Vercel:

```bash
# Use printf to pipe the value and handle interactive prompts
printf '%s\nn\n' 'your-secret-value' | vercel env add VAR_NAME production
printf '%s\nn\n' 'your-secret-value' | vercel env add VAR_NAME preview

# Verify with
vercel env ls
```

The 'n' after the value answers "no" to the "Mark as sensitive?" prompt.

### Current Environment Variables:
- `TURSO_DATABASE_URL` - Turso database connection URL
- `TURSO_AUTH_TOKEN` - Turso authentication token
- `CRON_SECRET` - Secret for authenticating cron job requests

## Technology Stack

- **Framework**: Next.js 16 with App Router
- **Database**: Turso (libSQL edge database)
- **Styling**: Tailwind CSS
- **Testing**: Vitest
- **Deployment**: Vercel with Cron Jobs

## Development Commands

```bash
# Development
pnpm dev

# Testing
pnpm test:run

# Build
pnpm build
```
