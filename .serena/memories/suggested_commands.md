# Suggested Commands

## Development
```bash
pnpm dev              # Start development server
pnpm build            # Build for production
pnpm start            # Start production server
```

## Testing
```bash
pnpm test             # Run Vitest in watch mode
pnpm test:run         # Run Vitest once
pnpm test:coverage    # Run with coverage report
pnpm test:e2e         # Run Playwright e2e tests
pnpm test:e2e:ui      # Run Playwright with UI
```

## Linting
```bash
pnpm lint             # Run ESLint
```

## Vercel Environment Variables
```bash
# Add environment variable (use printf to handle interactive prompts)
printf '%s\nn\n' 'your-value' | vercel env add VAR_NAME production

# List environment variables
vercel env ls
```

## System Utilities (Darwin/macOS)
```bash
# Use modern tools when available
rg "pattern"          # ripgrep for fast search
fd "filename"         # fast file finder
git grep "pattern"    # search git-tracked files
/bin/ls -la           # bypass slow ls aliases
```
