# MOZU Design

Scan a room (or a whole home) with a LiDAR iPhone or iPad, then open it in the RoomMuse app on any computer
and furnish it. Sign in to keep each scan as a project in your account; every change is saved as you work.

```
phone app ──scan──▶ RoomMuse web (Vercel) ──6-character code──▶ type it on the laptop ──▶ the room appears in the editor
                                                                                    └──▶ signed in: saved as a project
```

## What's in this folder

| Folder / file | What it is |
|---|---|
| `apps/ios/` | The scanning app (Swift, RoomPlan + LiDAR, socket detection) |
| `apps/web/` | The website: the RoomMuse app (sign-in, projects, the five-step room editor), static files; see below |
| `tools/mozu/` | MOZU's CAD sources (STEP) and the scripts that made the old configurator's GLBs; reference only (their output folder, `apps/configurator`, is gone) |
| `packages/scan-sdk/` | The shared `mozu.roomscan/1` (one room) and `mozu.homescan/1` (several rooms) formats and floorplan engine |
| `server/handoff-store.js` | Codes: 6 characters, 24 hours, stored in Redis (production) or memory (laptop) |
| `server/app-store.js` | Users, sessions and projects on the same Redis / memory store |
| `server/handoff-api.js`, `auth-api.js`, `project-api.js` | The APIs, shared by the laptop server and Vercel |
| `server/firebase-token.js` | Checks Firebase sign-in tokens with `node:crypto` (no SDK) |
| `server/http.js`, `rate-limit.js` | Shared helpers: JSON responses, cookies, same-origin checks, per-network / per-account limits |
| `server/server.js` | Laptop server (`npm start`) |
| `api/` | The same APIs as Vercel functions |
| `vercel.json`, `scripts/build-web.js` | Vercel build and routing; the build copies `apps/web` into `public/` |
| `test/` | `npm test` (also runs on every push, `.github/workflows/test.yml`) |
| `samples/kitchen.roomscan.json` | A 4 m × 3 m kitchen with a door and two sockets, for testing |
| `samples/twobedroom.roomscan.json` | A two-bedroom flat (`mozu.homescan/1`): hallway, L-shaped bedroom, rectangular bedroom |

Node 20 or newer. Run `npm install` once (and after pulling changes).

## The app (apps/web)

The website. Sign in (email + password, or Google), see your **Design projects**, start a new one, and work
through the editor's five steps: **Room Setup** (shape, size, doors, windows, sockets), **Style Direction**,
**Furniture & Placement**, **Configuration Summary** (the estimate) and **Submission**. Everything is saved to
the project on the server as you work.

A new project captures its room one of three ways:

- **Room Scanning** — scan with the iPhone/iPad app, then enter the 6-character code it shows (or open its
  `/scan/B7K4M2` link). The scan keeps its exact outline, whatever its shape: the walls are the scan's walls,
  with its doors, windows and sockets on them (`apps/web/roommuse/scan-room.js`). A home scan with several rooms
  asks which room this project furnishes. A sample room or a scan file (`.json`) works the same way, for anyone
  without a LiDAR device.
- **Manual Input** — type the size, pick a shape (rectangular, L, cut corner, T), add doors and windows.
- **Upload Floor Plan** — still the prototype's stand-in: it offers five detected rooms from a made-up plan.

The app is a one-time fork of RoomMuseStudio's WiseGlobe configurator prototype (a Design Component: React
via a small runtime, three.js, no build step). Its files and how to change them are described in
[`apps/web/README.md`](apps/web/README.md).

**While working on it:** `npm start` serves it on http://localhost:3000 (after copying it into `public/`);
re-run `npm run build` after editing `apps/web` and reload.

---

## Production (Vercel)

### One-time setup

1. **Create the Vercel project.** Either import the GitHub repo in the Vercel dashboard (every push to `main`
   deploys), or from this folder:
   ```bash
   npm i -g vercel
   vercel login
   vercel link
   ```
   Framework preset: **Other**. The build settings come from `vercel.json`; leave them alone.
