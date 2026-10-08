# Friendship Wrapped

A private social memory app for friend groups: capture photos together through the year, react and comment, browse shared memories, then relive it all as a Spotify Wrapped–style recap. Everyone in a group has their own colour (see [Redesign: Colour-coded](#redesign-colour-coded)).

## Build status

The MVP is built in phases. Each phase is tested before the next one starts.

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Foundation: repo, React/TS/Tailwind, Express, Prisma, MySQL, config, errors | ✅ Done |
| 2 | Authentication: register, login, logout, sessions, protected routes, profile | ✅ Done |
| 3 | Groups & invites: create, invite links, join, leave, members, owner permissions | ✅ Done |
| 4 | Photos: in-app camera, gallery upload, processing, thumbnails, object storage, captions, deletion, profile pictures | ✅ Done |
| 5 | Feed: group feed and grid, infinite scroll, lazy images, photo viewer (swipe, full screen), upload flow | ✅ Done |
| 6 | Social: five reactions, comments, private favorites | ✅ Done |
| 7 | Memories: On This Day, timeline by month, shared albums, favorites | ✅ Done |
| 8 | Analytics: a group's year in numbers, for Wrapped | ✅ Done |
| 9 | Wrapped: the year as a full-screen story, saved once the year is over | ✅ Done |
| 10 | Polish: loading, empty, error and offline states, accessibility, camera and upload, Wrapped transitions, account deletion, home screen install | ✅ Done |

The native iOS app in [`ios/`](ios/README.md) covers phases 1–10 too.

## Stack

```text
React 19 + Vite + Tailwind 4 (client/)     SwiftUI, iOS 17+ (ios/)
        ↓  /api (proxied by Vite in dev)          ↓  same /api, session token in the Keychain
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

For push notifications, generate a key pair with `npx web-push generate-vapid-keys` (from `server/`) and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (a `mailto:` address); leave them empty to run without push. Tests don't need them.

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
  lib/                api-client (fetch + ApiError), query-client, formatting, shared hooks (useWhenVisible, useSwipe, …)
  router.tsx          Route table

server/
  prisma/             schema.prisma and migrations
  prisma.config.ts    Prisma CLI config (connection URL, paths)
  scripts/            Local MinIO for dev and tests (never used in production)
  src/
    config/env.ts     Zod-validated environment
    lib/              prisma client + withTransaction, errors (AppError), logger, password hashing, tokens,
                      storage (S3), images (sharp), upload (multer), send-image,
                      pagination (keyset cursors), user-text (caption/comment validation),
                      time-zone (local calendar days and years: On This Day, stats, Wrapped)
    middleware/       error handler, 404, request logging, rate limit, same-origin check
    modules/<name>/   .routes → .controller → .service → .repository (+ .schemas for Zod)
    routes/index.ts   Mounts module routers under /api
    types/            Express request augmentation (req.user)
    app.ts            Express app factory (used by tests)
    index.ts          Process entry: listen + graceful shutdown
  test/               Vitest + Supertest

ios/                  Native SwiftUI app (XcodeGen project.yml); see ios/README.md
.github/workflows/    ios.yml: simulator build on macOS runners, optional TestFlight upload
```

## Conventions

- **Layering.** Routes only wire URLs to controllers. Controllers handle HTTP (parse input, choose status codes). Services hold business logic. Repositories are the only code that talks to Prisma. React components stay presentational, with logic in feature hooks.
- **Never leak secrets.** Return users through `publicUserSelect` (in `user.dto.ts`). The password hash is read only by the login query.
- **Errors.** Throw an `AppError` (or a helper such as `notFound()`) for expected failures. Every error response has the same shape:
  ```json
  { "error": { "code": "NOT_FOUND", "message": "…", "details": "optional" } }
  ```
  Unexpected errors become a generic 500 and are logged server-side. The client's `apiRequest` turns these into a typed `ApiError`.
  - **Not 500s:** requests Express or its body parser can't read (a URL that isn't valid percent-encoding, an unsupported charset or `Content-Encoding`) get a 400 or 415. Something deleted between a request's check and its write (reacting to a photo as it's deleted) gets a 404.
