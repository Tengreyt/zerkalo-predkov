import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBodyMesh,
  buildHeadwearMesh,
  buildSleeveMeshes,
  buildStaticSleeveMeshes,
  isWarpMeshSafe,
  isPoseConfident,
} from '../src/core/costumeLayout.js';
import { LandmarkSmoother, SleeveMeshSmoother } from '../src/core/smoothing.js';
import { settings } from '../src/config/settings.js';
import { readFileSync } from 'node:fs';

function makeLandmarks() {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.99 }));
  Object.assign(lm[0], { x: 0.5, y: 0.21 });
  Object.assign(lm[2], { x: 0.46, y: 0.19 });
  Object.assign(lm[5], { x: 0.54, y: 0.19 });
  Object.assign(lm[7], { x: 0.44, y: 0.16 });
  Object.assign(lm[8], { x: 0.56, y: 0.16 });
  Object.assign(lm[11], { x: 0.38, y: 0.27 });
  Object.assign(lm[12], { x: 0.62, y: 0.27 });
  Object.assign(lm[13], { x: 0.31, y: 0.43 });
  Object.assign(lm[14], { x: 0.69, y: 0.43 });
  Object.assign(lm[15], { x: 0.27, y: 0.60 });
  Object.assign(lm[16], { x: 0.73, y: 0.60 });
  Object.assign(lm[23], { x: 0.42, y: 0.52 });
  Object.assign(lm[24], { x: 0.58, y: 0.52 });
  Object.assign(lm[25], { x: 0.44, y: 0.72 });
  Object.assign(lm[26], { x: 0.56, y: 0.72 });
  Object.assign(lm[27], { x: 0.45, y: 0.93 });
  Object.assign(lm[28], { x: 0.55, y: 0.93 });
  return lm;
}

const costume = {
  anchors: {
    canvas: [1000, 1400],
    left_shoulder: [270, 200],
    right_shoulder: [730, 200],
  },
};

test('full pose produces a flexible eight-row body mesh ending at the ankles', () => {
  const lm = makeLandmarks();
  const mesh = buildBodyMesh(lm, 1280, 720, costume);
  assert.ok(mesh);
  assert.equal(mesh.rows.length, 8);
  for (let i = 1; i < mesh.rows.length; i++) {
    assert.ok(mesh.rows[i].sourceY > mesh.rows[i - 1].sourceY);
  }
  const hem = mesh.rows.at(-1);
  const hemCenterY = (hem.left.y + hem.right.y) / 2;
  assert.ok(Math.abs(hemCenterY - 0.93 * 720) < 0.01);
});

test('torso pose is accepted without feet but broken torso is rejected', () => {
  const partial = makeLandmarks();
  partial[28].visibility = 0.1;
  partial[27].visibility = 0.1;
  partial[25].visibility = 0.1;
  partial[26].visibility = 0.1;
  assert.equal(isPoseConfident(partial), true);
  const partialMesh = buildBodyMesh(partial, 1280, 720, costume);
  assert.ok(partialMesh);
  assert.equal(partialMesh.rows.length, 8);
  assert.ok(partialMesh.rows.at(-1).left.y <= 720 * 1.02);

  const broken = makeLandmarks();
  broken[23].y = 0.24;
  broken[24].y = 0.24;
  assert.equal(isPoseConfident(broken), false);
  assert.equal(isPoseConfident(makeLandmarks()), true);
});

test('adaptive smoothing damps stationary landmark jitter', () => {
  const smoother = new LandmarkSmoother();
  const input = [];
  const output = [];
  for (let frame = 0; frame < 40; frame++) {
    const lm = makeLandmarks();
    const jitter = frame % 2 === 0 ? 0.008 : -0.008;
    lm[11].x += jitter;
    input.push(lm[11].x);
    output.push(smoother.update(lm, frame * 33.333)[11].x);
  }
  const spread = (values) => Math.max(...values) - Math.min(...values);
  assert.ok(spread(output.slice(10)) < spread(input) * 0.35);
});

