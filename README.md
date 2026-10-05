# Friendship Wrapped

A private social memory app for friend groups: capture photos together through the year, react and comment, browse shared memories, then relive it all as a Spotify Wrapped–style recap.

## Build status

The MVP is built in phases. Each phase is tested before the next one starts.

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Foundation: repo, React/TS/Tailwind, Express, Prisma, MySQL, config, errors | ✅ Done |
| 2 | Authentication | ⏳ Next |
| 3 | Groups & invites | — |
| 4 | Photos (camera, upload, processing, object storage) | — |
| 5 | Feed | — |
| 6 | Reactions, comments, favorites | — |
| 7 | Memories (timeline, albums, On This Day) | — |
| 8 | Analytics | — |
| 9 | Wrapped | — |
| 10 | Polish | — |

## Stack

```text
React 19 + Vite + Tailwind 4 (client/)
        ↓  /api (proxied by Vite in dev)
Node 24 + Express 5 (server/)
        ↓  Prisma 7 + MariaDB driver adapter
MySQL 8.4
        ↓  (Phase 4)
Object storage
```

Also used: TypeScript 7, React Router 8, TanStack Query 5, Zod 4, Vitest 5 + Supertest.

## Getting started

### Prerequisites

- Node.js 22.12+ (developed on 24 LTS)
- MySQL 8.4

### Database

Create the dev and test databases and a least-privilege app user. Run as MySQL root:

```sql
CREATE DATABASE friendship_wrapped CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE friendship_wrapped_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'fw_app'@'localhost' IDENTIFIED BY '<password>';
GRANT ALL PRIVILEGES ON `friendship\_wrapped%`.* TO 'fw_app'@'localhost';
-- `prisma migrate dev` creates and drops a temporary shadow database:
GRANT ALL PRIVILEGES ON `prisma\_migrate\_shadow\_db%`.* TO 'fw_app'@'localhost';
```

### Environment

```bash
cp server/.env.example server/.env
cp server/.env.example server/.env.test   # then point DATABASE_URL at friendship_wrapped_test
```

The server validates its environment at startup and refuses to boot with a clear message if anything is missing. Server variables are namespaced (`API_PORT`, `API_HOST`) so a generic `PORT` exported by other tools can't hijack the API.

### Run

```bash
npm install
npm run dev
```

- Client: http://localhost:5173
- API: http://127.0.0.1:4000 (the client reaches it via `/api`)

The home page shows a live **System status** card confirming the client → API → database chain.

## Scripts

Run these from the repo root:

| Script | What it does |
| --- | --- |
| `npm run dev` | API (auto-restart on change) and Vite dev server together |
| `npm test` | Server integration tests against the real test database |
| `npm run typecheck` | Type-check server and client |
| `npm run build` | Compile the server to `server/dist`, build the client to `client/dist` |
| `npm run db:migrate` | Create/apply a migration in development (`prisma migrate dev`) |
| `npm run db:generate` | Regenerate the Prisma client (also runs on `npm install`) |
| `npm run db:studio` | Open Prisma Studio |

## Project structure

```text
client/src/
  components/ui/      Reusable presentational components (Button, Card, …)
  features/<name>/    Feature logic: API calls, hooks, feature components
  layouts/            App shell
  pages/              Route-level components (thin: compose features)
  lib/                api-client (fetch + ApiError), query-client
  router.tsx          Route table

server/
  prisma/             schema.prisma and migrations
  prisma.config.ts    Prisma CLI config (connection URL, paths)
  src/
    config/env.ts     Zod-validated environment
    lib/              prisma client, errors (AppError), logger
    middleware/       error handler, 404, request logging
    modules/<name>/   <name>.routes.ts → .controller.ts → .service.ts
    routes/index.ts   Mounts module routers under /api
    app.ts            Express app factory (used by tests)
    index.ts          Process entry: listen + graceful shutdown
  test/               Vitest + Supertest
```

## Conventions

- **Layering.** Routes only wire URLs to controllers. Controllers handle HTTP (parse input, choose status codes). Services hold business logic and all database access. React components stay presentational, with logic in feature hooks.
- **Errors.** Throw an `AppError` (or a helper such as `notFound()`) for expected failures. Every error response has the same shape:
  ```json
  { "error": { "code": "NOT_FOUND", "message": "…", "details": "optional" } }
  ```
  Unexpected errors become a generic 500 and are logged server-side. The client's `apiRequest` turns these into a typed `ApiError`.
- **Validation.** All input is validated server-side with Zod. A thrown `ZodError` becomes a 400 `VALIDATION_ERROR`.
- **Images.** Image binaries never go in MySQL. The database stores object-storage keys only (from Phase 4).

## Local machine notes

- MySQL runs as the Windows service `MySQL84`, bound to `127.0.0.1` only.
- Local secrets (the MySQL root password) live in `.local/`, which is gitignored.
- npm 11 only runs install scripts for packages listed under `allowScripts` in `package.json` (Prisma's engines, esbuild).
- The API dev watcher is `node --watch --import tsx` rather than `tsx watch`, because `tsx watch` hangs on Windows when run under `concurrently`.
