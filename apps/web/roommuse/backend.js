/*
 * The RoomMuse editor's connection to the server: accounts, projects and the
 * phone's scan codes. Defines window.RoomMuseBackend; app/planner.js calls it.
 *
 * Sign-in is Firebase Auth (email + password, or Google), exchanged once for
 * our own session cookie (POST /api/auth/session). Firebase's compat SDK is
 * loaded from Google's CDN only when a sign-in action needs it. Everything
 * else is /api/projects, documented in server/project-api.js.
 */
(function () {
  'use strict';

  /**
   * Firebase's public web config: it identifies the project to the sign-in
   * service and is meant to ship in the page (access is governed by Firebase's
   * own rules and the session cookie our API issues, not by keeping this secret).
   */
  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyBJj37svX5Dt7f_NnO-5YOlTKj4FngtSOA',
    authDomain: 'roommuse-c02cb.firebaseapp.com',
    projectId: 'roommuse-c02cb',
  };
  const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';

  const OFFLINE = 'Could not reach RoomMuse. Check your connection and try again.';

  class ApiError extends Error {
    constructor(message, status, body) {
      super(message);
      this.status = status;
      this.body = body || {};
    }
  }

  /** JSON request to our API; throws ApiError with the server's sentence. */
  async function api(method, path, body, { keepalive = false } = {}) {
    const init = { method, credentials: 'same-origin', headers: {}, keepalive };
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(path, init);
    } catch (e) {
      throw new ApiError(OFFLINE, 0);
    }
    let json = null;
    try { json = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) throw new ApiError((json && json.error) || 'Something went wrong (' + res.status + '). Please try again.', res.status, json);
    return json || {};
  }

  // ── Firebase ───────────────────────────────────────────────────────────

  let loading = null;
  const loadScript = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the sign-in library. Check your connection.'));
    document.head.appendChild(s);
  });
  function firebaseAuth() {
    loading = loading || (async () => {
      if (!window.firebase) {
        await loadScript(SDK + 'firebase-app-compat.js');
        await loadScript(SDK + 'firebase-auth-compat.js');
      }
      if (!window.firebase.apps.length) window.firebase.initializeApp(FIREBASE_CONFIG);
      return window.firebase.auth();
    })().catch((e) => {
      loading = null;
      throw e;
    });
    return loading;
  }

  const MESSAGES = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'Wrong email or password.',
    'auth/invalid-email': 'That email address doesn’t look right.',
    'auth/missing-password': 'Please enter your password.',
    'auth/weak-password': 'Choose a password with at least 8 characters.',
    'auth/email-already-in-use': 'There is already an account with that email. Sign in instead, or reset the password.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/network-request-failed': 'Could not reach the sign-in service. Check your connection.',
    'auth/popup-closed-by-user': 'The Google sign-in window was closed before finishing.',
    'auth/cancelled-popup-request': 'The Google sign-in window was closed before finishing.',
    'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.',
    'auth/unauthorized-domain': 'This site isn’t authorised for sign-in yet (add it under Firebase → Authentication → Settings → Authorized domains).',
    'auth/operation-not-allowed': 'This sign-in method isn’t enabled in Firebase yet.',
  };

  /** A sentence for a Firebase, API or any other error. */
  function friendly(e) {
    if (e && e.code && MESSAGES[e.code]) return MESSAGES[e.code];
    return (e && e.message) || 'Something went wrong. Please try again.';
  }

  /** Exchange a fresh Firebase sign-in for our session cookie. */
  async function establishSession(user) {
    const idToken = await user.getIdToken(true);
    return (await api('POST', '/api/auth/session', { idToken })).user;
  }

  const auth = {
    /** The signed-in person, or null. */
    async me() {
      try {
        return (await api('GET', '/api/auth/me')).user;
      } catch (e) {
        if (e.status === 401) return null;
        throw e;
      }
    },
    async signIn(email, password) {
      const fa = await firebaseAuth();
      return establishSession((await fa.signInWithEmailAndPassword(email, password)).user);
    },
    async createAccount(email, password) {
      const fa = await firebaseAuth();
      const cred = await fa.createUserWithEmailAndPassword(email, password);
      cred.user.sendEmailVerification().catch(() => { /* the project list offers a resend */ });
      return establishSession(cred.user);
    },
    async google() {
      const fa = await firebaseAuth();
      const provider = new window.firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      return establishSession((await fa.signInWithPopup(provider)).user);
    },
    async resetPassword(email) {
      await (await firebaseAuth()).sendPasswordResetEmail(email);
    },
    /** Needs the Firebase session, which lives only in the tab that signed in. */
    async resendVerification() {
      const user = (await firebaseAuth()).currentUser;
      if (!user) throw new Error('Please sign out and sign in again, then resend the verification email.');
      await user.sendEmailVerification();
    },
    async signOut() {
      await api('DELETE', '/api/auth/session').catch(() => { /* the cookie may already be gone */ });
      if (window.firebase && window.firebase.apps.length) await window.firebase.auth().signOut().catch(() => {});
    },
  };

  // ── projects ───────────────────────────────────────────────────────────

  const pid = (id) => '/api/projects/' + encodeURIComponent(id);
  const projects = {
    list: () => api('GET', '/api/projects').then((r) => r.projects || []),
    /** { project: meta, scan (or null), design: { version, project } or null } */
    get: (id) => api('GET', pid(id)),
    /** { code } | { scan, source: 'sample' | 'file' } | { method: 'manual' | 'floorplan' }, plus { name }. */
    create: (body) => api('POST', '/api/projects', body).then((r) => r.project),
    /** Resolves { rev, updatedAt }; a 409 (saved elsewhere) rejects with status 409. */
    save: (id, rev, project, summary, opts) => api('PUT', pid(id), { rev, design: { project }, summary }, opts),
    rename: (id, name) => api('PATCH', pid(id), { name }).then((r) => r.project),
    remove: (id) => api('DELETE', pid(id)),
  };

  // ── scans ──────────────────────────────────────────────────────────────

  const SAMPLES = [
    { id: 'kitchen', name: 'Kitchen', note: 'One rectangular room, 4.0 × 3.0 m' },
    { id: 'twobedroom', name: 'Two-bedroom flat', note: 'A hallway and two bedrooms' },
  ];
  async function sample(id) {
    const res = await fetch('/samples/' + encodeURIComponent(id) + '.roomscan.json').catch(() => null);
    if (!res || !res.ok) throw new Error('Could not load the sample room.');
    return res.json();
  }

  const isCode = (s) => /^[A-Za-z0-9]{6}$/.test(String(s || '').replace(/[\s-]/g, ''));

  /**
   * What this page's address asks for: a project, a code from the phone, or a
   * scan carried in the link itself (the phone's "open on this device").
   */
  function linkRequest(search) {
    const p = new URLSearchParams(search === undefined ? location.search : search);
    const project = p.get('project');
    if (project) return { kind: 'project', id: project };
    const code = p.get('code');
    if (code) return { kind: 'code', code: code.trim().toUpperCase() };
    if (p.get('scan') || p.get('poly')) {
      const scan = window.MozuScan && window.MozuScan.scanFromParams(p);
      return scan ? { kind: 'scan', scan } : { kind: 'broken' };
    }
    return null;
  }

  /** Keep the address in step with what is open, without adding history entries. */
  function setAddress(projectId) {
    const url = projectId ? '/?project=' + encodeURIComponent(projectId) : '/';
    if (location.pathname + location.search !== url) history.replaceState(null, '', url);
  }

  window.RoomMuseBackend = { auth, projects, friendly, ApiError, SAMPLES, sample, isCode, linkRequest, setAddress };
})();