test('sleeve mesh follows fast motion smoothly and holds through a short wrist dropout', () => {
  const meshAt = (x, inFront = false) => ({
    sourceWidth: 100,
    sourceHeight: 300,
    kind: 'sleeve',
    inFront,
    rows: [0, 75, 150, 225, 300].map((sourceY, index) => ({
      sourceY,
      sourceLeft: 0,
      sourceRight: 50,
      left: { x: x + index * 10, y: index * 20 },
      right: { x: x + 40 + index * 10, y: index * 20 },
    })),
  });
  const smoother = new SleeveMeshSmoother({
    followMs: 105,
    fastFollowMs: 38,
    speedForFast: 720,
    dropoutHoldMs: 360,
    fallbackMs: 280,
    inFrontFrames: 3,
  });
  const initial = smoother.update({ left: meshAt(0) }, null, 0).left;
  const moving = smoother.update({ left: meshAt(100, true) }, null, 16).left;
  assert.ok(moving.rows[0].left.x > initial.rows[0].left.x);
  assert.ok(moving.rows[0].left.x < 100);

  const held = smoother.update({ left: null }, { left: meshAt(-80) }, 160).left;
  assert.equal(held.rows[0].left.x, moving.rows[0].left.x);

  const fallbackBlend = smoother.update({ left: null }, { left: meshAt(-80) }, 560).left;
  assert.ok(fallbackBlend.rows[0].left.x < held.rows[0].left.x);
  assert.ok(fallbackBlend.rows[0].left.x > -80);
});

test('both Gabali variants explicitly disable headwear', () => {
  const manifest = JSON.parse(readFileSync(
    new URL('../public/assets/costumes/manifest.json', import.meta.url),
    'utf8',
  ));
  assert.equal(manifest.costumes.gabali_green.headwear, null);
  assert.equal(manifest.costumes.gabali_red.headwear, null);
});

test('AR headwear has explicit top, crown, band and bottom support rows', () => {
  const headwear = {
    anchors: { canvas: [1094, 865] },
    fit: {
      mode: 'head-mesh',
      top_ellipse_y: 160,
      band_y: 565,
      width_factor: 1.58,
      height_factor: 0.78,
      bottom_lift: 0.16,
    },
  };
  const mesh = buildHeadwearMesh(makeLandmarks(), 1280, 720, headwear);
  assert.ok(mesh);
  assert.equal(mesh.kind, 'headwear');
  assert.deepEqual(mesh.rows.map((row) => row.sourceY), [0, 160, 565, 865]);
  const topCenterY = (mesh.rows[0].left.y + mesh.rows[0].right.y) / 2;
  const bottomCenterY = (mesh.rows.at(-1).left.y + mesh.rows.at(-1).right.y) / 2;
  assert.ok(topCenterY < bottomCenterY);
});

test('AR headwear mesh stays valid during small head tilt and yaw', () => {
  const headwear = {
    anchors: { canvas: [1094, 865] },
    fit: {
      mode: 'head-mesh', top_ellipse_y: 160, band_y: 565,
      width_factor: 1.58, height_factor: 0.78, bottom_lift: 0.16,
    },
  };
  for (const noseX of [0.46, 0.5, 0.54]) {
    const lm = makeLandmarks();
    lm[0].x = noseX;
    lm[7].y = 0.15;
    lm[8].y = 0.17;
    const mesh = buildHeadwearMesh(lm, 1280, 720, headwear);
    assert.ok(mesh);
    assert.ok(isWarpMeshSafe(mesh));
    assert.ok(mesh.rows.every((row) => row.left.x < row.right.x));
  }
});

test('sleeves are independently mapped to shoulder, elbow and wrist', () => {
  const sleeve = {
    polygon: [[0, 0], [100, 0], [80, 300], [0, 300]],
    rows: {
      shoulder: { left: [0, 20], right: [80, 20] },
      elbow: { left: [5, 150], right: [70, 150] },
      wrist: { left: [10, 290], right: [60, 290] },
    },
  };
  const withSleeves = {
    ...costume,
    fit: { sleeves: { left: sleeve, right: sleeve } },
  };
  const mesh = buildSleeveMeshes(makeLandmarks(), 1280, 720, withSleeves);
  assert.ok(mesh.left && mesh.right);
  assert.deepEqual(mesh.left.rows.map((row) => Math.round(row.sourceY)), [20, 46, 150, 213, 290]);
  const elbowCenter = {
    x: (mesh.left.rows[2].left.x + mesh.left.rows[2].right.x) / 2,
    y: (mesh.left.rows[2].left.y + mesh.left.rows[2].right.y) / 2,
  };
  // В зеркальном кадре визуально левая рука — MediaPipe RIGHT_ELBOW.
  assert.ok(Math.abs(elbowCenter.x - 0.69 * 1280) > 100); // left mesh is on screen-left
  assert.ok(elbowCenter.x < 1280 / 2);
});

