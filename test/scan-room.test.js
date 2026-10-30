'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { roomsFromScan, projectFields, roomType } = require('../apps/web/roommuse/scan-room');

const sample = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'samples', name), 'utf8'));

test('a room scan becomes one room with its exact outline, openings and sockets', () => {
  const [room, ...rest] = roomsFromScan(sample('kitchen.roomscan.json'));
  assert.equal(rest.length, 0);
  assert.deepEqual(room.poly, [[0, 0], [4000, 0], [4000, 3000], [0, 3000]]);
  assert.equal(room.w, 4000);
  assert.equal(room.d, 3000);
  assert.equal(room.h, 2500);
  assert.deepEqual(room.openings, [{ kind: 'door', wall: 'e0', offset: 800, width: 900, height: 2050, sill: 0, detected: true }]);
  assert.deepEqual(room.utilities.map((u) => [u.wall, u.offset, u.height]), [['e0', 2400, 1100], ['e1', 1500, 300]]);
});

test('a home scan gives every room, each moved to its own corner', () => {
  const rooms = roomsFromScan(sample('twobedroom.roomscan.json'));
  assert.deepEqual(rooms.map((r) => [r.key, r.name, r.type]), [
    ['room-0', 'Hallway', 'other'],
    ['room-1', 'Bedroom A', 'bedroom'],
    ['room-2', 'Bedroom B', 'bedroom'],
  ]);
  for (const r of rooms) {
    assert.equal(Math.min(...r.poly.map((p) => p[0])), 0, r.name);
    assert.equal(Math.min(...r.poly.map((p) => p[1])), 0, r.name);
  }
  const a = rooms[1];
  assert.equal(a.poly.length, 6, 'the L-shaped bedroom keeps all six corners');
  assert.deepEqual(a.openings.map((o) => [o.kind, o.wall]), [['door', 'e5'], ['window', 'e1']]);
  assert.ok(a.openings[1].sill > 0, 'windows keep their sill');
  assert.equal(rooms[0].utilities.length, 0, 'only sockets are carried: the hallway has a switch');
  assert.equal(a.utilities.length, 3);
});

test('openings on walls the outline does not have, and broken outlines, are dropped', () => {
  const scan = {
    schema: 'mozu.roomscan/1', height: 2400,
    polygon: [{ x: 10, z: 20 }, { x: 3010, z: 20 }, { x: 3010, z: 2020 }],
    openings: [{ type: 'archway', wall: 2, offset: 100, width: 800, height: 2000 }, { type: 'door', wall: 3, offset: 0, width: 800, height: 2000 }],
    objects: [],
  };
  const [room] = roomsFromScan(scan);
  assert.deepEqual(room.poly, [[0, 0], [3000, 0], [3000, 2000]]);
  assert.deepEqual(room.openings.map((o) => [o.kind, o.wall]), [['door', 'e2']], 'an archway is a door-type opening; wall 3 does not exist');
  assert.equal(room.name, 'Scanned room');
  assert.deepEqual(roomsFromScan({ ...scan, polygon: [{ x: 0, z: 0 }, { x: 1, z: 0 }] }), []);
  assert.deepEqual(roomsFromScan({ ...scan, polygon: [{ x: 0, z: 0 }, { x: 0, z: 5 }, { x: 0, z: 9 }] }), [], 'no area');
});

test('projectFields copies what a project record needs from a room', () => {
  const [room] = roomsFromScan(sample('kitchen.roomscan.json'));
  const fields = projectFields(room);
  assert.equal(fields.openingSource, 'scan');
  assert.deepEqual([fields.roomW, fields.roomD, fields.roomH], [4000, 3000, 2500]);
  fields.roomPoly[0][0] = 99;
  fields.openings[0].offset = 99;
  assert.equal(room.poly[0][0], 0, 'a copy, not the room itself');
  assert.equal(room.openings[0].offset, 800);
});

test('roomType maps RoomPlan names to the editor\'s room types', () => {
  assert.equal(roomType('livingRoom'), 'living');
  assert.equal(roomType('Bedroom A'), 'bedroom');
  assert.equal(roomType('diningRoom'), 'dining');
  assert.equal(roomType('bathroom'), 'other');
  assert.equal(roomType(undefined), 'other');
});