- **Validation.** All input is validated server-side with Zod. A thrown `ZodError` becomes a 400 `VALIDATION_ERROR`.
  - **Ids** in URLs and bodies are lowercased first: MySQL compares them without regard to case, so `ABC…` and `abc…` must never count as two different ids.
  - **Names** (display, group and album names) need at least one visible character, so a name of only spaces, zero-width or filler characters is refused. Direction overrides (U+202A–U+202E, U+2066–U+2069), which can make a name display backwards, are refused too.
- **Images.** Image binaries never go in MySQL. The database stores object-storage keys only, and those keys never leave the server. See [Photos](#photos).

## Authentication

- **Accounts.** Username (stored lowercase) + display name + password. Passwords are hashed with Node's built-in scrypt (N=2¹⁵, r=8, p=3). The parameters are stored with each hash so they can be raised later.
- **Sessions.** Server-side rows in `sessions`. The browser gets a random 256-bit token in an `HttpOnly`, `SameSite=Lax` cookie (`__Host-` prefixed and `Secure` in production). Only the token's SHA-256 is stored, so a database leak can't be replayed. Sessions last 30 days and slide forward while in use. Logout deletes the row.
- **Protecting an endpoint.** Add `requireAuth` to the route and read the user with `currentUser(req)` in the controller. Never take a user id from the request body.
- **Hardening.** Login is rate-limited (10 attempts / 15 min per IP + username). Unknown usernames take the same time and get the same response as wrong passwords. State-changing requests from another origin are rejected (CSRF defence in depth). All API responses are `Cache-Control: no-store`.
  - **Spelling variants:** login only looks up names that could have been registered. MySQL's collation ignores accents, so without this `álice` would find `alice` and get its own 10 attempts.
  - **Memory:** the limiter's counters are capped, and its key uses at most 64 characters of the username, however long the one sent.
  - **Logs:** invite tokens in URLs are logged as `…`, since an invite link is a credential.
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
| `DELETE` | `/api/users/me` | ✅ | Delete your account; body `{ password }` (see below) |
| `GET` | `/api/users/:userId/avatar` | ✅ | The picture; only for the person and people who share a group with them |
| `GET` | `/api/health` | — | API, database and storage status |

Users come back with an `avatarUrl` (or `null`). The URL changes whenever the picture does, so browsers can cache it.

**Deleting an account** (Settings → Delete account, confirmed with your password; 5 tries per 15 minutes):

- **Deleted:**
  - every photo you posted, in every group, with the reactions, comments and favorites on them, and their image files
  - your own comments, reactions and favorites, profile picture and sessions
- **Your groups:** you leave each one as if you'd tapped "Leave". A group you own passes to its longest-standing member; a group you're the last member of is deleted.
- **Kept:** albums you created stay with their group (`albums.created_by_id` is `SET NULL`).
- **Wrapped:** saved Wrapped that include you are dropped, so those years are counted again without you.
- **How it's built:** it all happens in one transaction (files are removed after it commits). `photos.uploader_id` and `comments.author_id` stay `ON DELETE RESTRICT`: deletion removes those rows first, so nothing is ever orphaned.

## Groups

- **Roles.** `group_members.role` is the single source of truth: each group has exactly one `OWNER`, and everyone else is a `MEMBER`.
  - **Owner only:** rename the group or change its emoji, remove members, reset invite links.
  - **Any member:** see members, create invite links, leave.
- **Privacy.** Every group endpoint checks membership on the server (`requireMembership` / `requireOwner` in `groups.service.ts`). Non-members get a **404**, never a 403, so they can't tell a group exists. New features scoped to a group (photos and so on) must go through the same check.
- **Invite links.** `/invite/<token>`: 128 random bits, valid for 7 days, and only the token's SHA-256 is stored, so a link can't be shown again later. Members just create a new one. The link is the credential:
  - Anyone holding it can see a preview (name, emoji, member count) without an account, then sign up or log in and come back to join.
  - Accepting twice is harmless.
  - Links stop working if the owner resets them, or if the person who created them leaves.
  - Removing someone resets every link of the group (they may have kept any of them), so they can only come back with a new one.
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
  | `full` | ≤ 2560 px on the long edge | `storage_key` | Full-screen view |
  | `medium` | ≤ 1280 px | `medium_key` | Photo viewer and feed |
  | `thumbnail` | 480×480, centre-cropped | `thumbnail_key` | Grids |

  Small photos are never enlarged. Thumbnails and profile pictures are still square: a photo narrower than 480 px gets a thumbnail the size of its short side.
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
- **Listing.** Photos are listed newest first (ties broken by id) with a keyset cursor (`?cursor=…&limit=…`, at most 50), backed by the `(group_id, created_at, id)` index. See [Feed](#feed).

| Method | Endpoint | Who | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/groups/:groupId/photos` | member | Post a photo |
| `GET` | `/api/groups/:groupId/photos` | member | Newest first: `{ photos, nextCursor }`. Optional `before` (ISO instant) and `favorites=true` |
| `GET` | `/api/photos/:photoId` | uploader or member | Photo details, its group, and its neighbours in the feed (`feed`) |
| `GET` | `/api/photos/:photoId/images/:variant` | uploader or member | `thumbnail`, `medium` or `full` (WebP) |
| `DELETE` | `/api/photos/:photoId` | uploader | Delete the photo and its files |

## Feed

- **Group feed.** The group page lists its photos newest first. Each post shows the uploader's avatar and name, when it was posted ("5 minutes ago", "yesterday", then a date; hover for the exact time), the photo, reactions and comment count, and its caption. Long captions are cut to three lines with **more**.
  - **Feed or grid.** A toggle switches to a three-column grid of thumbnails. The choice is kept in the URL (`?view=grid`), so it survives opening a photo and coming back.
  - **Shapes.** Feed photos keep their shape between 3:4 portrait and 1.91:1 landscape. Taller or wider ones are cropped in the feed and shown whole in the viewer.
- **Pagination.** 24 photos per page, fetched with the cursor (`useInfiniteQuery`). The next page loads by itself when the end of the list comes within 800 px of the screen (`IntersectionObserver`). The **Load more photos** button does the same for keyboard users and as a fallback. If a page fails, it waits for **Try again** rather than retrying in a loop. Only the pages someone scrolls to are ever loaded.
- **Lazy loading.**
  - Images below the fold use `loading="lazy"`. The first post loads straight away, at high priority.
  - The feed uses the `medium` rendition and the grid uses `thumbnail`. Space is reserved for every image, so nothing jumps while they load. A placeholder pulses until the image arrives.
- **Photo viewer** (`/photos/:id`).
  - **Stepping through.** Swipe, or use the arrow buttons or the ←/→ keys, to step through the group's feed (left = newer). The API returns the neighbouring photo ids as `feed: { newerId, olderId }`. Both are found with the same keyset index as the feed. `feed` is `null` for an uploader who has left the group, so they can open their own photo but not browse the group.
  - **Prefetching.** The neighbouring photos (details and image) are loaded in the background, so stepping is instant.
  - **History.** Stepping replaces the history entry, so **back** returns to the feed in one step, at the same scroll position, with the same pages loaded (`<ScrollRestoration>`).
  - **Full screen.** Tap the photo to see the `full` rendition on black. Pinch to zoom on phones. A tap, ✕ or Escape closes it.
- **Upload flow.** Posting (from the feed's **Add photo** or the camera button) lands on the group's feed with the new photo already on top. The camera page is replaced in history, so **back** doesn't reopen the camera. Deleting a photo in the viewer goes back to the feed with the photo already gone.
- **Performance.** See [Reactions, comments & favorites](#reactions-comments--favorites) for timings at the spec's full targets. Pages and viewer neighbours are index range scans, and a full page-by-page walk visits every photo exactly once, in order.

## Reactions, comments & favorites

Every photo comes back with `reactions: { counts, total, mine }`, `commentCount`, `isFavorite` and `canInteract`. Feed posts show the reactions and a comment count. The viewer adds who reacted, the comments, and a ★ for favorites.

- **Reactions.** ❤️ `HEART`, 😂 `LAUGH`, 💀 `SKULL`, 🔥 `FIRE`, 😭 `CRY`.
  - **One per person per photo** (primary key `photo_id, user_id`): reacting again changes it, and tapping your current one removes it.
  - **Kept for Wrapped:** `created_at` is when you first reacted and `updated_at` when you last changed it.
  - **Instant:** taps show straight away everywhere the photo appears. Taps on one photo are sent in order, and only the last answer is applied, so quick changes of mind don't flicker.
- **Comments.**
  - **Text:** up to 500 characters; line breaks are kept, other control characters rejected.
  - **Order:** oldest first, 30 per page.
  - **Deleting:** only the author can delete a comment, not the uploader or the group owner. Editing isn't supported (optional in the spec).
  - **Linking:** a feed post's comment count links to `/photos/:id#comments`.
- **Favorites.** Private bookmarks: only you can see that you favorited a photo. Browse them under [Memories](#memories).
- **Who can do what.**
  - **Reacting and commenting:** current members of the photo's group only.
  - **Seeing reactions and comments:** anyone who can see the photo.
  - **After leaving a group:** your reactions and comments stay with the group's photos, like photos do. You can still remove your own reaction, comment or favorite. On your own photo, the viewer becomes read-only (`canInteract: false`).
  - **Everyone else:** gets 404.
- **Deleting a photo** removes its reactions, comments and favorites with it (`ON DELETE CASCADE`).
- **Deleting an account** removes the person's reactions, comments and favorites along with their photos (see Authentication).
- **Counting.** Reaction and comment counts are one grouped query per page, on the indexed `photo_id`. Prisma's relation `_count` aggregated the whole comments table instead.
  - **Timings** on a local MySQL at the spec's targets (20 members, 10,000 photos, 50,000 reactions, 20,000 comments in one group):

    | Action | Time |
    | --- | --- |
    | Feed page with all counts | ≈ 6 ms |
    | Viewer | ≈ 4 ms |
    | Comments page | ≈ 2 ms |
    | Who reacted | ≈ 3 ms |
    | Reacting (one write) | ≈ 15–20 ms |
  - **No aggregate tables:** none are needed yet, as the spec suggests.

| Method | Endpoint | Who | Purpose |
| --- | --- | --- | --- |
| `PUT` | `/api/photos/:photoId/reaction` | member | `{ type }`: add or change your reaction. Returns `{ summary }` |
| `DELETE` | `/api/photos/:photoId/reaction` | can see photo | Remove your reaction. Returns `{ summary }` |
| `GET` | `/api/photos/:photoId/reactions` | can see photo | Who reacted, and how |
| `GET` | `/api/photos/:photoId/comments` | can see photo | Oldest first: `{ comments, nextCursor }` |
| `POST` | `/api/photos/:photoId/comments` | member | `{ body }`: add a comment |
| `DELETE` | `/api/comments/:commentId` | author | Delete your comment |
| `PUT` | `/api/photos/:photoId/favorite` | can see photo | Favorite (idempotent) |
| `DELETE` | `/api/photos/:photoId/favorite` | you | Unfavorite (idempotent) |

## Memories

`/memories` (in the bottom navigation) is a group's archive. With more than one group, chips at the top switch between them. The group, tab and month are kept in the URL (`?group=…&tab=…&month=YYYY-MM`), so coming back from a photo lands in the same place.

- **On This Day.** Photos from today's date in earlier years, newest year first, with "1 year ago" headings. When there are none yet, an empty state says so.
  - **Your own calendar:** days are counted in the viewer's time zone. The browser sends its IANA zone (`tz=Europe/Bratislava`) and its own date (`date=`, so the photos match the heading), and the server works out each year's local midnight-to-midnight range (`lib/time-zone.ts`). A photo taken at 00:30 local time counts for that day, even though in UTC it's the previous one.
  - **Where clocks skip midnight:** when daylight saving starts at midnight (Chile, Cuba, the Azores), clocks go from 23:59:59 to 01:00, and the day starts at that jump. A day a zone skipped altogether (Samoa's 30 December 2011) is empty.
  - **Range:** only years since the group was created, up to this one, are searched, and 29 February only comes back in leap years. Each year shows up to 50 photos, so one busy year can't crowd out the others.
- **Timeline.** Every photo in the group, newest first, under sticky month headings, loading more as you scroll.
  - **Jump to a month:** pick a month and year (from when the group began until now). The list then starts at the end of that month in your time zone (`?before=`) and continues back in time. **Back to the latest** returns to the top.
  - **Shared cache:** from the latest photos, the timeline shares the group feed's cache.
- **Albums.** Shared by the whole group (`albums` + `photo_albums`).
  - **Anyone in the group can:** create an album (name up to 60 characters), add photos (from the album page's picker, up to 100 at a time), and take them out. A photo can be in several albums, but only in albums of its own group.
  - **Only the creator or the group owner can:** rename or delete an album. Deleting an album keeps its photos.
  - **Album pages** (`/memories/albums/:id`) list photos oldest first, so an album reads like the story of the event. The cover is the photo most recently added.
  - **From the photo viewer:** the album button opens a checklist of the group's albums, with a box to start a new album containing that photo.
  - **Deleting:** a deleted photo leaves every album it was in. A group's albums go with the group.
  - **Deleting an account:** albums the person created stay (`albums.created_by_id` becomes `NULL`), because an album belongs to the group, not to its creator.
- **Favorites.** The photos you've starred in the group, newest first. Only you see them.
- **Performance.** Measured on a local MySQL with 10,000 photos over three years, 40 favorites, and 20 albums of 100 photos. Favorites, a timeline jump, On This Day and an album page each take about 5–7 ms. The album list with counts and covers takes about 7 ms.
  - The cover is the most recently added photo: one lookup per album on the `(album_id, added_at)` index.
  - Picking the album's newest photo by date meant sorting every photo in every album instead: about 26 ms for the same 20 albums, and growing.

| Method | Endpoint | Who | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/groups/:groupId/photos/on-this-day?tz=…&date=YYYY-MM-DD` | member | `{ date, years: [{ year, photos }] }`. `date` defaults to today in `tz` |
| `GET` | `/api/groups/:groupId/albums` | member | The group's albums (newest first), with `photoCount`, `cover`, `canManage` |
| `POST` | `/api/groups/:groupId/albums` | member | `{ name }`: create an album |
| `GET` | `/api/albums/:albumId` | member | One album |
| `PATCH` | `/api/albums/:albumId` | creator or owner | `{ name }`: rename |
| `DELETE` | `/api/albums/:albumId` | creator or owner | Delete the album (not its photos) |
| `GET` | `/api/albums/:albumId/photos` | member | Oldest first: `{ photos, nextCursor }` |
| `POST` | `/api/albums/:albumId/photos` | member | `{ photoIds }` (1–100, from the same group): add. Returns `{ album }` |
| `DELETE` | `/api/albums/:albumId/photos/:photoId` | member | Take a photo out. Returns `{ album }` |
| `GET` | `/api/photos/:photoId/albums` | member | `{ albumIds }`: the albums a photo is in |

## Analytics

`GET /api/groups/:groupId/stats/:year?tz=Europe/Bratislava` returns `{ stats }`: everything the Wrapped slides need, for members of the group (others get 404). It's counted live from photos, reactions and comments, with no aggregate tables.

- **Time zone.** The year, its months and its days run from local midnight in the viewer's IANA zone (`tz`, required).
  - **Example:** a photo at 00:30 on 1 January in Bratislava belongs to the new year there, but to the old one in UTC.
  - `from` and `to` in the response give the exact span.
- **What's in it:**

  | Field | Meaning |
  | --- | --- |
  | `photos.total` | Photos posted during the year |
  | `photos.byMonth` | 12 counts, January first |
  | `photos.byUser` | Photos per person, most first |
  | `photos.topPhotographer` | Most photos; on a tie, whoever posted first that year |
  | `photos.mostActiveMonth` | `{ month: 1–12, count }`; on a tie, the earlier month |
  | `photos.mostActiveDay` | `{ date: "YYYY-MM-DD", count }`; on a tie, the earlier day |
  | `reactions.total`, `reactions.byUser` | Reactions *given* during the year, on any of the group's photos |
  | `reactions.mostReactedPhoto` | `{ photo, count }`: of the photos posted that year, the one with the most reactions; on a tie, the earlier photo |
  | `comments.total`, `comments.byUser` | Comments written during the year |
  | `activeUserCount` | People who posted, reacted or commented in the group that year, including anyone who has left since |
  | `memberCount` | Members today |
  | `highlights` | Up to 9 photos from the year for the collage: most reactions + comments first, then the earlier photo |

  A year with nothing in it comes back as zeros, empty lists and `null`s.
- **Performance.** On a local MySQL at the spec's full targets for one year (20 members, 10,000 photos, 50,000 reactions, 20,000 comments), a year's stats take about 260 ms.
  - **How it runs:** five queries in parallel, each starting from the group's photos (the `(group_id, created_at, id)` index). The cost grows with the size of the group, not of the whole database.
  - **Why no aggregate tables:** the spec says to add them only if performance requires it. A Wrapped is opened rarely, and a finished year's numbers are saved (see Wrapped below).
  - **If it's ever needed:** the next step would be copying `group_id` onto reactions and comments, so their counts become a single index range scan.

## Wrapped

A group's year, played as a full-screen story of slides. There's a Wrapped for each group and each year in which the group posted at least one photo (years in the viewer's time zone). The **Wrapped** tab appears in the bottom navigation once you have one.

- **API**
  - `GET /api/wrapped?tz=…` lists yours: `{ wrapped: [{ group, year, final }] }`, newest year first. It uses each group's first and last photo times (MIN/MAX off the `(group_id, created_at, id)` index) and checks any years in between.
  - `GET /api/groups/:groupId/wrapped/:year?tz=…` returns `{ wrapped: { group, year, final, timeZone, generatedAt, slides } }` for members (others get 404, and so does a year without photos).
- **Slides.** The server decides which slides there are, and clients write the words around the numbers. In order:
  1. `intro`: "Your 2026 Wrapped"
  2. `photos`: how many photos you took together
  3. `topPhotographer`: the top photographer and up to two runners-up
  4. `busiestMonth`: the biggest month, a 12-month chart and the busiest day
  5. `mostReactedPhoto`: the photo and its reaction count
  6. `reactions`: reactions sent, comments written and who reacted most
  7. `collage`: up to 9 highlights
  8. `outro`: "That's your year together. ❤️" with the totals

  A slide with nothing to show is left out (no reactions means no slides 5 and 6; the collage needs at least 2 photos).
- **Saved once the year is over.** While a year is in progress (`final: false`), its Wrapped is counted live on every opening.
  - **When it's saved:** once the year has ended in that time zone (and 10 more minutes have passed, so photos still uploading at midnight count), the first opening saves the numbers in the `wrapped` table, keyed by group, year and canonical zone name. If two friends open it at the same moment, the first save stands.
  - **After that:** every later opening shows the same story.
  - **What's stored:** the analytics numbers, with people and photos as ids. Names, avatars and photos are looked up when it's shown, so a photo deleted since simply drops out.
  - **Format changes:** a format version in the stored JSON means a change to the numbers recounts older saves (version 2 recounted days in zones where clocks skip midnight; version 3 added the per-person counts below). A save in a newer format than the server knows is left alone.
  - **Speed:** at the spec's full scale, a saved Wrapped loads in about 6 ms, against about 270 ms to count it.
- **The story (web).** `/wrapped` lists them by year; `/wrapped/:year?group=…` plays one full screen, outside the app shell.
  - **Playback:** each slide plays for 4.5 to 8 seconds behind a progress bar. Slides enter with a transition, numbers count up, and charts and photos animate in.
  - **Controls:** tap the right of the screen (or swipe left, or press →) for the next slide, and the left third (swipe right, ←) for the previous one. Press and hold, or Space, to pause; swipe down or Escape to close.
  - **Wide screens:** the story plays in a phone-shaped frame with arrows either side.
  - **Pausing and motion:** playback pauses while the tab is hidden. With reduced motion, numbers and slides appear without animating.

## Polish (Phase 10)

The finishing pass for giving the app to a real group of friends:

- **Spec acceptance check.** I ran the Definition of Done in the browser with two fresh accounts:
  1. Register, create "The Boys", invite, register and join.
  2. Take a photo with the in-app camera and post it.
  3. The friend sees it, reacts ❤️ and comments.
  4. Both browse Memories, and the Wrapped shows the real numbers.

  Then both accounts were deleted from Settings.
- **Loading.**
  - Content-shaped skeletons (feed cards, photo grids, album covers, member and group lists, On This Day) instead of spinners, so pages don't jump.
  - A photo opened from a feed or grid shows at once from the cache while its details load.
- **Errors.**
  - A failed refresh or next page keeps what's already on screen; full error states are only for a first load that fails (`isLoadingError`), and a failed next page offers "Try again" at the bottom.
  - Reactions and favorites that fail to save say so in a toast (`mutation.meta.errorToast`).
  - Deleting a photo or album, removing a member and leaving a group are confirmed in one.
- **Offline.** A banner says when you're offline. Loading and saving wait for the connection and carry on by themselves (TanStack Query pauses them), and posting says "Waiting for connection…". Coming back to the app refreshes what's stale.
- **Camera and upload.**
  - **Layout:** the viewfinder sizes itself so the shutter is never under the navigation bar.
  - **Feedback:** a shutter flash, and a hint while the browser asks for camera access.
  - **Camera handling:** the switch button only appears with a second camera. Capture is up to 2560 × 1920. The camera turns off while the app is in the background.
  - **Smaller uploads:** big JPEG and WebP photos are scaled to 2560 px on the phone before uploading (a 12 MP photo goes from ~5 MB to under 1 MB).
  - **Progress:** posting shows a progress bar (XMLHttpRequest, since `fetch` can't report upload progress).
- **Wrapped.**
  - **Transitions:** slides crossfade, with the outgoing one fading out under the incoming one.
  - **Pausing:** it also freezes the looping decorations.
  - **Fit:** text scales with the story's width (container query units) and fits 320 px screens. Content that doesn't fit a short screen starts at the top instead of being clipped.
  - **Screen readers:** they get the story's heading and previous/next buttons on phones too.
- **Accessibility.**
  - **Titles and focus:** every page sets its title ("Memories · Friendship Wrapped"), and focus moves to the page's heading after navigation.
  - **Headings:** the photo viewer and Wrapped story now have one.
  - **Touch targets:** icon buttons are 44 px, and other small controls at least 40 px.
  - **Dialogs:** tapping the backdrop closes them.
- **Mobile.**
  - **Navigation:** the bottom navigation is four equal slots, so it fits 320 px.
  - **Long names:** group and display names wrap.
  - **Home screen:** a web app manifest and icons let friends add the app to their home screen; it then opens full screen.
- **Settings.** Account deletion (above), and the server status check is folded into "App status" (it opens by itself if something's wrong).

## Redesign: Colour-coded

The web app's look, chosen from two design directions. Everyone in a group has their own colour, and colour only ever means a person: their name tag on a photo, the dots on the reactions they left, their part of Wrapped. Your own colour is your accent (the shutter, switches, your reaction). Everything else is black and white in the Fredoka rounded font (self-hosted with `@fontsource-variable/fredoka`, width and weight axes). There's no red: destructive actions say what they do and ask first.

- **Themes.** Settings → Appearance: Match device (the default), Light or Dark.
  - **How it works:** `html[data-theme]` swaps the CSS colour tokens in `index.css` (`bg`, `fg`, `sub`, `surface`, `line`, `raised`, `inverse`, `accent`), which Tailwind uses as `bg-bg`, `text-sub` and so on.
  - **No flash:** an inline script in `index.html` sets the theme and your last colour before the first paint; `lib/theme.ts` then follows the device live.
- **Member colours.** 12 colours (`lib/member-colors.ts`), one per person per group, so you can have different colours in different groups. You get the first free one when you join and can change it in the group's settings; colours someone else has show their initial and can't be picked. Members beyond 12 are grey until a colour is free.
- **Group picture.** A group photo if the owner set one, otherwise a badge of everyone's colours in the order they joined, with the group's emoji on top (`GroupAvatar`).
- **Screens.**
  - **Home** is the feed of the group you last looked at, with a group switcher in the header. `/home` redirects there.
  - **Camera:** full screen with a square viewfinder (photos are cropped square), the group you're posting to, and who will see it.
  - **Memories:** adds a "Taken by" filter (one person's photos).
  - **Photo menu:** save (when allowed), report, block, delete, add to an album.
  - **Group settings:** your colour, the group photo, members (report, block, remove), name and emoji, mute, invite links, leave.
- **Settings** (`/settings/*`):
  - **Account:** profile photo, display name, username, password (signs out your other devices), signed-in devices, download your photos (zip), delete account.
  - **Notifications:** turn on push for this device, a master switch, photos, reactions, comments, new members, On this day, Wrapped, quiet hours, and mute per group.
  - **Appearance:** theme, app icon (the browser tab icon; the iPhone app can change its Home Screen icon), reduce motion (Match device, On or Off; it also overrides the `motion-reduce:` variant), haptics (where the browser can vibrate).
  - **Privacy & safety:** location is always removed; let friends save your photos; show my name in Wrapped; blocked people; invite links you've made; report a problem.
  - **Photos & data:** which camera opens first, mirror the front camera, grid lines, save a copy of what you post, photo quality (standard 1920 px or high 2560 px), upload on mobile data (where the browser can tell), data saver (never the full-size photo), and the photos saved on this device (with Clear).

  Appearance and Photos & data are per device (`lib/device-settings.ts`, in localStorage). Account, notification and privacy settings are stored with your account.
- **Service worker** (`client/public/sw.js`): shows push notifications and opens the right page when you tap one, and keeps photo images you've seen in a cache (photos never change once posted). Signing out empties it and unsubscribes the device.
- **API additions.** All additive, so the iOS app keeps working.
  - **Colours:** `PATCH /api/groups/:groupId/members/me` `{ color?, muted? }` (`409 COLOR_TAKEN`). `color` on members, and `myColor`, `muted` and `avatarUrl` on groups.
  - **Group photo:** `PUT`, `DELETE` and `GET /api/groups/:groupId/avatar` (owner sets it; members see it).
  - **Photos:** `reactions.reactors` (`{ userId, type }[]`), `canSave`, `GET /api/photos/:id/images/full?download=1`, `GET /api/groups/:groupId/photos?uploaderId=…`.
  - **Settings:** `GET` and `PATCH /api/users/me/settings` (deep partial).
  - **Account:** `PATCH /api/users/me` also takes `username` (`409 USERNAME_TAKEN`). `PUT /api/users/me/password`. `GET /api/users/me/sessions`, `DELETE /api/users/me/sessions/:sessionId`, `DELETE /api/users/me/sessions` (all others). `GET /api/users/me/photos/archive` (zip). `GET /api/users/me/invites`, `DELETE /api/users/me/invites/:inviteId`.
  - **Safety:** `GET /api/users/me/blocks`, `PUT` and `DELETE /api/users/me/blocks/:userId`. A block hides photos, comments and reactions both ways, everywhere, and stops notifications between the two people. `POST /api/reports` (stored; rate limited).
  - **Wrapped:** `byUser` on the photos and busiest-month slides, and `color` on every person. People who turn off "Show my name in Wrapped" count in the totals but are left off person slides. Saved Wrapped are format version 3.
  - **Push:** `GET /api/notifications/push-key`, and `POST` and `DELETE /api/notifications/subscriptions`.
- **Push notifications** (Web Push, `web-push`). New photos, reactions to your photos, comments, new members, On this day (09:00 your time) and Wrapped (1 January, 10:00).
  - **Never sent:** to the person who did it, between blocked people, or from a group you've muted.
  - **Quiet hours:** notifications are queued and sent when quiet hours end (only the latest per kind).
  - **Scheduler:** runs every minute in the server process, only when push is configured. It needs `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`; without them push is simply off.
  - **On iPhone:** web push only works once the app is added to the Home Screen.

## Local machine notes

- MySQL runs as the Windows service `MySQL84`, bound to `127.0.0.1` only.
- Local secrets (the MySQL root password, dev test-account logins) live in `.local/`, which is gitignored.
- Prisma 7.10.0 pins vulnerable versions of `mariadb`, `mysql2` and `deepmerge-ts`, so `overrides` in the root `package.json` lift them to patched releases. The overrides are keyed to the exact Prisma 7.10.0 packages, so they stop applying once Prisma is upgraded. When bumping Prisma, update the `allowScripts` versions below, re-run `npm audit`, and drop the overrides (or re-key them if the new release still pins vulnerable versions).
- npm 11 only runs install scripts for packages listed under `allowScripts` in `package.json` (Prisma's engines, esbuild).
- The API dev watcher is `node --watch-path=./src --import tsx` rather than `tsx watch`, because `tsx watch` hangs on Windows when run under `concurrently`.
  - It watches only `src/`: plain `--watch` on Windows treated a dependency file loaded for the first time as a change, and restarted the API mid-request.
  - After `npm install`, restart `npm run dev` yourself.
- MinIO was built from source with Go 1.27 (`go install github.com/minio/minio@latest`), because the winget package's download is gone (HTTP 410). The binary is `%USERPROFILE%\go\bin\minio.exe`.
