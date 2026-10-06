# Friendship Wrapped

A private social memory app for friend groups: capture photos together through the year, react and comment, browse shared memories, then relive it all as a Spotify Wrapped–style recap.

## Build status

The MVP is built in phases. Each phase is tested before the next one starts.

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Foundation: repo, React/TS/Tailwind, Express, Prisma, MySQL, config, errors | ✅ Done |
| 2 | Authentication: register, login, logout, sessions, protected routes, profile | ✅ Done |
| 3 | Groups & invites: create, invite links, join, leave, members, owner permissions | ✅ Done |
| 4 | Photos: in-app camera, gallery upload, processing, thumbnails, object storage, captions, deletion, profile pictures | ✅ Done |
| 5 | Feed | ⏳ Next |
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
        ↓  S3 API (@aws-sdk/client-s3)
Object storage: MinIO locally, any S3-compatible bucket in production
```

Also used: TypeScript 7, React Router 8, TanStack Query 5, Zod 4, sharp (image processing), multer (uploads), Vitest 5 + Supertest.

## Getting started

### Prerequisites

- Node.js 22.12+ (developed on 24 LTS)
- MySQL 8.4
- MinIO, the local S3-compatible object storage. Since 2025 MinIO only publishes source code for its free edition, so build it with Go (1.24+):
  ```bash
  go install github.com/minio/minio@latest
  ```
  This puts `minio` in Go's bin folder (`%USERPROFILE%\go\bin` on Windows), which the Go installer adds to `PATH`. You don't run it yourself: `npm run dev` and `npm test` start it. To use a binary somewhere else, set `MINIO_BIN`.

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

Pick your own `S3_SECRET_ACCESS_KEY` (8+ characters). For local MinIO the `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` pair becomes MinIO's root login. Use the same pair in `.env.test`, with `S3_BUCKET=friendship-wrapped-test`. Buckets are created automatically.

### Run

```bash
npm install
npm run dev
```

- Client: http://localhost:5173
- API: http://127.0.0.1:4000 (the client reaches it via `/api`)
- MinIO: http://127.0.0.1:9000 (S3 API), with a bucket browser at http://127.0.0.1:9001 (log in with the S3 key pair). Data lives in `.local/minio/`.

Create an account at `/auth/register`. **Settings** shows a live System status card that confirms the client → API → database and storage chain.

The live camera needs a secure context: `localhost` counts, but opening the dev server from a phone over your LAN IP (`http://192.168…`) doesn't. There, the Camera page falls back to the phone's own camera app and the gallery.

### Migrations

`npm run db:migrate` applies new migrations to the dev database. `npm test` applies them to the test database automatically before running.

## Scripts

Run these from the repo root:

