# Friendship Wrapped

[![iOS build](https://github.com/Nouzy5/Friendship-Wrapped/actions/workflows/ios.yml/badge.svg)](https://github.com/Nouzy5/Friendship-Wrapped/actions/workflows/ios.yml)
![Node](https://img.shields.io/badge/node-%E2%89%A522.12-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Swift](https://img.shields.io/badge/SwiftUI-iOS%2017%2B-F05138?logo=swift&logoColor=white)

A private social memory app for friend groups. Capture photos together through the year, react and comment, browse shared memories, then relive it all as a Spotify Wrapped–style recap.

## Features

- **Groups and invites.** Create a group, share an invite link or QR code (valid for a day, a week or a month), and every member gets their own colour. An expired link says who sent it.
- **Photos and videos.** In-app camera or gallery upload, with captions, thumbnails and object storage. Short videos (up to a minute) and Live Photos work too, and behave like any other post.
- **Feed.** A group feed and grid with infinite scroll, a swipeable full-screen viewer and lazy-loaded images.
- **Reactions, comments and favourites.** Five reactions, comments, and private favourites.
- **Memories and Moments.** On This Day, a timeline by month, shared albums and favourites, and Moments: a few hours in which the group posts into one shared place.
- **Group pulse.** A "this month" card and a weekly group streak for the whole group, plus at most one gentle reminder per person per fortnight. Nothing ever names who hasn't posted.
- **Wrapped.** The group's year as a full-screen story, saved once the year is over, with a personal slide and share cards drawn on your own device.
- **Push notifications, themes and privacy controls.** Web push and Apple push on iPhone, light/dark mode, blocking and reporting, account deletion, installable to the home screen.
- **Native iOS app.** A SwiftUI client in [`ios/`](ios/README.md) that uses the same API.

## Tech stack

| Layer | Technology |
| --- | --- |
| Web client | React 19, Vite, Tailwind 4, React Router, TanStack Query |
| iOS client | SwiftUI (iOS 17+) |
| API | Node.js, Express 5, Zod, sharp, ffmpeg, multer |
| Database | MySQL 8.4 with Prisma 7 |
| Storage | S3-compatible object storage (MinIO locally) |
| Tests | Vitest and Supertest |

## Getting started

### Prerequisites

- Node.js 22.12 or newer
- MySQL 8.4
- [MinIO](https://github.com/minio/minio) for local object storage. It's started for you by `npm run dev` and `npm test`. MinIO only publishes source, so build it with Go 1.24+:

  ```bash
  go install github.com/minio/minio@latest
  ```

  Set `MINIO_BIN` if the binary isn't on your `PATH`.
- [ffmpeg](https://ffmpeg.org/download.html) (with ffprobe), optional, to post videos. Without it everything else works and videos are turned away with a clear message. Set `FFMPEG_PATH` and `FFPROBE_PATH` if they aren't on your `PATH`.

### Setup

1. Create the dev and test databases and an app user. Run as MySQL root:

   ```sql
   CREATE DATABASE friendship_wrapped CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
   CREATE DATABASE friendship_wrapped_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
   CREATE USER 'fw_app'@'localhost' IDENTIFIED BY '<password>';
   GRANT ALL PRIVILEGES ON `friendship\_wrapped%`.* TO 'fw_app'@'localhost';
   GRANT ALL PRIVILEGES ON `prisma\_migrate\_shadow\_db%`.* TO 'fw_app'@'localhost';
   ```

2. Create the environment files and fill them in (`DATABASE_URL`, `S3_SECRET_ACCESS_KEY`, …). Point `.env.test` at the test database and the `friendship-wrapped-test` bucket.

   ```bash
   cp server/.env.example server/.env
   cp server/.env.example server/.env.test
   ```

3. Install and run:

   ```bash
   npm install
   npm run dev
   ```

| Service | URL |
| --- | --- |
| Web app | http://localhost:5173 |
| API | http://127.0.0.1:4000 (the client reaches it via `/api`) |
| MinIO console | http://127.0.0.1:9001 |

Create an account at `/auth/register`. Push notifications are optional: see `VAPID_*` in `server/.env.example`.

> The live camera needs a secure context. `localhost` works, but opening the dev server from a phone over your LAN IP doesn't; the Camera page falls back to the phone's own camera app and gallery.

## Scripts

Run from the repo root.

| Command | Description |
| --- | --- |
| `npm run dev` | Start MinIO, the API and the Vite dev server together |
| `npm test` | Run the server integration tests (real test database and bucket) |
| `npm run typecheck` | Type-check server and client |
| `npm run build` | Build the server and the client |
| `npm run db:migrate` | Create/apply a Prisma migration in development |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:studio` | Open Prisma Studio |

## Project structure

```text
client/    React web app (Vite, Tailwind)
server/    Express API, Prisma schema and migrations, tests
ios/       Native SwiftUI app
docs/      Technical reference
```

## Documentation

- [Technical reference](docs/REFERENCE.md): conventions, authentication, groups, photos, feed, memories, analytics, Wrapped, settings and API details
- [iOS app](ios/README.md): requirements, building and TestFlight setup
