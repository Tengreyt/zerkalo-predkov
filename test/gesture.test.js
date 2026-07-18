import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeControlHand,
  classifyHandGeometry,
  isDeliberatePalm,
} from '../src/core/gestureRecognizer.js';
import { GestureController } from '../src/core/gestureController.js';
import { SideGestureNavigator } from '../src/core/sideGestureNavigator.js';

function hand(extended = [], thumb = false) {
  const lm = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.72, z: 0 }));
  lm[0] = { x: 0.5, y: 0.9, z: 0 };
  const fingers = [[8, 6], [12, 10], [16, 14], [20, 18]];
  for (let i = 0; i < fingers.length; i++) {
    const [tip, pip] = fingers[i];
    lm[pip] = { x: 0.42 + i * 0.055, y: extended.includes(i) ? 0.53 : 0.68, z: 0 };
    lm[tip] = { x: 0.42 + i * 0.055, y: extended.includes(i) ? 0.22 : 0.76, z: 0 };
  }
  lm[3] = { x: 0.44, y: 0.79, z: 0 };
  lm[4] = thumb ? { x: 0.47, y: 0.43, z: 0 } : { x: 0.46, y: 0.76, z: 0 };
  return lm;
}

test('geometry fallback recognizes museum control gestures', () => {
  assert.equal(classifyHandGeometry(hand([0, 1, 2, 3], true)).name, 'Open_Palm');
  assert.equal(classifyHandGeometry(hand([0, 1])).name, 'Victory');
  assert.equal(classifyHandGeometry(hand([0])).name, 'Pointing_Up');
  assert.equal(classifyHandGeometry(hand([], true)).name, 'Thumb_Up');
  assert.equal(classifyHandGeometry(hand([])).name, 'Closed_Fist');
});

test('confirmation palm can use either side but must be raised and not be edge-on', () => {
  const palm = hand([0, 1, 2, 3], true);
  palm[0] = { x: 0.5, y: 0.68, z: 0 };
  palm[5] = { x: 0.43, y: 0.55, z: 0 };
  palm[9] = { x: 0.50, y: 0.51, z: 0 };
  palm[17] = { x: 0.58, y: 0.57, z: 0 };
  assert.equal(isDeliberatePalm(palm, 'Right'), true);
  assert.equal(isDeliberatePalm(palm, 'Left'), true);

  const lowered = structuredClone(palm);
  lowered[0].y = 0.86;
  assert.equal(isDeliberatePalm(lowered, 'Right'), false);

  const edgeOn = structuredClone(palm);
  edgeOn[17].x = 0.445;
  assert.equal(isDeliberatePalm(edgeOn, 'Right'), false);
});

test('all control gestures require a raised and clearly visible hand', () => {
  const raised = hand([0]);
  raised[0].y = 0.64;
  raised[9] = { x: 0.5, y: 0.5, z: 0 };
  assert.equal(analyzeControlHand(raised).ready, true);

  const lowered = structuredClone(raised);
  lowered[0].y = 0.84;
  assert.equal(analyzeControlHand(lowered).ready, false);

  const tiny = structuredClone(raised);
  tiny[9] = { x: 0.5, y: 0.63, z: 0 };
  assert.equal(analyzeControlHand(tiny).ready, false);
});

test('short recognition dropouts do not interrupt palm hold', () => {
  const ctl = new GestureController({ holdMs: 900, debounceFrames: 2, dropoutGraceFrames: 3 });
  ctl.update('Open_Palm', 0);
  ctl.update('Open_Palm', 100);
  ctl.update('None', 300);
  ctl.update('None', 400);
  const event = ctl.update('None', 500);
  assert.equal(event.name, 'Open_Palm');
  assert.ok(event.progress > 0);
  assert.equal(event.hold, null);
});

test('releasing palm cannot finish a nearly completed confirmation hold', () => {
  const ctl = new GestureController({ holdMs: 500, debounceFrames: 2, dropoutGraceFrames: 3 });
  for (const time of [0, 100, 200, 300, 400]) ctl.update('Open_Palm', time);
  const released = ctl.update('None', 600);
  assert.equal(released.hold, null);
  assert.ok(released.progress < 1);
});

test('screen transition requires a real hand release before another action', () => {
  const ctl = new GestureController({ holdMs: 300, debounceFrames: 2, dropoutGraceFrames: 2 });
  ctl.reset({ requireRelease: true });
  for (let t = 0; t < 400; t += 80) {
    assert.equal(ctl.update('Open_Palm', t).hold, null);
  }
  for (let t = 400; t < 720; t += 80) ctl.update('None', t);
  ctl.update('Open_Palm', 800);
  ctl.update('Open_Palm', 880);
  assert.equal(ctl.update('Open_Palm', 1240).hold, 'Open_Palm');
});

test('Victory hold navigates by the visible side of the mirrored frame', () => {
  const nav = new SideGestureNavigator({ holdMs: 1000, dropoutGraceMs: 200 });
  assert.equal(nav.update({ name: 'Victory', wrist: { x: 0.8 } }, 0).action, null);
  assert.equal(nav.update({ name: 'Victory', wrist: { x: 0.8 } }, 1000).action, 'next');
  assert.equal(nav.update({ name: 'Victory', wrist: { x: 0.8 } }, 1200).action, null);
  nav.update({ name: 'None', wrist: null }, 1500);
  nav.update({ name: 'None', wrist: null }, 1800);
  assert.equal(nav.update({ name: 'Victory', wrist: { x: 0.2 } }, 1900).direction, 'prev');
  assert.equal(nav.update({ name: 'Victory', wrist: { x: 0.2 } }, 2900).action, 'prev');
});