| Script | What it does |
| --- | --- |
| `npm run dev` | MinIO, the API (auto-restart on change) and the Vite dev server together |
| `npm test` | Server integration tests against the real test database and test bucket (starts MinIO if it isn't running) |
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
  scripts/            Local MinIO for dev and tests (never used in production)
  src/
    config/env.ts     Zod-validated environment
    lib/              prisma client + withTransaction, errors (AppError), logger, password hashing, tokens,
                      storage (S3), images (sharp), upload (multer), send-image
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
- **Images.** Image binaries never go in MySQL. The database stores object-storage keys only, and those keys never leave the server. See [Photos](#photos).

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
| `PUT` | `/api/users/me/avatar` | ✅ | Upload a profile picture (multipart field `avatar`) |
| `DELETE` | `/api/users/me/avatar` | ✅ | Remove it (back to initials) |
| `GET` | `/api/users/:userId/avatar` | ✅ | The picture; only for the person and people who share a group with them |
| `GET` | `/api/health` | — | API, database and storage status |

Users come back with an `avatarUrl` (or `null`). The URL changes whenever the picture does, so browsers can cache it. Account deletion will be added once photos and comments exist, so its policy can cover them. Until then, `photos.uploader_id` is `ON DELETE RESTRICT`.

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

## Photos

- **Capture.** `/camera` uses the browser's live camera (`getUserMedia`): take photo → preview → caption → post. There's a front/back switch, and front-camera shots are saved as previewed (mirrored). Without a live camera (no device, permission blocked, or not HTTPS), the page offers the phone's own camera app (`<input capture>`) and the gallery. Camera access is released as soon as a photo is taken.
- **Upload.** `POST /api/groups/:groupId/photos` as `multipart/form-data`, with `photo` (one file, ≤ 20 MB) and an optional `caption` (≤ 500 characters; line breaks allowed). Membership is checked *before* the body is read, so non-members can't push large uploads.
- **Validation.** By content, never by file name or the browser's MIME type:
  - **Accepted formats:** JPEG, PNG, WebP and AVIF.
  - **Rejected:** HEIC gets a clear message. On iPhones the picker converts photos to JPEG anyway, because the client lists the accepted types explicitly.
  - **Size limit:** images over 64 megapixels are rejected before decoding.
- **Processing** (`lib/images.ts`, sharp). Each photo is stored as three WebP renditions, and the original upload is not kept. Re-encoding applies the EXIF orientation and strips all metadata, including GPS location.

  | Rendition | Size | Column | Used for |
  | --- | --- | --- | --- |
  | `full` | ≤ 2560 px on the long edge | `storage_key` | Downloads and zoom (later phases) |
  | `medium` | ≤ 1280 px | `medium_key` | Photo page and feed |
  | `thumbnail` | 480×480, centre-cropped | `thumbnail_key` | Grids |

  Small photos are never enlarged.
- **Storage keys.** Everything is under `groups/<groupId>/photos/<random>/…` and `users/<userId>/avatars/<random>.webp`.
  - The random part makes keys unguessable.
  - The group prefix lets a deleted group's files be removed in one sweep.
  - If the database write fails after an upload, the stored files are removed again.
- **Privacy.**
  - **Who can see a photo:** its uploader and members of its group (`visibleTo` in `photos.repository.ts`). Everyone else gets 404.
  - **No public URLs:** the bucket stays private, and images are streamed through `GET /api/photos/:id/images/:variant`, which checks the session and access on every request. Responses are `Cache-Control: private`, so shared proxies never keep them.
  - **Leaving a group:** photos stay with the group, and the uploader can still open their own.
- **Deleting.**
  - **A photo:** only its uploader can delete it (others get 403). Its files are deleted after its row.
  - **A group:** when the last member leaves, all of its photos and files go with it.
- **Listing.** Photos are listed newest first with a keyset cursor (`?cursor=…&limit=…`, at most 50), backed by the `(group_id, created_at, id)` index. For now, the group page shows the newest 24; the scrolling feed comes in Phase 5.

| Method | Endpoint | Who | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/groups/:groupId/photos` | member | Post a photo |
| `GET` | `/api/groups/:groupId/photos` | member | Newest first: `{ photos, nextCursor }` |
| `GET` | `/api/photos/:photoId` | uploader or member | Photo details (+ its group) |
| `GET` | `/api/photos/:photoId/images/:variant` | uploader or member | `thumbnail`, `medium` or `full` (WebP) |
| `DELETE` | `/api/photos/:photoId` | uploader | Delete the photo and its files |

## Local machine notes

- MySQL runs as the Windows service `MySQL84`, bound to `127.0.0.1` only.
- Local secrets (the MySQL root password, dev test-account logins) live in `.local/`, which is gitignored.
- Prisma 7.10.0 pins vulnerable versions of `mariadb`, `mysql2` and `deepmerge-ts`, so `overrides` in the root `package.json` lift them to patched releases. The overrides are keyed to the exact Prisma 7.10.0 packages, so they stop applying once Prisma is upgraded. When bumping Prisma, update the `allowScripts` versions below, re-run `npm audit`, and drop the overrides (or re-key them if the new release still pins vulnerable versions).
- npm 11 only runs install scripts for packages listed under `allowScripts` in `package.json` (Prisma's engines, esbuild).
- The API dev watcher is `node --watch-path=./src --import tsx` rather than `tsx watch`, because `tsx watch` hangs on Windows when run under `concurrently`.
  - It watches only `src/`: plain `--watch` on Windows treated a dependency file loaded for the first time as a change, and restarted the API mid-request.
  - After `npm install`, restart `npm run dev` yourself.
- MinIO was built from source with Go 1.27 (`go install github.com/minio/minio@latest`), because the winget package's download is gone (HTTP 410). The binary is `%USERPROFILE%\go\bin\minio.exe`.
