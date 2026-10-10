# Friendship Wrapped: technical reference

Detailed notes on how each part of the app works: authentication, groups, photos, the feed, social features, memories, analytics, Wrapped, polish and the colour-coded redesign. For setup and an overview, see the [README](../README.md).

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
| 11 | Invite polish: QR code, link lifetime (a day, a week, a month), an expired screen that names who sent it | ✅ Done |
| 12 | iPhone push (APNs): new photos, reactions, comments, nudges, On This Day and Wrapped alerts | ✅ Server and app built; ⚠️ needs a real iPhone and an APNs key to try end to end |
| 13 | Nudges and group pulse: one gentle reminder per person per fortnight, a "this month" card, a weekly group streak | ✅ Done |
| 14 | Wrapped share cards and a personal card (Wrapped format 4) | ✅ Done |
| 15 | Moments: a few hours in which the group posts into one shared place | ✅ Done |
| 16 | Videos and Live Photos: a video is a photo post with a video attached | ✅ Server and web built and tested with real ffmpeg; ⚠️ iPhone playback needs a real iPhone (see [Videos and Live Photos](#videos-and-live-photos)) |

The native iOS app in [`ios/`](../ios/README.md) covers phases 1–16 and the Colour-coded redesign too.

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
- ffmpeg and ffprobe, optional: needed to post videos (see [Videos and Live Photos](#videos-and-live-photos)). Without them the app works as before and videos are turned away with a clear message. Put them on `PATH` or set `FFMPEG_PATH` and `FFPROBE_PATH`. The video tests skip themselves when they can't run.

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

For email (the confirmation link and the new sign-in notice), set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE` and `MAIL_FROM` to any provider's SMTP settings (Resend, Postmark, Amazon SES, Gmail, …), and `APP_URL` to the web app's public address (required in production once `SMTP_HOST` is set: it is what the links in emails point to). Without `SMTP_HOST` nothing is sent: in development each email is printed in the server's log (so you can open its link from there); in production only the fact that it wasn't sent is logged, since a link in a log is a credential. Set `ADMIN_EMAILS` to your own address (comma-separated for more than one) to open the admin panel. Tests don't need any of these.

If the API runs behind a reverse proxy or a platform's load balancer (nginx, Caddy, Render, Fly, …), set `TRUST_PROXY` to **the number of proxies in front of it** (usually `1`). The per-address rate limits (sign-up, login, email confirmation, …) read the client's address from the `X-Forwarded-For` header the proxy adds; without `TRUST_PROXY` every request appears to come from the proxy itself, and those limits become global (by default only 30 sign-ups an hour for everyone together). The default is off, which is right when the API is reached directly (as in development): there `X-Forwarded-For` is whatever the client writes, so believing it would let anyone dodge the limits with a made-up address. Only a number is accepted (`true` is refused for that reason), and it has to be exact: with too few the limits stay global, and with more than there are, the extra hops are taken from what the visitor sent. Also keep the API reachable only through the proxy, since a request that skips it can carry any header it likes.

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
                      storage (S3), images (sharp), upload (multer), send-image, mail (SMTP, email layout),
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

- **Accounts.** Email (stored lowercase, unique) + username (stored lowercase) + display name + password. Passwords are hashed with Node's built-in scrypt (N=2¹⁵, r=8, p=3). The parameters are stored with each hash so they can be raised later. People sign in with their email address or their username (see [Email and sign-in alerts](#email-and-sign-in-alerts)).
- **Sessions.** Server-side rows in `sessions`. The browser gets a random 256-bit token in an `HttpOnly`, `SameSite=Lax` cookie (`__Host-` prefixed and `Secure` in production). Only the token's SHA-256 is stored, so a database leak can't be replayed. Sessions last 30 days and slide forward while in use. Logout deletes the row.
- **Protecting an endpoint.** Add `requireAuth` to the route and read the user with `currentUser(req)` in the controller. Never take a user id from the request body. `requireAuth` also answers `403 EMAIL_NOT_VERIFIED` until the account's email is confirmed; only the few routes whose job is confirming it use `requireSession` (signed in, not necessarily confirmed) instead.
- **Hardening.** Login is rate-limited (10 attempts / 15 min per IP + email or username), and sign-up (every sign-up sends an email) to 30 accounts per hour per IP (`SIGNUP_LIMIT_PER_HOUR`). "Per IP" is `req.ip`, which behind a proxy is only the visitor's address if `TRUST_PROXY` is set (see [Environment](#environment)). Unknown usernames take the same time and get the same response as wrong passwords. State-changing requests from another origin are rejected (CSRF defence in depth). All API responses are `Cache-Control: no-store`.
  - **Spelling variants:** login only looks up names that could have been registered. MySQL's collation ignores accents, so without this `álice` would find `alice` and get its own 10 attempts.
  - **Memory:** the limiter's counters are capped, and its key uses at most 64 characters of the username, however long the one sent.
  - **Logs:** invite tokens in URLs are logged as `…`, since an invite link is a credential.
- **Client.** `useSession()` holds the signed-in user (or `null`). `<RequireAuth>` and `<RedirectIfAuthenticated>` guard routes, and send people back to the page they wanted after login. Any `401 UNAUTHORIZED` response signs the client out, and any `403 EMAIL_NOT_VERIFIED` makes it look at the session again (which shows the page asking for the email link).

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | — | Create an account (`{ email, username, displayName, password }`), sign in, and email the confirmation link |
| `POST` | `/api/auth/login` | — | Sign in (`{ identifier, password }`: an email address or a username; `username` is the field's older name and still works) |
| `POST` | `/api/auth/logout` | — | Revoke the current session |
| `GET` | `/api/auth/session` | — | Current user, or `{ "user": null }` |
| `POST` | `/api/auth/verify-email` | — | Confirm an address with the token from the emailed link (`{ token }`) |
| `POST` | `/api/auth/forgot-password` | — | Email a link to choose a new password (`{ identifier }`: an email or a username). Always `204`, whether or not there's such an account |
| `POST` | `/api/auth/reset-password/check` | — | Whether a reset link still works (`{ token }`): `204`, or `400 INVALID_LINK`. Changes nothing |
| `POST` | `/api/auth/reset-password` | — | Choose a new password with the link's token (`{ token, newPassword }`); every device is signed out |
| `POST` | `/api/auth/email/resend` | session | Send the confirmation link again (at most one a minute) |
| `PUT` | `/api/auth/email` | session | Set or change the email (`{ email, password }`); it must be confirmed again |
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

## Email and sign-in alerts

Every account has an email address, and nobody gets into the app until it is confirmed.

- **Signing up** takes an email, which is lowercased and unique (`409 EMAIL_TAKEN`). The account starts unverified, the person is signed in so they can finish, and a confirmation email goes out. The email says nothing about who signed up (it goes to whatever was typed in, which may not be theirs).
- **An address belongs to whoever has confirmed it.** An account that only typed an address in and never opened the link lets go of it when someone else signs up with it or changes to it (it is left with no address and is asked for one). Without this anyone could squat on another person's address and keep its owner from using it. A confirmed address is never taken away. Letting go and creating the new account (or changing to the address) are one transaction, so a sign-up that is turned away (the username was taken, say) takes nothing from whoever was waiting for their link.
- **The link** is `<APP_URL>/verify-email?token=…`: 256 random bits, valid for 24 hours, only its SHA-256 stored (`email_verification_tokens`), single use, and tied to the address it was sent to (changing the address makes older links do nothing). Opening the page confirms the address by calling `POST /api/auth/verify-email` from the page's script, so a mail scanner that only fetches the URL can't use it up; one that runs scripts could, and so can anyone who clicks. That is harmless for an ordinary address (whoever opens it just proves the inbox is theirs). **An address on the admin list is the exception:** it is confirmed only by someone signed in to the account that has it (`403 SIGN_IN_TO_CONFIRM` otherwise; the page sends them to log in and back), and the admin panel can't mark one confirmed either. Then no one can become an admin by signing up with the owner's address and waiting for the owner to open a link. A new link is created before the old ones are retired, so a mail server that is down never takes away a link that was working.
- **The gate.** Until the address is confirmed, `requireAuth` answers every other request `403 EMAIL_NOT_VERIFIED`. The web app then shows only the page asking for the link (`EmailGate`): it checks in the background every few seconds and when the tab comes back, offers "Send the email again" (one a minute, `429 EMAIL_COOLDOWN` with the wait in `details.retryAfterSeconds`), and "Use a different email". The iPhone app shows the same screen (`EmailGateView`; session phase `needsEmail`).
- **Accounts from before email was required** have no address. They sign in with their username as before and are asked to add one (with their password) before anything else loads. The admin panel lists them (System → "Accounts without an email").
- **Changing the address** (Settings → Account → Email, `PUT /api/auth/email`, needs the password; 4 tries per 15 minutes, and "send again" 8) makes it unverified again and emails a link to the new one, and the person is held at the gate until it is opened (a typo is fixed from the gate). If the old address was verified it is told, in case it wasn't the owner. Anyone can still make this server send one email to an address they don't own; the per-account limits, the one-a-minute resend and the 30-sign-ups-an-hour limit per IP are what bound it.
- **Keeping the account safe** works before the email is confirmed: changing the password, seeing and signing out devices, and deleting the account use `requireSession`, not `requireAuth`. Someone who suspects a break-in, or doesn't want to give an email, isn't stuck.
- **Signing in** takes the email (any case) or the username. Unknown accounts and wrong passwords get the same answer and the same time.
- **Forgot password.** "Forgot your password?" on the login page (web and iPhone) asks for an email or a username and emails a link to the address on that account. The reset itself happens on the web page `<APP_URL>/reset-password?token=…` (the iPhone app has the link open in the browser, then you log in as usual).
  - **It says nothing about who has an account.** `POST /api/auth/forgot-password` answers `204` for a real account, an unknown name, a malformed address and an old account with no email alike, and a skipped email (the cooldown) is silent too. The per-name limit (5 an hour) counts every attempt, whether or not the name is an account, so being turned away says nothing either. Also 10 asks per 15 minutes per IP, and one email a minute per account.
  - **The link** is 256 random bits, valid for an hour, only its SHA-256 stored (`password_reset_tokens`), and tied to the address it was sent to: if the account's address changes, the link does nothing. Asking again does **not** cancel earlier links (a stranger asking for your name mustn't kill the one you're about to open); using any of them, changing the password or changing the address ends them all.
  - **Using it.** The page asks the server whether the link still works before showing the form (`POST /api/auth/reset-password/check`, which changes nothing), so a mail scanner that opens it can't spend it. The new password follows the registration rules. Setting it is one transaction: the link is deleted (only one of two simultaneous tries can succeed), the password changes, the address becomes confirmed if it wasn't (the link proved the inbox is theirs), and **every session of the account ends**, whoever was signed in. It doesn't sign anyone in: they log in with the new password. The address is emailed that the password was changed, in case it wasn't them.
  - **Addresses nobody confirmed.** The link goes to the address on the account even if it was never confirmed, so someone who signed up, never opened the first link and then forgot the password isn't stuck. Whoever reads that inbox gets the account, and whoever knew the old password loses it, so squatting on someone's address (the admin's included) gains nothing.
  - **Old accounts with no email** have nowhere to send a link and can't use this; an admin can give them an address with the `admin:verify-email` command below.
- **New sign-in email.** When a device the account hasn't signed in from before signs in, the verified address is emailed the device ("Chrome on Windows") and the time, with a link to Settings → Account to see the devices and sign the others out. A device is told apart by a random id it keeps: the `fw_device` cookie in a browser (400 days), or the `X-Device-Id` header the iPhone app sends from its Keychain. Only a hash is stored (`known_devices`, at most 50 per person). A client that sends neither counts as new every time. Signing up is not a "new device" (the confirmation email is that email), and an unverified address gets no such email.
- **Sending** (`lib/mail.ts`) goes out over SMTP with nodemailer, in the background (a slow mail server never holds up a request, and a failure is logged and goes no further: the person can ask again). `lib/mail-layout.ts` renders each message as HTML and plain text. Tests swap in a fake transport (`captureMail()` in `test/helpers.ts`).
- **Without a mail server** (`SMTP_HOST` unset) nothing is sent, so **nobody can confirm an address and nobody gets in**: set up SMTP *before* you deploy this to an existing group. If it isn't there yet, an admin marks people by hand in the admin panel (Users → the person → "Mark email as confirmed"), and the first admin, who can't open the panel yet, uses the command line on the server:

  ```bash
  npm run admin:verify-email -w server -- you@example.com          # an account that already has this address
  npm run admin:verify-email -w server -- you@example.com yourname # an older account with no email: give it this one, confirmed
  ```

  The same command rescues anyone locked out by a mail outage. The server logs a loud warning at startup in production when `SMTP_HOST` is missing, and the System page shows it.

## Admin panel

For whoever runs the server: `/admin` in the web app, with the API under `/api/admin`. There is no admin role in the database. An account is an admin when its email is **verified** and listed in `ADMIN_EMAILS` (so nobody can claim an address without owning its inbox). Anyone signed in who isn't an admin gets a 404 for every admin route and the page, as if there were none (signed-out visitors get the usual 401, and an unconfirmed account its 403). The web app shows an "Admin panel" row at the top of Settings for admins.

- **Overview.** People (accounts, active today / this week / this month, confirmed and waiting emails), groups, what's been shared (photos, videos, comments, reactions, storage), reports, notification devices, 30-day charts of new accounts and posts, and a summary of the system checks.
- **Users.** Search by name, username, email or id (case-insensitive; `%` and `_` are escaped, not wildcards), filter by confirmed / waiting / no email, newest first with a keyset cursor. A person's page shows their account, what they've shared, their groups, the devices they're signed in on and have been seen on, and has the actions: mark the email confirmed, send the confirmation email again, sign out of every device, and delete the account (the person's own deletion, minus the password; you type the username to confirm; not your own, not an admin's).
- **Groups.** Search by name or id; a group's page shows its members and roles, activity, storage, open moment and saved Wrapped years, with the actions remove a member (as if they'd left: an owner's role passes on, an emptied group is deleted) and delete the group (type its name). It shows who and how much, never what was posted: photos, captions and comments are not readable from here.
- **Reports.** What people reported, newest first, with who, about whom or which post and group.
- **System.** Checks that everything works, each marked working / needs attention / broken / not set up: database (version, migrations applied or failed), photo storage, email (a real SMTP login, nothing sent), web push, iPhone push, video (ffmpeg), the web address in emails, admin access, and data (every group has exactly one owner, no empty groups, people waiting over a week to confirm, accounts with no email, overdue queued notifications, expired sessions and links). It also has "Send test email" (to your own address, 5 per 10 minutes, with the mail server's refusal shown if it says no), the server's uptime and memory, and the last 50 warnings and errors the server logged (kept in memory, cleared by a restart).
- **Audit.** Every change an admin makes (mark verified, resend, sign out, delete, remove) is written to the server log with who did it.

## Groups

- **Roles.** `group_members.role` is the single source of truth: each group has exactly one `OWNER`, and everyone else is a `MEMBER`.
  - **Owner only:** rename the group or change its emoji, remove members, reset invite links.
  - **Any member:** see members, create invite links, leave.
- **Privacy.** Every group endpoint checks membership on the server (`requireMembership` / `requireOwner` in `groups.service.ts`). Non-members get a **404**, never a 403, so they can't tell a group exists. New features scoped to a group (photos and so on) must go through the same check.
- **Invite links.** `/invite/<token>`: 128 random bits, and only the token's SHA-256 is stored, so a link can't be shown again later. Members just create a new one. The link is the credential:
  - **How long it lasts:** the creator picks 1, 7 (the default) or 30 days (`lifetimeDays`; no body means 7, so older apps are unaffected). Any other number is a 400.
  - **QR code:** the invite card can show the link as a QR code, drawn on the device (web: `uqr`; iPhone: Core Image). It's black on white in every theme, since inverted codes don't scan reliably.
  - Anyone holding it can see a preview (name, emoji, member count, who invited them) without an account, then sign up or log in and come back to join.
  - Accepting twice is harmless.
  - Links stop working if the owner resets them, or if the person who created them leaves.
  - Removing someone resets every link of the group (they may have kept any of them), so they can only come back with a new one.
  - **Expired links:** an expired link is kept for 30 more days so its page can say who to ask ("Alice invited you to join 🍻 The Boys, but the link has run out"). It answers `404 INVITE_EXPIRED` with `details: { invitedBy, groupName, groupEmoji }`. It's a 404 like any dead link, so older apps still show their expired message. A link that was turned off, never existed, or expired more than 30 days ago answers `404 INVITE_INVALID` with no details; so does one whose creator has left, since there is nobody to name. The next link made in the group sweeps up the ones past 30 days.
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
| `POST` | `/api/groups/:groupId/invites` | member | Create an invite link. Optional `{ lifetimeDays: 1 \| 7 \| 30 }` (default 7) |
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
| `POST` | `/api/groups/:groupId/photos` | member | Post a photo or a video (`photo` and/or `video`) |
| `GET` | `/api/groups/:groupId/photos` | member | Newest first: `{ photos, nextCursor }`. Optional `before` (ISO instant) and `favorites=true` |
| `GET` | `/api/photos/:photoId` | uploader or member | Photo details, its group, and its neighbours in the feed (`feed`) |
| `GET` | `/api/photos/:photoId/images/:variant` | uploader or member | `thumbnail`, `medium` or `full` (WebP) |
| `GET` | `/api/photos/:photoId/video` | uploader or member | A video post's MP4, with `Range` support; `?download=1` as an attachment where saving is allowed |
| `DELETE` | `/api/photos/:photoId` | uploader | Delete the photo and its files |

## Videos and Live Photos

A video is a **photo post with a video attached**, not a second kind of thing. `Photo.kind` is `PHOTO` or `VIDEO`, and a video's poster frame goes through `processPhoto` into the same three renditions as any photo. So the feed, grid, viewer, reactions, comments, favourites, albums, moments, On This Day, Wrapped, share cards, the photo archive and blocking all work for videos unchanged. Only the code that *plays* a video knows the difference.

- **Posting.** `POST /api/groups/:groupId/photos` takes `video` (a file, ≤ 100 MB, at most 60 seconds) instead of or as well as `photo`. A `photo` sent with a video is its **still picture** (a Live Photo's still); without one a frame about a second in is the poster. `live=true` marks a Live Photo's motion. Membership is checked before the body is read, as for photos. The video is streamed to a temporary file as it arrives (never held in memory) and the file is removed afterwards, however the request ended.
- **Validation** (`modules/photos/video-post.ts`), before the server converts anything:
  - the first bytes must be an MP4/MOV box or a WebM/Matroska header (never the file name or MIME type), so playlists and scripts that name other files or addresses are turned away (`415 UNSUPPORTED_VIDEO`);
  - `ffprobe` must find a video stream with a duration; over 60 seconds is `413 VIDEO_TOO_LONG`, over about 36 megapixels `413 VIDEO_TOO_LARGE`;
  - ffmpeg is only ever allowed to read local files (`-protocol_whitelist file`), and arguments always go as a list, never through a shell.
- **Conversion** (`lib/ffmpeg.ts`): H.264 (High, yuv420p) + AAC stereo MP4 at most 1280 px on the long side, turned upright, all metadata and chapters dropped (so *where it was filmed* is gone, like a photo's GPS), the index at the front (`+faststart`) so it plays while it downloads. At most 2 conversions run at once and each is stopped after 3 minutes. The upload itself is not kept. Without ffmpeg the answer is `503 VIDEO_UNAVAILABLE`, and photos carry on.
- **Storage.** `…/photos/<random>/video.mp4` beside the three WebP renditions. Deleting a post, the account or the group removes it with them. `Photo.videoDurationMs`, `videoSizeBytes` and `videoIsLive` ride along; the API shows `kind: "photo" | "video"` and `video: { url, durationMs, sizeBytes, isLive } | null`, both additive.
- **Playing.** `GET /api/photos/:photoId/video` streams the MP4 to uploader and members (404 to anyone else, and when blocked) with `Accept-Ranges: bytes`. A `Range` request gets `206` with the piece asked for (`lib/http-range.ts` follows RFC 9110: one range, a suffix, an end past the file cut back, `416` with `Content-Range: bytes */size` when it starts past the end, several ranges or nonsense just get the whole file), fetched from storage as a ranged read. That is what lets a browser start at once and scrub, and AVPlayer play at all. `?download=1` is an attachment, only if the uploader allows saving (`canSave`), never cached.
- **Web.** The gallery button offers photos and videos. A video is checked for type, size and length in the browser before it is sent (a codec the browser can't read just goes to the server's check). The viewer shows the `<video>` with the poster, the grid and feed show a play badge with the length, and "Save video" downloads the MP4. A Live Photo's motion plays by itself, muted and looping, unless Data saver is on or motion is reduced.
- **iPhone.** The picker offers photos, videos and Live Photos. A video (or a Live Photo's paired video, read from the library, which asks for permission the first time) is converted on the phone to a 720p H.264 MP4 first, because the camera's HEVC and 4K recordings can be hundreds of megabytes. The server converts again regardless. Playback sends the session cookie to AVPlayer by hand (`AVURLAssetHTTPHeaderFieldsKey`), because AVPlayer doesn't send cookies by itself. **This is the first thing to test on a real phone.** If the player can't start streaming, the app downloads the video and plays it from disk, so it still plays.
- **Not done.** Recording video inside the app's camera (videos come from the library and from Live Photos); trimming a too-long video on the device (it must be at most a minute).

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

## Moments

A **moment** is something the group is doing right now: "Friday at the lake". Anyone in the group starts one; for a few hours it is open, friends are told, and photos posted into it are collected on its page (Memories → Moments, and a banner above the feed while it lasts). It closes by itself.

It is its own model (`moments`), not an extension of albums: an album is a collection of photos that already exist, picked by hand afterwards; a moment is open while it happens, and photos join it as they are posted. (The roadmap named the model but not its behaviour, so this is the design that was built: it is easy to change.)

- **Starting.** `{ title (1–60 characters, one line), emoji? (a single emoji), durationHours? (1, 3, 12 or 24; default 3) }`. A group has **one open moment at a time**: starting another while one is open is `409 MOMENT_ALREADY_OPEN` with the open one's id in `details`. The check and the write share a serializable transaction, so two people starting at once can't both succeed.
- **Posting into it.** `POST /api/groups/:groupId/photos` takes an optional `momentId` field. It must be one of the group's moments and still open: another group's is a 400, one that isn't there a 404, and one that has ended `409 MOMENT_ENDED` (nothing is posted; the apps offer "Post to the group instead"). It is checked before the image is processed and again in the same transaction as the write, so a moment closing mid-upload can't take a late photo. A photo is in at most one moment (`photos.moment_id`); photos show it as `momentId`.
- **Ending and deleting.** The creator and the group owner can end a moment early (`endsAt` moves to now; ending one that has ended changes nothing) or delete it. Deleting leaves its photos in the group (`moment_id` becomes `NULL`). Other members get a 403.
- **The page.** A moment's photos are listed oldest first with the usual cursor, minus photos by people with a block between them and the viewer; its photo count and cover (the newest photo) follow the same rule.
- **Accounts and groups.** A moment belongs to its group, like an album: if its creator's account is deleted it stays (`created_by_id` becomes `NULL`, and the owner can still manage it), and their photos in it are deleted with the rest of their photos. It goes when the group does.
- **Notifications.** A new kind, `moments` (on by default; Settings → Notifications), tells the rest of the group "Tomáš started a moment: 🌙 Friday at the lake", under the usual rules (never the person who did it, never across a block, mutes, quiet hours). Tapping it opens `/memories/moments/:id`.

| Method | Endpoint | Who | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/groups/:groupId/moments` | member | Newest first: `{ moments, nextCursor }` |
| `GET` | `/api/groups/:groupId/moments/open` | member | `{ moment }`: the one taking photos now, or `null` |
| `POST` | `/api/groups/:groupId/moments` | member | `{ title, emoji?, durationHours? }`: start one |
| `GET` | `/api/moments/:momentId` | member | One moment |
| `POST` | `/api/moments/:momentId/end` | creator or owner | End it now |
| `DELETE` | `/api/moments/:momentId` | creator or owner | Delete it (not its photos) |
| `GET` | `/api/moments/:momentId/photos` | member | Oldest first: `{ photos, nextCursor }` |

A moment comes back as `{ id, groupId, title, emoji, startsAt, endsAt, isOpen, createdBy, photoCount, cover, canManage }`.

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

## Group pulse and nudges

Two gentle ways to keep a group going. **Neither ever names, counts or hints at who hasn't posted.**

- **This month.** `GET /api/groups/:groupId/pulse?tz=Europe/Bratislava` returns `{ pulse }` for members (others get 404): the group's photos, reactions given and comments written this calendar month in the viewer's time zone, and its weekly streak. The card sits above the feed on Home (web and iPhone) once there is someone else in the group, and says "A fresh month" when nothing has happened yet.
  - **Only the group.** The response has no people in it at all: no ids, names or per-person counts. A test asserts its exact keys.
  - **Weekly streak.** Weeks run Monday to Sunday from local midnight in the viewer's zone. The streak is the number of weeks in a row with at least one photo from anyone in the group, counting this week once it has one. A week still in progress doesn't break it: with no photo yet, it counts back from last week and `thisWeekDone` is false ("a photo this week keeps it going"). It is counted one indexed lookup per week, eight at a time, until a week with no photo (at most 520 weeks), so it costs little. It is the same for every member.
  - **Cache.** On the web, posting or deleting a photo refreshes the card (`pulseKeys`).
- **Gentle reminders** (a notification kind, `nudges`, on by default; Settings → Notifications → Reminders). The scheduler considers each person once a day, in the early evening (17:00–20:00 their time), and sends at most one reminder per person per fortnight, whichever group it is about (`user_settings.nudged_at`, claimed atomically so two server processes can't both send).
  - **Who:** someone who hasn't posted in any group for 10 days, about a group they've been in for at least a week, haven't muted, and where somebody else has posted in the last 14 days. If there are several, the group with the newest photo from someone else. If none qualifies, the person keeps their fortnight.
  - **What it says:** "Got a moment from this week? Share it with The Boys 📸". It is about the person's own quiet, with no names and nothing about anyone else. Tapping it opens the camera for that group (`/camera?group=…`).
  - **How it travels:** like any notification: browsers and iPhones, quiet hours, the master switch and the per-kind switch all apply. A person needs a time zone (the apps keep it up to date) for it to know when evening is.

| Method | Endpoint | Who | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/groups/:groupId/pulse?tz=…` | member | `{ pulse: { timeZone, month: { year, month, from, to, photos, reactions, comments }, streak: { weeks, thisWeekDone } } }` |

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
  8. `you`: your own year in the group (see below)
  9. `outro`: "That's your year together. ❤️" with the totals

  A slide with nothing to show is left out (no reactions means no slides 5 and 6; the collage needs at least 2 photos; someone who did nothing that year gets no `you` slide).
- **Your own card** (`you`). It is the viewer's, built for each person who opens the story: `{ photos, reactionsGiven, commentsWritten, reactionsReceived, commentsReceived, busiestMonth, bestPhoto }`.
  - **Only theirs.** It holds counts and one photo of their own, nothing about anyone else. It also comes back as `you` in `GET /groups/:groupId/stats/:year`.
  - **Opting out.** Someone who turned off "Show my name in Wrapped" still sees their own card: the setting only keeps their name off other people's slides.
  - **What the numbers mean.** `reactionsGiven` and `commentsWritten` are counted in the year, like the rest of Wrapped. `reactionsReceived` and `commentsReceived` are on photos *posted* that year, from anyone and whenever given (as for the most reacted photo). `busiestMonth` is their own busiest month (the earlier on a tie). `bestPhoto` is their most reacted-to photo of the year: only each person's single best is saved, so if it was deleted after the year was saved, the card has no best photo rather than a broken one.
- **Saved once the year is over.** While a year is in progress (`final: false`), its Wrapped is counted live on every opening.
  - **When it's saved:** once the year has ended in that time zone (and 10 more minutes have passed, so photos still uploading at midnight count), the first opening saves the numbers in the `wrapped` table, keyed by group, year and canonical zone name. If two friends open it at the same moment, the first save stands.
  - **After that:** every later opening shows the same story.
  - **What's stored:** the analytics numbers, with people and photos as ids. Names, avatars and photos are looked up when it's shown, so a photo deleted since simply drops out.
  - **Format changes:** a format version in the stored JSON means a change to the numbers recounts older saves (version 2 recounted days in zones where clocks skip midnight; version 3 added the per-person counts below; version 4 added each person's busiest month and the reactions and comments their photos received, for the personal card). A save in a newer format than the server knows is left alone.
  - **What the version 4 bump changes.** The first time a year saved in an older format is opened, it is counted again from the database as it is now and saved as version 4. Its numbers can therefore differ slightly from what friends saw before: a photo, comment, reaction or account deleted since no longer counts. From then on it is fixed again. A year not yet saved is simply counted and saved in version 4.
  - **Speed:** at the spec's full scale, a saved Wrapped loads in about 6 ms, against about 270 ms to count it.
- **The story (web).** `/wrapped` lists them by year; `/wrapped/:year?group=…` plays one full screen, outside the app shell.
  - **Playback:** each slide plays for 4.5 to 8 seconds behind a progress bar. Slides enter with a transition, numbers count up, and charts and photos animate in.
  - **Controls:** tap the right of the screen (or swipe left, or press →) for the next slide, and the left third (swipe right, ←) for the previous one. Press and hold, or Space, to pause; swipe down or Escape to close.
  - **Wide screens:** the story plays in a phone-shaped frame with arrows either side.
  - **Pausing and motion:** playback pauses while the tab is hidden. With reduced motion, numbers and slides appear without animating.
- **Share cards.** The share button in the story's top bar (every slide but the intro) turns the slide on screen into a 1080 × 1920 picture and opens the system share sheet with it.
  - **On the device, and only out through the share sheet.** The card is drawn on the phone or browser (web: a canvas; iPhone: SwiftUI's `ImageRenderer`) and nothing about it goes to the server beyond fetching the photos it shows. Browsers with no share sheet for files (most desktop ones) save the PNG to downloads instead.
  - **Photos you may not save are colour blocks.** Exporting a card counts as saving, so a photo whose uploader turned off photo saving (`canSave` is false for you) is replaced by a block of the uploader's colour, and its image is never even requested. Your own photos always show. The decision is plain data (`card-plan.ts`, `ShareCard.swift`) with tests.
  - **Written for whoever it's sent to.** A card says "We took 120 photos" and names people by first name rather than "You", and always looks the same, whatever theme the sender uses. People who left themselves out of Wrapped are left off, as in the story. Your own card says "{Name}'s 2026".

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
  - **Notifications:** turn on push for this device, a master switch, photos, reactions, comments, new members, moments, On this day, Wrapped, gentle reminders, quiet hours, and mute per group.
  - **Appearance:** theme, app icon (the browser tab icon; the iPhone app can change its Home Screen icon), reduce motion (Match device, On or Off; it also overrides the `motion-reduce:` variant), haptics (where the browser can vibrate).
  - **Privacy & safety:** location is always removed; let friends save your photos; show my name in Wrapped; blocked people; invite links you've made; report a problem.
  - **Photos & data:** which camera opens first, mirror the front camera, grid lines, save a copy of what you post, photo quality (standard 1920 px or high 2560 px), upload on mobile data (where the browser can tell), data saver (never the full-size photo), and the photos saved on this device (with Clear).

  Appearance and Photos & data are per device (`lib/device-settings.ts`, in localStorage). Account, notification and privacy settings are stored with your account.
- **Service worker** (`client/public/sw.js`): shows push notifications and opens the right page when you tap one, and keeps photo images you've seen in a cache (photos never change once posted). Signing out empties it and unsubscribes the device.
- **API additions.** All additive, so older app builds keep working. The iOS app uses them all.
  - **Colours:** `PATCH /api/groups/:groupId/members/me` `{ color?, muted? }` (`409 COLOR_TAKEN`). `color` on members, and `myColor`, `muted` and `avatarUrl` on groups.
  - **Group photo:** `PUT`, `DELETE` and `GET /api/groups/:groupId/avatar` (owner sets it; members see it).
  - **Photos:** `reactions.reactors` (`{ userId, type }[]`), `canSave`, `GET /api/photos/:id/images/full?download=1`, `GET /api/groups/:groupId/photos?uploaderId=…`.
  - **Settings:** `GET` and `PATCH /api/users/me/settings` (deep partial).
  - **Account:** `PATCH /api/users/me` also takes `username` (`409 USERNAME_TAKEN`). `PUT /api/users/me/password`. `GET /api/users/me/sessions`, `DELETE /api/users/me/sessions/:sessionId`, `DELETE /api/users/me/sessions` (all others). `GET /api/users/me/photos/archive` (zip). `GET /api/users/me/invites`, `DELETE /api/users/me/invites/:inviteId`.
  - **Safety:** `GET /api/users/me/blocks`, `PUT` and `DELETE /api/users/me/blocks/:userId`. A block hides photos, comments and reactions both ways, everywhere, and stops notifications between the two people. `POST /api/reports` (stored; rate limited).
  - **Wrapped:** `byUser` on the photos and busiest-month slides, and `color` on every person. People who turn off "Show my name in Wrapped" count in the totals but are left off person slides. Saved Wrapped are format version 4 (3 when this was added; see Wrapped).
  - **Push:** `GET /api/notifications/push-key` (`{ publicKey, apns }`: the VAPID key for browsers, and whether the server can notify iPhones), `POST` and `DELETE /api/notifications/subscriptions` (browsers), and `POST` and `DELETE /api/notifications/devices` (the iPhone app: `{ token, environment: "sandbox" | "production" }`, and `{ token }`).
- **Push notifications** (Web Push with `web-push`, and Apple push for the iPhone app). New photos, reactions to your photos, comments, new members, moments, gentle reminders, On this day (09:00 your time) and Wrapped (1 January, 10:00).
  - **Never sent:** to the person who did it, between blocked people, or from a group you've muted.
  - **Quiet hours:** notifications are queued and sent when quiet hours end (only the latest per kind).
  - **Scheduler:** runs every minute in the server process, only when at least one kind of push is configured.
  - **Browsers** need `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`; without them web push is simply off. On iPhone, web push only works once the web app is added to the Home Screen.
  - **The iPhone app** is reached through Apple's push service (`lib/apns.ts`: HTTP/2 and an ES256 provider token, from Node's built-ins). It needs `APNS_KEY` or `APNS_KEY_PATH`, `APNS_KEY_ID` and `APNS_TEAM_ID` (and `APNS_TOPIC` if the bundle ID differs); setting only some of them stops the server starting. A person gets a notification on every browser and every iPhone they're signed in on, under the same settings, quiet hours and mutes.
  - **A phone belongs to a session** (`apns_devices.session_id`, deleted with the session). Signing out, being signed out elsewhere, changing the password and deleting the account all stop its notifications, and a phone whose session has run out is skipped even before the row is swept up. Signing in as someone else on the same phone moves its token (it is unique) to them.
  - **Apple's answers.** A token Apple says is dead (`410`, `BadDeviceToken`, `DeviceTokenNotForTopic`) is deleted; anything else is logged and tried again with the next notification. A connection Apple has closed is replaced and the request retried once; the notification's tag is its collapse ID, so a duplicate replaces the first on the phone.
  - **Sandbox or production** is stored per phone (Xcode builds use the sandbox, TestFlight and the App Store production), so one server serves both.

## Local machine notes

- MySQL runs as the Windows service `MySQL84`, bound to `127.0.0.1` only.
- Local secrets (the MySQL root password, dev test-account logins) live in `.local/`, which is gitignored.
- Prisma 7.10.0 pins vulnerable versions of `mariadb`, `mysql2` and `deepmerge-ts`, so `overrides` in the root `package.json` lift them to patched releases. The overrides are keyed to the exact Prisma 7.10.0 packages, so they stop applying once Prisma is upgraded. When bumping Prisma, update the `allowScripts` versions below, re-run `npm audit`, and drop the overrides (or re-key them if the new release still pins vulnerable versions).
- npm 11 only runs install scripts for packages listed under `allowScripts` in `package.json` (Prisma's engines, esbuild).
- The API dev watcher is `node --watch-path=./src --import tsx` rather than `tsx watch`, because `tsx watch` hangs on Windows when run under `concurrently`.
  - It watches only `src/`: plain `--watch` on Windows treated a dependency file loaded for the first time as a change, and restarted the API mid-request.
  - After `npm install`, restart `npm run dev` yourself.
- MinIO was built from source with Go 1.27 (`go install github.com/minio/minio@latest`), because the winget package's download is gone (HTTP 410). The binary is `%USERPROFILE%\go\bin\minio.exe`.
