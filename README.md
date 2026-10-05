# Friendship Wrapped

A private social memory app for friend groups: capture photos together through the year, react and comment, browse shared memories, then relive it all as a Spotify Wrapped–style recap.

## Build status

The MVP is built in phases. Each phase is tested before the next one starts.

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Foundation: repo, React/TS/Tailwind, Express, Prisma, MySQL, config, errors | ✅ Done |
| 2 | Authentication: register, login, logout, sessions, protected routes, profile | ✅ Done |
| 3 | Groups & invites: create, invite links, join, leave, members, owner permissions | ✅ Done |
| 4 | Photos (camera, upload, processing, object storage) | ⏳ Next |
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

Create an account at `/auth/register`. **Settings** shows a live System status card that confirms the client → API → database chain.

### Migrations

`npm run db:migrate` applies new migrations to the dev database. `npm test` applies them to the test database automatically before running.

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
    lib/              prisma client + withTransaction, errors (AppError), logger, password hashing, tokens
    middleware/       error handler, 404, request logging, rate limit, same-origin check
    modules/<name>/   .routes → .controller → .service → .repository (+ .schemas for Zod)
    routes/index.ts   Mounts module routers under /api
    types/            Express request augmentation (req.user)
    app.ts            Express app factory (used by tests)
    index.ts          Process entry: listen + graceful shutdown
  test/               Vitest + Supertest
```

## Conventions

- **Layering.** Routes only wire URLs to controllers. Controllers handle HTTP (parse input, choose status codes). Services hold business logic. Repositories are the only code that talks to Prisma. React components stay presentational, with logic in feature hooks.
- **Never leak secrets.** Return users through `publicUserSelect` (in `user.dto.ts`). The password hash is read only by the login query.
- **Errors.** Throw an `AppError` (or a helper such as `notFound()`) for expected failures. Every error response has the same shape:
  ```json
  { "error": { "code": "NOT_FOUND", "message": "…", "details": "optional" } }
  ```
  Unexpected errors become a generic 500 and are logged server-side. The client's `apiRequest` turns these into a typed `ApiError`.
- **Validation.** All input is validated server-side with Zod. A thrown `ZodError` becomes a 400 `VALIDATION_ERROR`.
- **Images.** Image binaries never go in MySQL. The database stores object-storage keys only (from Phase 4).

## Authentication

- **Accounts.** Username (stored lowercase) + display name + password. Passwords are hashed with Node's built-in scrypt (N=2¹⁵, r=8, p=3). The parameters are stored with each hash so they can be raised later.
- **Sessions.** Server-side rows in `sessions`. The browser gets a random 256-bit token in an `HttpOnly`, `SameSite=Lax` cookie (`__Host-` prefixed and `Secure` in production). Only the token's SHA-256 is stored, so a database leak can't be replayed. Sessions last 30 days and slide forward while in use. Logout deletes the row.
- **Protecting an endpoint.** Add `requireAuth` to the route and read the user with `currentUser(req)` in the controller. Never take a user id from the request body.
- **Hardening.** Login is rate-limited (10 attempts / 15 min per IP + username). Unknown usernames take the same time and get the same response as wrong passwords. State-changing requests from another origin are rejected (CSRF defence in depth). All API responses are `Cache-Control: no-store`.
- **Client.** `useSession()` holds the signed-in user (or `null`). `<RequireAuth>` and `<RedirectIfAuthenticated>` guard routes, and send people back to the page they wanted after login. Any `401 UNAUTHORIZED` response signs the client out.

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | — | Create an account and sign in |
| `POST` | `/api/auth/login` | — | Sign in |
| `POST` | `/api/auth/logout` | — | Revoke the current session |
| `GET` | `/api/auth/session` | — | Current user, or `{ "user": null }` |
| `PATCH` | `/api/users/me` | ✅ | Update display name |
| `GET` | `/api/health` | — | API and database status |

Profile pictures arrive with object storage in Phase 4; until then avatars show initials. Account deletion will be added once photos and comments exist, so its policy can cover them.

## Groups

- **Roles.** `group_members.role` is the single source of truth: each group has exactly one `OWNER`, and everyone else is a `MEMBER`.
  - **Owner only:** rename the group or change its emoji, remove members, reset invite links.
  - **Any member:** see members, create invite links, leave.
- **Privacy.** Every group endpoint checks membership on the server (`requireMembership` / `requireOwner` in `groups.service.ts`). Non-members get a **404**, never a 403, so they can't tell a group exists. New features scoped to a group (photos and so on) must go through the same check.
- **Invite links.** `/invite/<token>`: 128 random bits, valid for 7 days, and only the token's SHA-256 is stored, so a link can't be shown again later. Members just create a new one. The link is the credential:
  - Anyone holding it can see a preview (name, emoji, member count) without an account, then sign up or log in and come back to join.
  - Accepting twice is harmless.
  - Links stop working if the owner resets them, or if the person who created them leaves or is removed.
- **Leaving** runs in a serializable transaction (`withTransaction`) so the one-owner rule always holds:
  - If the owner leaves, ownership passes to the longest-standing member.
  - If the last member leaves, the group is deleted.
- **Onboarding.** New accounts land on `/onboarding` to create their first group. People who signed up from an invite link go straight back to it.
- `GROUPS` is a reserved word in MySQL 8. Prisma quotes it, but write it as `` `groups` `` in any raw SQL.

| Method | Endpoint | Who | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/groups` | signed in | Your groups |
| `POST` | `/api/groups` | signed in | Create a group (you become owner) |
| `GET` | `/api/groups/:groupId` | member | Group details + your role |
| `PATCH` | `/api/groups/:groupId` | owner | Rename / change emoji |
| `GET` | `/api/groups/:groupId/members` | member | Member list (owner first) |
| `DELETE` | `/api/groups/:groupId/members/:userId` | owner | Remove a member |
| `POST` | `/api/groups/:groupId/leave` | member | Leave (returns `{ groupDeleted }`) |
| `POST` | `/api/groups/:groupId/invites` | member | Create an invite link |
| `DELETE` | `/api/groups/:groupId/invites` | owner | Reset (revoke) all invite links |
| `GET` | `/api/invites/:token` | anyone with the link | Preview the group |
| `POST` | `/api/invites/:token/accept` | signed in | Join the group |

## Local machine notes

- MySQL runs as the Windows service `MySQL84`, bound to `127.0.0.1` only.
- Local secrets (the MySQL root password, dev test-account logins) live in `.local/`, which is gitignored.
- npm 11 only runs install scripts for packages listed under `allowScripts` in `package.json` (Prisma's engines, esbuild).
- The API dev watcher is `node --watch --import tsx` rather than `tsx watch`, because `tsx watch` hangs on Windows when run under `concurrently`.