2. **Add the code store.** Vercel dashboard → the project → **Storage** → **Create** → **Upstash for Redis**
   (the free plan is enough) → connect it to the project for Production, Preview and Development. This sets
   `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Without them the API answers 503 instead of quietly
   losing codes.
3. **Set up sign-in** (Firebase, free): see *Accounts & projects* below. The scan handoff works without it;
   until `FIREBASE_PROJECT_ID` is set, sign-in answers 503 and projects can't be created.
4. **Deploy:** push to `main`, or run `vercel --prod`.
5. **Check it** (replace the address with yours):
   ```bash
   BASE=https://your-project.vercel.app
   curl -s $BASE/api/health; echo
   curl -s -X POST $BASE/api/scan-handoff -H 'content-type: application/json' \
     --data-binary @samples/kitchen.roomscan.json; echo
   ```
   Expect `{"ok":true,"store":"redis"}` and then `{"code":"B7K4M2","url":"https://…/scan/B7K4M2",…}`.
6. **Build the address into the app:** set `ScanHandoff.defaultWebBase` in
   `apps/ios/MozuScanner/Export/Handoff.swift` to the production address, then reinstall the app.

### Settings (Vercel → Settings → Environment Variables)

| Variable | Default | Meaning |
|---|---|---|
| `FIREBASE_PROJECT_ID` | – | **Needed for sign-in.** The Firebase project id (see *Accounts & projects*). Without it sign-in answers 503. |
| `RATE_LIMIT_UPLOADS` | `20` | Scans one network may upload per 10 minutes (`0` = no limit) |
| `RATE_LIMIT_LOOKUPS` | `60` | Code lookups one network may make per 10 minutes (fetching a code, or making a project from one), so codes can't be guessed |
| `RATE_LIMIT_SESSIONS` | `30` | Sign-ins one network may attempt per 10 minutes |
| `RATE_LIMIT_READS` / `RATE_LIMIT_WRITES` | `600` / `300` | Project reads / saves one account may make per 10 minutes |
| `SESSION_TTL_DAYS` | `30` | How long a sign-in lasts (renewed on use) |
| `MAX_PROJECT_BYTES` | `2097152` | Largest scan or design a project may hold (2 MB; a furnished home is well under 100 KB) |
| `MAX_PROJECTS_PER_USER` | `100` | Projects per account |

---

## Accounts & projects

Sign-in uses **Firebase Authentication** (free): email + password, or Google. Firebase only proves who the
person is; MOZU's own server then issues a 30-day session cookie and keeps the projects in Redis, next to
the scan codes. Passwords never reach our server, and password-reset / verification emails come from Firebase.

### One-time setup (about 15 minutes)

1. Go to **console.firebase.google.com** → **Create a project** (any name, e.g. `roommuse`; Analytics can be
   off). The free **Spark** plan is enough.
2. **Build → Authentication → Get started**. On **Sign-in method** enable **Email/Password**, then **Google**
   (pick a support email).
3. **Authentication → Settings → Authorized domains → Add domain**: your Vercel address
   (e.g. `roommuse-design.vercel.app`). `localhost` is already listed.
4. **Project settings** (gear) → **Your apps** → **</> Web** → register an app (no hosting). Copy `apiKey`,
   `authDomain` and `projectId` from the config it shows into `FIREBASE_CONFIG` at the top of
   `apps/web/roommuse/backend.js`. These are public values; the Authorized domains list is what protects them.
   Optionally restrict the API key by HTTP referrer in Google Cloud Console.
5. In Vercel → **Settings → Environment Variables** add `FIREBASE_PROJECT_ID` = the same `projectId`, for
   Production, Preview and Development. Redeploy.
6. Optional: **Authentication → Templates** to put the MOZU name on the reset and verification emails.

### How it works: codes carry scans, projects carry designs

- **A code** (`B7K4M2`) is the phone → laptop handoff and nothing more. It holds one scan (a room or a whole
  home) for 24 hours, and anyone who has it can fetch that scan. Nothing is ever saved *under* a code.
- **A project** is a room (usually a scan) plus the design made on it, owned by one account. `POST /api/projects
  { code }` copies the scan out of the code into a new project (the code is not stored and expires as usual);
  `{ scan }` does the same for a file or a sample, and `{ method: 'manual' | 'floorplan' }` makes a project with no
  scan. From then on the editor works on the project: `PUT /api/projects/:id { rev, design: { project }, summary }`
  saves the editor's project record, and `rev` is the revision the editor loaded, so two tabs or devices can't
  silently overwrite each other — the loser gets a 409 and the editor stops saving and asks for a reload.
- Projects are private: a project belongs to the account that created it, and any other account gets a 404
  on every route, so ids can't be probed. (The data model has room for sharing later: an unused `share` field.)
- **Design projects** (the app's home) lists them newest first with a name, where the room came from, and the
  `summary` the editor sends with each save (room, client, steps done), so the list never fetches designs.
  New / Open / Rename / Delete map onto the routes in the table under *How the pieces fit together* (Duplicate and
  thumbnails exist on the server; the app doesn't use them yet).
  Names are unique within an account (ignoring case and spacing): a typed name that's already in use is refused
  (409), while automatic names (from the scan, a sample, or Duplicate) get " (2)", " (3)"… — send `suggestedName`
  instead of `name` for a default the server may number.
- Sessions are an opaque id in an `HttpOnly` cookie (`mozu_session`), checked on every request and revocable
  server-side; they last 30 days and renew on use. Writes require same-origin JSON requests (no cross-site
  forms), and per-account rate limits keep a runaway page from filling the store.
- Email verification is encouraged, not required.

---

## Install the app on your phone (development install)

You need a Mac with Xcode, an **iPhone 12 Pro or later Pro model** (or an iPad Pro with LiDAR) on iOS 17 or
later, a USB cable, and an Apple ID. A free Apple ID works, but the app then stops opening after 7 days;
plug in and press ⌘R again to refresh it.

1. Install **Xcode** from the Mac App Store, open it once and accept the licence, then:
   ```bash
   sudo xcode-select -s /Applications/Xcode.app
   brew install xcodegen
   ```
2. Add your Apple ID: **Xcode → Settings → Accounts → +**.
3. Generate and open the project:
   ```bash
   cd apps/ios
   xcodegen generate
   open MozuScanner.xcodeproj
   ```
   Re-run `xcodegen generate` whenever Swift files are added or removed.
4. **Signing:** click the blue **MozuScanner** project → target **MozuScanner** → **Signing & Capabilities** →
   tick **Automatically manage signing**, pick your **Team**, and set a unique bundle identifier
   (e.g. `com.yourname.mozuscanner`).
5. **Phone:** plug it in and tap **Trust**. Turn on **Settings → Privacy & Security → Developer Mode** and restart
   when asked (the option appears after the phone has been connected to Xcode once).
6. Pick your phone as the run destination and press **⌘R**. The first time, go to **Settings → General → VPN &
   Device Management**, trust your Apple ID, and press ⌘R again.

## Scan and send a room

1. On the phone: **Start scan**, walk slowly around the room pointing at every wall, the floor edges, doors,
   windows and sockets. Tap **Finish room**, then **Use this room**.
2. On the floorplan screen, tap **Send to MOZU web**. A 6-character code appears, e.g. `B7K4M2`.
3. On any computer, open the production address and sign in. **+ New Design Project** → name it → **Room
   Scanning** → **Create project**, then type the code (upper or lower case, dashes and spaces are fine) and
   **Bring in my scan**. Or open the address the phone shows (`…/scan/B7K4M2`): the code is filled in for you.
4. The room appears at step 1, **Room Setup**, with its doors, windows and sockets, and empty: furniture and
   cupboards the scan found aren't placed. Check it, then carry on through the steps.

Codes last 24 hours. If a code has expired, tap **Send to MOZU web** again; you don't need to rescan.

**A whole home:** after each room tap **Scan next room** instead, and **Build house** after the last one. The house
screen's **Send house to MOZU web** uploads every room as one `mozu.homescan/1` under a single code, with the rooms
in their real positions. A project furnishes one room: the app asks which; start another project with the same
code for another room.

---

## Local development

```bash
npm start          # builds the site, then http://localhost:3000 with codes, sessions and projects kept in memory
npm run serve      # the same without rebuilding
npm test           # stores, handoff / auth / projects APIs, rate limits, /scan links, Vercel functions, scan → room
```

`npm start` uses Redis instead of memory if `KV_REST_API_URL` and `KV_REST_API_TOKEN` are set (for example
after `vercel env pull .env`, then `set -a; . ./.env; set +a; npm start`). Sign-in works locally once the
app's Firebase settings are filled in and `FIREBASE_PROJECT_ID` is exported (`localhost` is an authorized
domain by default); without them sign-in fails and `/api/auth/session` answers 503. Tests never
need Firebase: they sign tokens with a throw-away key (`test/helpers/fake-firebase.js`).

Pretend to be the phone:
```bash
BASE=http://localhost:3000
CODE=$(curl -s -X POST $BASE/api/scan-handoff -H 'content-type: application/json' \
  --data-binary @samples/kitchen.roomscan.json | sed 's/.*"code":"\([^"]*\)".*/\1/')