test('graduation gown has complete safe sleeve meshes when both arms are raised', () => {
  const manifest = JSON.parse(readFileSync(
    new URL('../public/assets/costumes/manifest.json', import.meta.url),
    'utf8',
  ));
  const gown = manifest.costumes.gown;
  const lm = makeLandmarks();
  Object.assign(lm[13], { x: 0.24, y: 0.22 });
  Object.assign(lm[15], { x: 0.16, y: 0.10 });
  Object.assign(lm[14], { x: 0.76, y: 0.22 });
  Object.assign(lm[16], { x: 0.84, y: 0.10 });
  const sleeves = buildSleeveMeshes(lm, 1280, 720, gown);
  assert.ok(sleeves.left && sleeves.right);
  assert.ok(isWarpMeshSafe(sleeves.left));
  assert.ok(isWarpMeshSafe(sleeves.right));
  assert.equal(sleeves.left.rows.length, 5);
  assert.equal(sleeves.right.rows.length, 5);
});

test('sleeve moves in front of torso when the arm crosses toward camera', () => {
  const lm = makeLandmarks();
  lm[13].z = -0.22;
  lm[15].z = -0.26;
  const sleeve = {
    polygon: [[0, 0], [100, 0], [80, 300], [0, 300]],
    rows: {
      shoulder: { left: [0, 20], right: [80, 20] },
      elbow: { left: [5, 150], right: [70, 150] },
      wrist: { left: [10, 290], right: [60, 290] },
    },
  };
  const mesh = buildSleeveMeshes(lm, 1280, 720, {
    ...costume,
    fit: { sleeves: { left: sleeve, right: sleeve } },
  });
  assert.ok(mesh.left.inFront || mesh.right.inFront);
});

test('single-frame arm outlier falls back instead of stretching a sleeve', () => {
  const lm = makeLandmarks();
  lm[15].x = -1.2;
  lm[15].y = -0.8;
  const sleeve = {
    polygon: [[0, 0], [100, 0], [80, 300], [0, 300]],
    rows: {
      shoulder: { left: [0, 20], right: [80, 20] },
      elbow: { left: [5, 150], right: [70, 150] },
      wrist: { left: [10, 290], right: [60, 290] },
    },
  };
  const mesh = buildSleeveMeshes(lm, 1280, 720, {
    ...costume,
    fit: { sleeves: { left: sleeve, right: sleeve } },
  });
  assert.ok(mesh.left === null || mesh.right === null);
});

test('lost wrist uses a sleeve-sized static mesh instead of the full body mesh', () => {
  const lm = makeLandmarks();
  const sleeve = {
    polygon: [[0, 0], [100, 0], [80, 300], [0, 300]],
    rows: {
      shoulder: { left: [0, 200], right: [190, 200] },
      elbow: { left: [15, 420], right: [155, 420] },
      wrist: { left: [30, 650], right: [120, 650] },
    },
  };
  const withSleeves = {
    ...costume,
    fit: { sleeves: { left: sleeve, right: sleeve } },
  };
  const body = buildBodyMesh(lm, 1280, 720, withSleeves);
  const fallback = buildStaticSleeveMeshes(body, withSleeves);
  assert.ok(fallback.left && fallback.right);
  assert.equal(fallback.left.rows.length, 5);
  assert.ok(isWarpMeshSafe(fallback.left, 0.5));
  const firstWidth = Math.hypot(
    fallback.left.rows[0].right.x - fallback.left.rows[0].left.x,
    fallback.left.rows[0].right.y - fallback.left.rows[0].left.y,
  );
  const bodyWidth = Math.hypot(
    body.rows[1].right.x - body.rows[1].left.x,
    body.rows[1].right.y - body.rows[1].left.y,
  );
  assert.ok(firstWidth < bodyWidth * 0.25);
});

test('inverted target triangles are rejected before rendering', () => {
  const mesh = buildBodyMesh(makeLandmarks(), 1280, 720, costume);
  assert.equal(isWarpMeshSafe(mesh), true);
  const broken = structuredClone(mesh);
  [broken.rows[2].left, broken.rows[2].right] = [broken.rows[2].right, broken.rows[2].left];
  assert.equal(isWarpMeshSafe(broken), false);
});

test('fixed fallback keeps body and headwear inside a 16:9 demo frame', async () => {
  const { layoutCostume } = await import('../src/core/costumeLayout.js');
  const previous = settings.positioningStrategy;
  settings.positioningStrategy = 'fixed';
  try {
    const headwear = {
      anchors: { canvas: [1094, 865], left_ear: [185, 820], right_ear: [909, 820] },
      fit: { height_factor: 0.78 },
    };
    const layout = layoutCostume(makeLandmarks(), 1280, 720, costume, headwear);
    assert.ok(isWarpMeshSafe(layout.bodyMesh));
    assert.ok(layout.bodyMesh.rows[0].left.y >= 0);
    assert.ok(layout.bodyMesh.rows.at(-1).right.y <= 720);
    assert.ok(layout.head.y >= 0);
    assert.ok(layout.head.y + layout.head.h <= 720);
  } finally {
    settings.positioningStrategy = previous;
  }
});
