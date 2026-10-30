/*
 * A scan from the phone (mozu.roomscan/1 or mozu.homescan/1) as rooms the
 * RoomMuse editor can furnish.
 *
 * The editor works in millimetres with the origin at the room's back-left
 * corner, x across and z into the room. A scanned room keeps its exact
 * outline: the polygon is only moved so its corner sits at the origin. Walls
 * are the polygon's edges, which the editor names e0, e1, … in the same order
 * as the scan's wall indexes, so openings and sockets keep their wall and
 * their offset from that wall's start.
 *
 * Plain script: in the page it defines window.RoomMuseScanRoom; in Node it is
 * a module (the tests require it).
 */
(function (root) {
  'use strict';

  const HOMESCAN = 'mozu.homescan/1';

  /** The editor's room types (planner.js ROOMS) for what RoomPlan calls a room. */
  const TYPES = [
    [/living|lounge|family/i, 'living'],
    [/bed/i, 'bedroom'],
    [/dining/i, 'dining'],
    [/office|study/i, 'office'],
    [/balcony|outdoor|garden|terrace|patio/i, 'outdoor'],
  ];
  const TYPE_NAMES = { living: 'Living Room', bedroom: 'Bedroom', dining: 'Dining Room', office: 'Home Office', outdoor: 'Outdoor', other: 'Room' };

  const roomType = (raw) => {
    const hit = TYPES.find(([re]) => re.test(String(raw || '')));
    return hit ? hit[1] : 'other';
  };
  const mm = (n) => Math.round(Number(n) || 0);

  /** One scanned room → the editor's room, or null when it has no usable outline. */
  function roomFromScan(scan, index) {
    const pts = Array.isArray(scan && scan.polygon) ? scan.polygon : [];
    if (pts.length < 3 || !pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z))) return null;
    const minX = Math.min(...pts.map((p) => p.x));
    const minZ = Math.min(...pts.map((p) => p.z));
    const poly = pts.map((p) => [mm(p.x - minX), mm(p.z - minZ)]);
    const w = Math.max(...poly.map((p) => p[0]));
    const d = Math.max(...poly.map((p) => p[1]));
    if (!(w > 0 && d > 0)) return null;

    const walls = poly.length;
    const onWall = (n) => Number.isInteger(n) && n >= 0 && n < walls;
    const openings = (scan.openings || []).filter((o) => o && onWall(o.wall)).map((o) => ({
      kind: o.type === 'window' ? 'window' : 'door', // an archway is an opening without a leaf
      wall: 'e' + o.wall,
      offset: mm(o.offset),
      width: mm(o.width),
      height: mm(o.height),
      sill: o.type === 'window' ? mm(o.sill) : 0,
      detected: true,
    }));
    // The editor's socket list is the only kind of wall fixture it shows.
    const utilities = (scan.fixtures || []).filter((f) => f && f.type === 'socket' && onWall(f.wall)).map((f) => ({
      kind: 'socket',
      wall: 'e' + f.wall,
      offset: mm(f.offset),
      height: mm(f.height),
      detected: true,
    }));

    const type = roomType(scan.type || scan.name);
    const name = (typeof scan.name === 'string' && scan.name.trim()) || (type === 'other' ? 'Scanned room' : TYPE_NAMES[type]);
    return { key: 'room-' + index, name, type, w, d, h: mm(scan.height) || 2700, poly, openings, utilities };
  }

  /** Every room in a scan (a home has several), in scan order. */
  function roomsFromScan(scan) {
    const list = scan && scan.schema === HOMESCAN ? scan.rooms || [] : [scan];
    return list.map((room, i) => roomFromScan(room, i)).filter(Boolean);
  }

  /** The fields a project record takes from a scanned room. */
  function projectFields(room) {
    return {
      scanRoom: room.key,
      roomName: room.name,
      roomType: room.type,
      roomW: room.w,
      roomD: room.d,
      roomH: room.h,
      roomPoly: room.poly.map((p) => p.slice()),
      openings: room.openings.map((o) => ({ ...o })),
      utilities: room.utilities.map((u) => ({ ...u })),
      openingSource: 'scan',
      openingsSeeded: true,
      utilitiesSeeded: true,
    };
  }

  const api = { roomsFromScan, roomFromScan, projectFields, roomType };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RoomMuseScanRoom = api;
})(typeof window !== 'undefined' ? window : globalThis);
