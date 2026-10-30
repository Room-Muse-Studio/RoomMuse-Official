# apps/web — the RoomMuse app

The whole website: sign-in, the project list, new projects, and the five-step editor. Static files, no build
step: `npm run build` (root) copies this folder into `public/`, which Vercel and `npm start` serve.

It is a **one-time fork** of RoomMuseStudio's `RoomMuse_WiseGlobe_Configurator` (commit `0c2aa05`, Oct 29 2026).
That prototype is a single bundled HTML page; here it is split into files you can edit. Changes made to the
prototype after the fork are not brought over automatically — merge them by hand.

## Files

| File | What it is |
|---|---|
| `index.html` | The page: a loading screen and `boot.js` |
| `boot.js` | Loads the scripts below in order, then puts the app's markup and logic into the page and starts the runtime |
| `app/view.html` | The app's markup and CSS (a Design Component template: `{{ value }}`, `<sc-if>`, `<sc-for>`) |
| `app/planner.js` | The app's logic: the planner component (`class Component extends DCLogic`), then the RoomMuse shell from the `RoomMuse prototype — navigation spine and shell` comment on (sign-in, projects, steps) |
| `app/reference.js` | Product reference data the planner reads (`MOZU_PRODUCT_REFERENCE`, …) |
| `roommuse/backend.js` | **Ours.** Accounts (Firebase → session cookie), projects (`/api/projects`), scan codes, samples, the page address. Firebase's public config is `FIREBASE_CONFIG` at the top |
| `roommuse/scan-room.js` | **Ours.** A scan from the phone → the editor's room (outline, doors, windows, sockets). Tested in `test/scan-room.test.js` |
| `vendor/` | The Design Component runtime (`dc-runtime.js`, generated, don't edit) and React 18 |
| `assets/` | Images, fonts and catalogue data, named by the bundle's ids. `213ea483…js` = `CATALOGUE_SG`, `7c8a1d2e…js` = `WG_CHAIR`, `524e990d…js` = `SG_RENDER` |
| `meshy/` | The Meshy AI furniture: one `.glb` and preview `.webp` per model, `meshy-catalog-v1.js`, the GLTF and meshopt loaders, QR code |
| `ar.html` | View in AR for one Meshy model (`/ar?m=meshy-03`), opened from a product card's QR code |
| `logo.svg` | The RoomMuse mark |

`view.html` and `planner.js` reference assets by absolute path (`/assets/…`), so the app must be served from the
site root.

## How the shell talks to the server

Everything below is in `app/planner.js`, in the shell section.

- **Start:** `start()` asks `/api/auth/me`. Signed out → the sign-in screen (email + password, create account,
  forgot password, Google). Signed in → `afterSignIn()` lists projects. The address may ask for more:
  `?project=ID` opens it, `?code=` (from `/scan/CODE`) or a `?poly=`/`?scan=` link starts a Room Scanning project
  with that scan.
- **Records:** `RM.projects` holds the editor's project records. Listed projects are stubs built from the
  server's meta and `summary` (`_stub`); opening one fetches the whole record (`design.project`) or, for a project
  never saved, builds one from its scan (`recordFrom`). Fields beginning with `_` are never saved.
- **Saving:** every change already called `save()`; it now schedules a `PUT` of the open project 0.8 s later with
  the revision it was loaded at (`flushSaves`). A 409 stops saving and shows a banner asking for a reload; other
  failures retry every 5 s. Leaving the page sends any pending save.
- **New projects:** Manual Input is created on the server straight away (`{ method: 'manual' }`); Floor Plan
  after a room is picked (`{ method: 'floorplan' }`); Room Scanning after the code is entered (`{ code }`), or a
  sample or file is chosen (`{ scan }`). A home scan with several rooms asks which one (`scanpick` screen).
- **Scanned rooms** use the room shape `'scan'`: the space keeps the scan's outline in `roomPoly` (mm, origin at
  the back-left corner), and the planner's walls are its edges (`e0`, `e1`, … in scan order). Width and depth
  stretch it. Furniture is kept inside the outline's bounding box, not the outline itself.

## What is still the prototype's

- **Upload Floor Plan** offers five made-up detected rooms; nothing is uploaded or read.
- **Save Version**, **Share**, **Export Quotation** and **Request Quotation** behave as they did in the prototype;
  the workflow panel's versions and backups still use the browser's local storage.
- Prices, catalogue and copy are WiseGlobe's.
