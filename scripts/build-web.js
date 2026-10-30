/*
 * Site build (Vercel's buildCommand, and `npm start` locally): gather what the
 * browser loads into public/, which Vercel serves as the site root and
 * server/server.js serves locally.
 *
 *   apps/web (the RoomMuse app, static files) → public/*
 *   samples/*.roomscan.json                   → public/samples/*
 *   packages/scan-sdk/dist/*                  → public/packages/scan-sdk/dist/*
 *
 * Nothing is compiled: apps/web is served as it is. The handoff, account and
 * project APIs are not in here: they're api/*.js on Vercel, server/server.js locally.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public');
const APP = path.join(ROOT, 'apps', 'web');

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(APP, OUT, { recursive: true, filter: (src) => path.basename(src) !== '.DS_Store' });
fs.mkdirSync(path.join(OUT, 'samples'), { recursive: true });
for (const name of fs.readdirSync(path.join(ROOT, 'samples'))) {
  if (name.endsWith('.roomscan.json')) fs.copyFileSync(path.join(ROOT, 'samples', name), path.join(OUT, 'samples', name));
}
fs.cpSync(path.join(ROOT, 'packages', 'scan-sdk', 'dist'), path.join(OUT, 'packages', 'scan-sdk', 'dist'), { recursive: true });

const required = [
  'index.html', 'boot.js', 'app/view.html', 'app/planner.js', 'vendor/dc-runtime.js',
  'roommuse/backend.js', 'roommuse/scan-room.js', 'samples/kitchen.roomscan.json',
  'packages/scan-sdk/dist/mozu-scan-sdk.global.js',
];
for (const name of required) {
  if (!fs.existsSync(path.join(OUT, name))) {
    console.error(`[build] missing ${name}`);
    process.exit(1);
  }
}
console.log(`[build] wrote ${path.relative(ROOT, OUT)}/`);
