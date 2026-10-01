# Development Guide

## 1. Setup & Requirements

- **Node.js**: v22+
- **Database**: Cloudflare D1 (Local testing powered by native `node:sqlite`)
- **Package Manager**: npm

## 2. Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts Next.js development server (Turbopack) |
| `npm run build` | Compiles production application build |
| `npm run start` | Starts production server |
| `npm run typecheck` | Validates TypeScript types across the codebase |
| `npm run test` | Runs unit, integration, API, and e2e test suite |
| `npm run check` | Verifies static assets and media files |
| `npm run db:migrate` | Runs database migrations |
| `npm run db:seed` | Seeds database with development fixtures |

## 3. Environment Variables

Create `.env.local` for local environment configuration (never commit secrets):

```env
NODE_ENV=development
PORT=3000
API_BASE_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000
D1_BINDING_NAME=DB
```

All configuration variables are validated at startup via `config/env.ts`.
