/*
 * Starts the RoomMuse app.
 *
 * The app is a Design Component: its markup (app/view.html) and logic
 * (app/planner.js) are read by vendor/dc-runtime.js from an <x-dc> element and
 * a <script type="text/x-dc"> in the page, both inline. They are kept as files
 * so they can be edited, and placed into the page here before the runtime
 * loads. The catalogue scripts, the scan SDK and the account/project connector
 * (roommuse/) run first, in order, because the planner reads their globals
 * while it starts.
 */
(function () {
  'use strict';

  // The runtime loads React from these addresses; serve our own copies instead.
  window.__resources = {
    'https://unpkg.com/react@18.3.1/umd/react.production.min.js': '/vendor/react.production.min.js',
    'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js': '/vendor/react-dom.production.min.js',
  };

  const SCRIPTS = [
    '/app/reference.js',
    '/assets/213ea483-4709-4d64-8179-5cb3519ad259.js', // CATALOGUE_SG
    '/assets/7c8a1d2e-4b60-4f31-9a5d-0e71c3ab2f48.js', // WG_CHAIR
    '/assets/524e990d-268f-4ebc-b34d-cbca8efd2abb.js', // SG_RENDER
    '/meshy/meshy-catalog-v1.js',
    '/meshy/qrcode-1.4.4.js',
    '/packages/scan-sdk/dist/mozu-scan-sdk.global.js',
    '/roommuse/scan-room.js',
    '/roommuse/backend.js',
  ];
  const PROPS = '{"$preview":{"width":1600,"height":1000}}';

  const splash = document.getElementById('rm-splash');
  const status = (text, failed) => {
    const p = splash && splash.querySelector('p');
    if (!p) return;
    p.textContent = text;
    p.className = failed ? 'rm-splash-error' : '';
  };

  const loadScript = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
  const text = (url) => fetch(url).then((r) => {
    if (!r.ok) throw new Error('Could not load ' + url + ' (' + r.status + ')');
    return r.text();
  });

  // The overlay is the last thing the app mounts; one more tick lets its first paint land.
  function hideSplashWhenReady() {
    const t0 = Date.now();
    let seen = 0;
    const timer = setInterval(() => {
      const up = !!document.getElementById('rm-overlay');
      if ((up && ++seen > 1) || Date.now() - t0 > 20000) {
        clearInterval(timer);
        splash.style.opacity = '0';
        setTimeout(() => splash.remove(), 220);
      }
    }, 60);
  }

  async function start() {
    const files = Promise.all([text('/app/view.html'), text('/app/planner.js')]);
    for (const src of SCRIPTS) await loadScript(src);
    const [view, logic] = await files;

    const dc = document.createElement('x-dc');
    dc.innerHTML = view;
    document.body.appendChild(dc);
    const script = document.createElement('script');
    script.type = 'text/x-dc';
    script.setAttribute('data-dc-script', '');
    script.setAttribute('data-props', PROPS);
    script.textContent = logic;
    document.body.appendChild(script);

    status('Preparing your workspace…');
    await loadScript('/vendor/dc-runtime.js');
    hideSplashWhenReady();
  }

  start().catch((err) => {
    console.error('[roommuse] failed to start:', err);
    status(err.message + '. Reload the page to try again.', true);
  });
})();
