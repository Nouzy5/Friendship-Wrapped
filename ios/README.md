# Friendship Wrapped for iOS

A native SwiftUI app that does everything the web client does: phases 1–10 and the **Colour-coded redesign**. It talks to the **same Express API** as the web client.

## Colour-coded

The same design as the web app ([technical reference](../docs/REFERENCE.md#redesign-colour-coded)): black and white paper and ink, and one colour per friend. Colour only ever means a person; your own colour in the group you're looking at is your accent (the shutter, switches, your reaction). Type is Apple's rounded system font, which the web design names as Fredoka's fallback (Fredoka itself only ships here as web fonts).

| Web | iOS |
| --- | --- |
| `/auth/login`, `/auth/register` | Welcome screen (the colour-stripe mark) → Log in / Create account |
| `/onboarding` | "Welcome!" screen after sign-up: create your first group or join with a link |
| `/home`, `/groups/:id` | **Home** tab is the current group's feed. The group's name opens a list of your groups (+ New group); the header also has the grid/feed switch, group settings and your avatar (→ Settings). Alone in a group, the invite card comes first |
| Feed post | The photo with a name tag in the poster's colour, a "…" menu (add to an album, save photo when allowed, report, block, delete your own), reactions as pills with the people who reacted as dots in their colours (yours outlined in your colour), comments, favourite star, caption |
| `/photos/:id` | Photo viewer: swipe through the feed, pinch or double-tap to zoom, reactions, comments in each person's colour, the same menu |
| Shutter, `/camera` | Full-screen camera: square viewfinder, flash, switch camera, grid lines, the group you're posting to and who'll see it; then a caption and "Post to …" with progress. Library photos work too |
| `/memories` | **Memories** tab: On this day, then Timeline (months, jump to a month, "Taken by" one person), Albums and Favorites |
| `/groups/:id/settings` | Group settings: your colour (12; taken ones show who has them), group photo, members (report, block, remove), name and emoji, mute, invite links, leave |
| `/settings/*` | Settings: Account (photo, name, username, password, signed-in devices, download your photos as a zip, delete account), Notifications (saved with your account; the iPhone app itself can't receive push yet), Appearance (Match device / Light / Dark, app icon, reduce motion, haptics), Privacy & safety (photo saving, your name in Wrapped, blocked people, your invite links), Photos & data (camera, quality, mobile data, data saver), Terms |
| `/wrapped`, `/wrapped/:year` | **Wrapped** tab and the full-screen story, with everyone's share of the year in their colours |

- **App icon.** Settings → Appearance → App icon switches the Home Screen icon between Classic, Night and "Your colour" (one alternate icon per member colour; `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES` in `project.yml`). iOS confirms each change with an alert of its own, so the icon only changes when you choose it.
- **Motion.** Screens push and pop natively, tabs rise into place, menus and sheets grow from where they open, reactions pop and bounce, lists ease in, switches spring and the theme crossfades. Settings → Appearance → Reduce motion (or the iPhone's own setting) turns all of it off.
- **Haptics.** A light tap when you react, flip a switch or take a photo (Settings → Appearance → Haptics).

## Requirements

- Xcode 26 (iOS 26 SDK). The app runs on iOS 17 and later, iPhone only.
- [XcodeGen](https://github.com/yonaskolb/XcodeGen). `project.yml` is the project definition. The generated `.xcodeproj` is gitignored.

You don't need a Mac for builds or TestFlight. The [iOS workflow](../.github/workflows/ios.yml) builds on GitHub's macOS runners. You need a Mac only to run the app in the Simulator.

## Run in the Simulator (Mac)

```bash
npm run dev                          # repo root: API on 127.0.0.1:4000
cd ios && brew install xcodegen && xcodegen generate
open FriendshipWrapped.xcodeproj     # then Run (⌘R) on an iPhone simulator
```

Debug builds point at `http://localhost:4000/api`, which the Simulator reaches on the Mac.

**On a physical iPhone in Debug**, `localhost` is the phone itself. To use your dev server from the phone:

1. Start the API with `API_HOST=0.0.0.0`.
2. Set `FW_API_BASE_URL` (Debug) in `project.yml` to your computer's LAN address, e.g. `http://192.168.1.20:4000/api`.
3. Regenerate the project.

## Test from Windows (no Mac, no paid Apple account)

1. **Make your dev API reachable over HTTPS.** Run `npm run dev`, then start a tunnel, e.g. [Cloudflare's quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/): `cloudflared tunnel --url http://localhost:4000`. Note the `https://….trycloudflare.com` address it prints. Quick-tunnel addresses change every time you restart it, and the address is built into the app.
2. **Build.** On GitHub: **Actions → iOS → Run workflow**. Tick **Test builds**, and set **api_url** to `https://….trycloudflare.com/api`. When it finishes, download the two artifacts from the run page.
3. **Try it in the browser.** Upload `FriendshipWrapped-simulator.zip` (inside the `…-appetize` artifact) to [appetize.io/upload](https://appetize.io/upload). It runs in a streamed iOS Simulator: no camera, but the photo library works.
4. **Or install it on your iPhone.** Install [Sideloadly](https://sideloadly.io) (it needs the web versions of iTunes and iCloud on Windows). Connect the phone by USB and drag in `FriendshipWrapped-unsigned.ipa` (inside the `…-sideloadly` artifact). Sign in with your Apple ID. Then:
   - On the phone, turn on **Settings → Privacy & Security → Developer Mode**.
   - Trust the profile under **Settings → General → VPN & Device Management**.
   - With a free Apple ID the app stops working after 7 days. Re-sideload it, or let Sideloadly refresh it.

## TestFlight

TestFlight builds use the Release configuration, which only talks to an **HTTPS** API. Setup, done once:

1. **Deploy the backend** (API + MySQL + an S3-compatible bucket) somewhere with HTTPS, and the web client too, because invite links point at it. Until the API is deployed, a TestFlight build has nothing to connect to.
2. **Join the Apple Developer Program** ($99/year).
3. **In App Store Connect**:
   - Create the app (My Apps → +) with bundle ID `com.nouzy5.friendshipwrapped`. To use a different ID, also set the `IOS_BUNDLE_ID` variable below.
   - Create an API key with the **Admin** role (Users and Access → Integrations → App Store Connect API). Admin lets CI create signing certificates and profiles automatically.
4. **In the GitHub repo** (Settings → Secrets and variables → Actions):

   | Kind | Name | Value |
   | --- | --- | --- |
   | Secret | `APPLE_TEAM_ID` | Your 10-character Team ID (developer.apple.com → Membership) |
   | Secret | `ASC_KEY_ID` | The API key's Key ID |
   | Secret | `ASC_ISSUER_ID` | The Issuer ID shown above the keys list |
   | Secret | `ASC_PRIVATE_KEY` | Contents of the downloaded `AuthKey_XXXX.p8` |
   | Variable | `FW_API_BASE_URL` | e.g. `https://api.example.com/api` |
   | Variable | `FW_WEB_BASE_URL` | e.g. `https://example.com` |
   | Variable | `IOS_BUNDLE_ID` | Optional, if not `com.nouzy5.friendshipwrapped` |

Then, for each build: **Actions → iOS → Run workflow**, tick **Upload to TestFlight**. The build number is the workflow run number. Processing in App Store Connect takes a few minutes, then the build appears in TestFlight:

- **Internal testers** (your team, up to 100) can install it right away.
- **External testers** need a short Beta App Review first.

> macOS runner minutes count 10× against the free allowance for private repos (2,000 min/month). A build takes roughly 5–10 minutes.

## How it fits together

```text
FriendshipWrapped/
  App/            Entry point, RootView (signed in vs out), AppRouter (tabs, stacks, deep links)
  Core/           AppConfig (server URLs), Format, Networking/
    Networking/   APIClient (URLSession + error envelope), APIError, SessionTokenStore (Keychain)
  Models/         Codable mirrors of the API's DTOs (User, FriendGroup, GroupMember, invites, health)
  Features/<name> <Name>API.swift (endpoints), stores, and screens for auth, groups, invites, profile, settings
  UI/Design/      Theme (colour tokens, member colours, type), Motion (animations that honour reduce motion)
  UI/Components/  Shared views: avatars, group badge, name tags, buttons, settings rows, fields, toasts, group picker
```

- **Same layering idea as the web client.** Endpoint calls live in `Features/*/…API.swift` (like `features/*/api.ts`). Shared cached state lives in `SessionStore` and `GroupsStore` (like the TanStack Query cache). Screens stay thin.
- **Sessions.** The API sets the same `fw_session` / `__Host-fw_session` cookie as on the web. The app doesn't use a cookie jar. It keeps the token in the **Keychain** (this device only) and sends it back as a `Cookie` header. Sliding renewals and logout come back through `Set-Cookie` as usual. Native requests carry no `Origin` header, so the API's same-origin check lets them through.
- **401 = signed out.** As on the web, any `401 UNAUTHORIZED` signs the app out and clears the cached groups.
- **Validation** stays on the server. Field messages from `details` are shown under each field.
- **Photos.** The server rejects HEIC, the iPhone camera's default format. So the app re-encodes every photo as a JPEG before uploading, scaled to at most 2560 px (the server's largest rendition) or 1024 px for profile pictures. The server then re-encodes to WebP and strips metadata such as GPS location, as it does for the web.
- **Images load through `APIClient`**, not `AsyncImage`, because photo and avatar URLs are access-checked and need the session cookie. Decoded images are kept in memory (`ImageCache`) and dropped on sign-out. The app only sends the cookie to paths on the API's own host.
- **Camera.** A full-screen AVFoundation camera (`Features/Photos/Camera/`), square like the web one. The Simulator has no camera, so it offers the photo library only. The library uses `PhotosPicker`, which needs no photo-library permission; saving photos asks for add-only access.
- **Invite links** are still the web URLs (`https://<web>/invite/<token>`), so they work for everyone. The app also opens `friendshipwrapped://invite/<token>`, and **Join with an invite link** (Home without groups, or onboarding) accepts a pasted link.
- **Universal links** (web invite links opening the app directly) need an `apple-app-site-association` file on the deployed web domain plus the Associated Domains capability. That's for once the web client is deployed.

## Keeping it in step with the web app

Each new phase (photos, feed, …) needs its screens built here too. The API is shared, so the server work is done only once.