echo "Your code is: $CODE"
```
Open http://localhost:3000, sign in, start a **Room Scanning** project and enter the code (or open
`http://localhost:3000/scan/$CODE`). The room is 4.00 × 3.00 m with a 2.50 m ceiling, 1 door on wall 1 and 2 sockets
(0.3 m and 1.1 m high). Send `samples/twobedroom.roomscan.json` instead for a whole home (you pick one of its rooms).

To send from the phone to your laptop, the phone needs an HTTPS address for it. Run
`cloudflared tunnel --url http://localhost:3000` (`brew install cloudflared`), and put the address it prints into
the app's **Advanced → MOZU web address** field. **Reset** there returns to production.

---

## How the pieces fit together

- **The phone** sends the scan (`mozu.roomscan/1` JSON) to `POST /api/scan-handoff` and shows the `code` it
  gets back (`apps/ios/MozuScanner/Export/Handoff.swift`).
- **The server** checks the scan (at least 3 corners, 2 MB at most), keeps it under a random 6-character code
  for **24 hours**, and rate-limits each network. Codes use `23456789ABCDEFGHJKMNPQRSTVWXYZ` (no 0/O, 1/I/L or U).
  In production codes live in Redis, so every Vercel instance sees them and they survive redeploys. Codes are
  claimed with an atomic `SET NX`, so two uploads can never get the same code.
- **The app** creates a project from the code (`POST /api/projects { code }`), fetches the project's copy of the
  scan, and turns it into the editor's room: the exact outline, doors and windows, and sockets at their height
  (`apps/web/roommuse/scan-room.js`). The objects RoomPlan detected are not placed.
- The server parses scans with the built SDK (`packages/scan-sdk/dist`), sockets included; the app loads the same
  built file for the phone's `/scan?poly=…` links. After changing `packages/scan-sdk/src`, rebuild it: `npm run build -w packages/scan-sdk` (CI fails if
  `dist` is out of date).
- Scans may also carry optional `wallIds` (RoomPlan's wall UUIDs, one per polygon edge), `id` on openings,
  objects and fixtures, and `elevation` (bottom height above the floor) on objects. The schema is still
  `mozu.roomscan/1`; older scans without these fields load exactly as before.
- Several rooms travel together as `mozu.homescan/1` (`{ schema, rooms, capturedAt, connections? }`); read one with
  the SDK's `parseHomeScan`. `connections` records which doors and walls two rooms share (a door between two rooms
  is scanned once per room); `findConnections(rooms)` works them out from the rooms' geometry.

| Address | What it does |
|---|---|
| `/` | the RoomMuse app (sign-in, projects, editor); `/?project=ID` opens a project |
| `/?code=B7K4M2` or `/scan/B7K4M2` | after sign-in, starts a Room Scanning project with that code filled in |
| `/scan?poly=…&h=…&scan=…` | the phone app's "Open on this device" link: the scan rides in the link |
| `/ar?m=…` | View in AR for one Meshy model (`apps/web/ar.html`) |
| `POST /api/scan-handoff` | upload a scan → `{ code, url, expiresAt }` (201), or `{ error }` with 400, 413, 429 or 503 |
| `GET /api/scan-handoff?code=…` | fetch it → `{ code, scan, expiresAt }` (200), 400 bad code, 404 unknown/expired, 429 |
| `POST /api/auth/session` `{ idToken }` | exchange a Firebase sign-in for the session cookie → `{ user, session }` (201); 401 bad token, 503 unconfigured |
| `GET /api/auth/me` · `DELETE /api/auth/session` | who am I → `{ user, session }` (200 / 401) · sign out → `{ ok }` |
| `GET /api/projects` | `{ projects: [meta] }`, newest first; meta = `{ id, name, rooms, source, createdAt, updatedAt, rev, thumbnail?, summary? }` |
| `POST /api/projects` | `{ code, name? }` (copies the scan behind the code; 404 if gone) or `{ scan, name?, source?: 'file' \| 'sample' }` or `{ method: 'manual' \| 'floorplan', name? }` → `{ project }` (201); 409 at 100 projects |
| `GET /api/projects/:id` | `{ project, scan, design }` — scan is `null` for manual / floor-plan projects; design is `{ version: 4, project }` or `null` before the first save |
| `PUT /api/projects/:id` | save `{ rev, design: { project }, summary? }` → `{ rev, updatedAt }`; 409 `{ error, rev, updatedAt }` when `rev` is stale; 413 over 2 MB; summary ≤ 2 KB |
| `PATCH /api/projects/:id` · `DELETE /api/projects/:id` | rename `{ name }` → `{ project }` · delete → `{ ok }` |
| `POST /api/projects/:id/duplicate` | `{ name? }` → `{ project }` (201), scan and design copied |
| `PUT /api/projects/:id/thumbnail` | `{ dataUrl }` (`data:image/jpeg` or `image/webp`, ≤ 64 KB) → `{ ok }` |
| `GET /api/health` | `{ ok: true, store }` (200), or 503 when the store can't be reached |

Every `/api/projects` route needs the session cookie (401 without one); someone else's project is a 404.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| App says "Could not reach MOZU" | Check the phone's internet connection. If you changed **Advanced → MOZU web address**, tap **Reset**. |
| App says "Too many requests" | One network sent more than 20 scans in 10 minutes. Wait, or raise `RATE_LIMIT_UPLOADS`. |
| "MOZU could not reach its storage" (503) | Redis isn't connected to the Vercel project, or Upstash is down. Check `/api/health` and the project's Storage tab. |
| "That code was not found or has expired" | Codes last 24 hours. Tap **Send to MOZU web** again; you don't need to rescan. A project made from the code is unaffected. |
| Sign-in answers 503 "not configured" | `FIREBASE_PROJECT_ID` is missing from the environment (Vercel → Settings → Environment Variables, or your shell locally). |
| Sign-in says the site isn't authorised (`auth/unauthorized-domain`) | Add the site's domain under Firebase → Authentication → Settings → Authorized domains. |
| Saving says "changed somewhere else" (409) | The same project was saved from another tab or device. Reload it and redo the change. |
| The page says "The site has not been built yet" | You ran `npm run serve` before building. Run `npm start` (it builds first). |
| "Port 3000 is already in use" | `PORT=3100 npm start`, or stop the other server: `lsof -ti:3000 \| xargs kill` |
| Xcode: "Signing for MozuScanner requires a development team" | Install step 4: pick your Team. |
| Xcode: "Failed to register bundle identifier" | Choose a unique bundle identifier (install step 4). |
| App crashes the moment scanning starts (iOS 26) | Run the **MozuScanner** scheme generated by xcodegen; it turns off Metal API Validation, which causes this crash. |
| No internet at the site | On the floorplan screen tap **Share scan**, AirDrop the file to the Mac, save it with a `.json` ending, and open it with **Open scan file…** on the Room Scanning screen. |
