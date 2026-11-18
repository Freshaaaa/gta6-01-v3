// Solmar Bay 3D — the Three.js board. Builds the scene once from the
// seeded city (ground texture, instanced buildings/windows/neon/trees/
// lamps, pier, lighthouse, fountain) and syncs every dynamic object from
// the game state each frame: cars (one merged-geometry mesh each +
// instanced wheels), characters, the police helicopter, particles, rain,
// skid marks, tracers, markers and the chase camera. Also draws the
// rotating heading-up minimap. No game logic lives here — it only reads
// state and paints it.

import * as THREE from '../vendor/three.module.js';
import { WORLD_SIZE, ROAD_WIDTH, ROAD_GAP, ROAD_FIRST, ROAD_COUNT, LANDMARKS } from './config.js';
import { clamp, lerp } from './rng.js';
import { gpsRoute } from './city.js';

const roadLines = [];
for (let i = 0; i < ROAD_COUNT; i++) roadLines.push(ROAD_FIRST + i * ROAD_GAP);

// ---- small geometry helpers (our own merge; no BufferGeometryUtils) ----

function boxPart(list, w, h, d, x, y, z, color, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  list.push(g);
  return g;
}

function mergeGeometries(list) {
  let vCount = 0;
  let iCount = 0;
  for (const g of list) {
    vCount += g.attributes.position.count;
    iCount += g.index.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const col = new Float32Array(vCount * 3);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    col.set(g.attributes.color.array, vo * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count;
    io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return `#${c.getHexString()}`;
}

// ---- ground texture (one canvas, drawn once) ----

function buildGroundTexture(city) {
  const S = 1024;
  const k = S / WORLD_SIZE; // px per metre
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d');
  // District ground tints.
  g.fillStyle = '#9aa78a';
  g.fillRect(0, 0, S, S);
  const districts = [
    { x0: 0, y0: 0, x1: 135, y1: 270, ground: '#a8b078' },
    { x0: 135, y0: 0, x1: 270, y1: 270, ground: '#9aa78a' },
    { x0: 270, y0: 0, x1: 405, y1: 270, ground: '#a3ad7c' },
    { x0: 405, y0: 0, x1: 540, y1: 270, ground: '#b5b98a' },
    { x0: 0, y0: 270, x1: 135, y1: 540, ground: '#9db384' },
    { x0: 135, y0: 270, x1: 270, y1: 540, ground: '#a8b078' },
    { x0: 270, y0: 270, x1: 405, y1: 540, ground: '#a3ad7c' },
    { x0: 405, y0: 270, x1: 540, y1: 540, ground: '#9aa78a' },
  ];
  for (const d of districts) {
    g.fillStyle = d.ground;
    g.fillRect(d.x0 * k, d.y0 * k, (d.x1 - d.x0) * k, (d.y1 - d.y0) * k);
  }
  // Beach + water along the south edge.
  g.fillStyle = '#e8d9a8';
  g.fillRect(0, 516 * k, S, 12 * k);
  g.fillStyle = '#3fa7d6';
  g.fillRect(0, 528 * k, S, 12 * k);
  g.fillStyle = '#57b6e0';
  g.fillRect(0, 532 * k, S, 8 * k);
  // Sidewalks: light slabs inside every block.
  g.fillStyle = '#8f9296';
  for (let bj = 0; bj < ROAD_COUNT - 1; bj++) {
    for (let bi = 0; bi < ROAD_COUNT - 1; bi++) {
      const x0 = roadLines[bi] + ROAD_WIDTH / 2;
      const z0 = roadLines[bj] + ROAD_WIDTH / 2;
      const w = ROAD_GAP - ROAD_WIDTH;
      g.fillRect(x0 * k, z0 * k, w * k, w * k);
    }
  }
  // Parks: green slabs.
  g.fillStyle = '#6fae5f';
  for (const b of city.buildings) { /* parks are implied by trees; skip */ }
  // Roads: dark asphalt bands.
  g.fillStyle = '#26292f';
  for (const r of roadLines) {
    g.fillRect(0, (r - ROAD_WIDTH / 2) * k, S, ROAD_WIDTH * k);
    g.fillRect((r - ROAD_WIDTH / 2) * k, 0, ROAD_WIDTH * k, S);
  }
  // Lane dashes.
  g.fillStyle = '#d8c56a';
  for (const r of roadLines) {
    for (let m = 20; m < WORLD_SIZE; m += 12) {
      g.fillRect(m * k, (r - 0.3) * k, 5 * k, 0.6 * k);
      g.fillRect((r - 0.3) * k, m * k, 0.6 * k, 5 * k);
    }
  }
  // Crosswalks at intersections.
  g.fillStyle = '#dfe3e6';
  for (const rz of roadLines) {
    for (const rx of roadLines) {
      for (let s = -3; s <= 3; s++) {
        g.fillRect((rx + s * 1.6 - 0.5) * k, (rz - ROAD_WIDTH / 2 + 1) * k, 1 * k, 2.4 * k);
        g.fillRect((rx + s * 1.6 - 0.5) * k, (rz + ROAD_WIDTH / 2 - 3.4) * k, 1 * k, 2.4 * k);
      }
    }
  }
  // Plaza stone.
  g.fillStyle = '#c9c2b4';
  g.fillRect((270 - 23) * k, (270 - 23) * k, 46 * k, 46 * k);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---- car geometry (merged, vertex-coloured, forward = +z) ----

function buildCarGeometry(model) {
  const parts = [];
  const len = model.len;
  const wid = model.wid;
  const body = model.color;
  const glass = '#16202a';
  const dark = '#1c1f24';
  boxPart(parts, wid, 0.55, len, 0, 0.48, 0, body);
  boxPart(parts, wid * 0.82, 0.42, len * 0.48, 0, 0.95, -len * 0.06, glass);
  boxPart(parts, wid * 0.9, 0.12, 0.5, 0, 0.42, len / 2 - 0.1, dark); // front bumper
  boxPart(parts, wid * 0.9, 0.12, 0.5, 0, 0.42, -len / 2 + 0.1, dark); // rear bumper
  boxPart(parts, 0.5, 0.14, 0.08, -wid * 0.28, 0.55, len / 2 + 0.02, '#fff8d0'); // headlights
  boxPart(parts, 0.5, 0.14, 0.08, wid * 0.28, 0.55, len / 2 + 0.02, '#fff8d0');
  boxPart(parts, 0.5, 0.14, 0.08, -wid * 0.28, 0.55, -len / 2 - 0.02, '#ff2222'); // taillights
  boxPart(parts, 0.5, 0.14, 0.08, wid * 0.28, 0.55, -len / 2 - 0.02, '#ff2222');
  if (model.spoiler) {
    boxPart(parts, wid * 0.9, 0.06, 0.4, 0, 1.05, -len / 2 + 0.25, dark);
    boxPart(parts, 0.08, 0.25, 0.08, -wid * 0.35, 0.9, -len / 2 + 0.25, dark);
    boxPart(parts, 0.08, 0.25, 0.08, wid * 0.35, 0.9, -len / 2 + 0.25, dark);
  }
  if (model.taxi) {
    boxPart(parts, 0.7, 0.22, 0.4, 0, 1.28, 0, '#f5b301');
  }
  if (model.name === 'Hauler') {
    boxPart(parts, wid * 0.9, 0.5, len * 0.4, 0, 1.0, -len * 0.2, shade(body, 0.8));
  }
  const geo = mergeGeometries(parts);
  return geo;
}

function buildCharacterGeometry(shirt, pants, skin) {
  const parts = [];
  boxPart(parts, 0.55, 0.7, 0.3, 0, 1.08, 0, shirt); // torso
  boxPart(parts, 0.34, 0.34, 0.32, 0, 1.62, 0, skin); // head
  boxPart(parts, 0.2, 0.55, 0.22, -0.14, 0.45, 0, pants); // legs
  boxPart(parts, 0.2, 0.55, 0.22, 0.14, 0.45, 0, pants);
  boxPart(parts, 0.14, 0.55, 0.16, -0.36, 1.05, 0, shirt); // arms
  boxPart(parts, 0.14, 0.55, 0.16, 0.36, 1.05, 0, shirt);
  return mergeGeometries(parts);
}

/** The player character: a group with a merged torso (head + arms) and
 * two separate leg meshes that swing from the hip while walking. */
export function buildPlayerCharacter(shirt, pants, skin) {
  const torsoParts = [];
  boxPart(torsoParts, 0.55, 0.7, 0.3, 0, 1.08, 0, shirt);
  boxPart(torsoParts, 0.34, 0.34, 0.32, 0, 1.62, 0, skin);
  boxPart(torsoParts, 0.14, 0.55, 0.16, -0.36, 1.05, 0, shirt);
  boxPart(torsoParts, 0.14, 0.55, 0.16, 0.36, 1.05, 0, shirt);
  const torso = new THREE.Mesh(mergeGeometries(torsoParts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  torso.castShadow = true;
  const legParts = [];
  boxPart(legParts, 0.2, 0.55, 0.22, 0, -0.27, 0, pants);
  const legGeo = mergeGeometries(legParts);
  const legMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.14, 0.72, 0);
  legL.castShadow = true;
  const legR = new THREE.Mesh(legGeo, legMat);
  legR.position.set(0.14, 0.72, 0);
  legR.castShadow = true;
  const group = new THREE.Group();
  group.add(torso);
  group.add(legL);
  group.add(legR);
  return { group, torso, legL, legR };
}

// ---- the board ----

export class Board {
  constructor(canvas, minimapCanvas) {
    this.canvas = canvas;
    this.minimap = minimapCanvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#87b5e0');
    this.scene.fog = new THREE.Fog('#a8c4de', 200, 650);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);
    this.camPos = new THREE.Vector3(90, 30, 130);
    this.camLook = new THREE.Vector3(90, 1, 90);
    this.camFov = 62;
    this.shake = 0;

    // Lights.
    this.sun = new THREE.DirectionalLight('#ffdcae', 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -70;
    this.sun.shadow.camera.right = 70;
    this.sun.shadow.camera.top = 70;
    this.sun.shadow.camera.bottom = -70;
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 400;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight('#bcd6ff', '#d9a26c', 1.0);
    this.scene.add(this.hemi);
    this.lambert = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.carMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

    this.city = null;
    this.carMeshes = new Map(); // car object -> mesh
    this.charMeshes = new Map(); // ped/goon object -> mesh
    this.wheelMesh = null;
    this.maxCars = 64;
    this.tracers = [];
    this.particles = null;
    this.rain = null;
    this.skidMesh = null;
    this.skidIdx = 0;
    this.markerGroup = new THREE.Group();
    this.scene.add(this.markerGroup);
    this.heliGroup = null;
    this.heliRotor = null;
    this.heliCone = null;
    this.heliDisc = null;
    this.lighthouseBeam = null;
    this.coinMesh = null;
    this.windowMat = null;
    this.neonMat = null;
    this.lampMat = null;
    this.groundCanvas = null;
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  buildCity(city) {
    this.city = city;
    const groundTex = buildGroundTexture(city);
    this.groundCanvas = groundTex.image;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE),
      new THREE.MeshLambertMaterial({ map: groundTex }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(WORLD_SIZE / 2, 0, WORLD_SIZE / 2);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Buildings: one instanced box, per-instance colour.
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    boxGeo.translate(0, 0.5, 0);
    const bMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    const bMesh = new THREE.InstancedMesh(boxGeo, bMat, city.buildings.length);
    bMesh.castShadow = true;
    bMesh.receiveShadow = true;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    city.buildings.forEach((b, i) => {
      p.set(b.x, 0, b.z);
      s.set(b.w, b.h, b.d);
      m4.compose(p, q, s);
      bMesh.setMatrixAt(i, m4);
      bMesh.setColorAt(i, col.set(b.color));
    });
    bMesh.instanceMatrix.needsUpdate = true;
    if (bMesh.instanceColor) bMesh.instanceColor.needsUpdate = true;
    this.scene.add(bMesh);

    // Window bands: one thin box per floor, slightly wider than the wall,
    // so it reads from every side. Unlit; colour lerps day -> warm night.
    const floors = [];
    for (const b of city.buildings) {
      const n = Math.max(1, Math.floor(b.h / 3.2));
      for (let f = 0; f < n; f++) {
        floors.push({ x: b.x, y: 2.2 + f * 3.2, z: b.z, w: b.w + 0.15, d: b.d + 0.15 });
      }
    }
    const winGeo = new THREE.BoxGeometry(1, 1, 1);
    winGeo.translate(0, 0.5, 0);
    this.windowMat = new THREE.MeshBasicMaterial({ color: '#1a2233' });
    const winMesh = new THREE.InstancedMesh(winGeo, this.windowMat, floors.length);
    floors.forEach((f, i) => {
      p.set(f.x, f.y, f.z);
      s.set(f.w, 0.9, f.d);
      m4.compose(p, q, s);
      winMesh.setMatrixAt(i, m4);
      winMesh.setColorAt(i, col.setHSL(0.1, 0.7, 0.55 + (i % 3) * 0.08));
    });
    winMesh.instanceMatrix.needsUpdate = true;
    if (winMesh.instanceColor) winMesh.instanceColor.needsUpdate = true;
    this.scene.add(winMesh);

    // Neon signs on the Strip / Downtown / Marina faces.
    const neons = city.buildings.filter((b) => b.neon);
    const neonGeo = new THREE.BoxGeometry(1, 1, 1);
    this.neonMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const neonMesh = new THREE.InstancedMesh(neonGeo, this.neonMat, Math.max(1, neons.length));
    neons.forEach((b, i) => {
      p.set(b.x, Math.min(b.h - 1.5, 8), b.z + b.d / 2 + 0.15);
      s.set(Math.min(b.w * 0.7, 6), 0.6, 0.15);
      m4.compose(p, q, s);
      neonMesh.setMatrixAt(i, m4);
      neonMesh.setColorAt(i, col.set(b.neonColor));
    });
    neonMesh.count = neons.length;
    neonMesh.instanceMatrix.needsUpdate = true;
    if (neonMesh.instanceColor) neonMesh.instanceColor.needsUpdate = true;
    this.scene.add(neonMesh);

    // Trees: trunks + canopies, instanced.
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 2.2, 6);
    trunkGeo.translate(0, 1.1, 0);
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: '#6b4a2f' }), city.trees.length);
    trunkMesh.castShadow = true;
    const canopyGeo = new THREE.IcosahedronGeometry(1.7, 0);
    canopyGeo.translate(0, 3.2, 0);
    const canopyMesh = new THREE.InstancedMesh(canopyGeo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), city.trees.length);
    canopyMesh.castShadow = true;
    city.trees.forEach((t, i) => {
      p.set(t.x, 0, t.z);
      s.set(t.s, t.s, t.s);
      m4.compose(p, q, s);
      trunkMesh.setMatrixAt(i, m4);
      canopyMesh.setMatrixAt(i, m4);
      canopyMesh.setColorAt(i, col.setHSL(0.29 + (i % 5) * 0.015, 0.5, 0.32 + (i % 3) * 0.05));
    });
    trunkMesh.instanceMatrix.needsUpdate = true;
    canopyMesh.instanceMatrix.needsUpdate = true;
    if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true;
    this.scene.add(trunkMesh);
    this.scene.add(canopyMesh);

    // Lamps: poles + glowing heads.
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 4.6, 5);
    poleGeo.translate(0, 2.3, 0);
    const poleMesh = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: '#2c2f36' }), city.lamps.length);
    city.lamps.forEach((l, i) => {
      p.set(l.x, 0, l.z);
      s.set(1, 1, 1);
      m4.compose(p, q, s);
      poleMesh.setMatrixAt(i, m4);
    });
    poleMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(poleMesh);
    const headGeo = new THREE.SphereGeometry(0.28, 8, 6);
    headGeo.translate(0, 4.7, 0);
    this.lampMat = new THREE.MeshBasicMaterial({ color: '#666666' });
    const headMesh = new THREE.InstancedMesh(headGeo, this.lampMat, city.lamps.length);
    city.lamps.forEach((l, i) => {
      p.set(l.x, 0, l.z);
      s.set(1, 1, 1);
      m4.compose(p, q, s);
      headMesh.setMatrixAt(i, m4);
    });
    headMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(headMesh);

    // Sun coins (instanced gold cylinders, spun per frame).
    const coinGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.18, 16);
    this.coinMesh = new THREE.InstancedMesh(coinGeo, new THREE.MeshLambertMaterial({ color: '#ffd700', emissive: '#664400' }), city.coins.length);
    this.scene.add(this.coinMesh);

    // Pier (planks on posts) + lighthouse + fountain.
    const pierParts = [];
    for (let i = 0; i < 10; i++) {
      boxPart(pierParts, 8, 0.3, 3.4, LANDMARKS.pier.x, 0.6, 500 + i * 3.4, '#8a6b4a');
    }
    boxPart(pierParts, 1, 2.5, 1, LANDMARKS.pier.x - 3.5, 1.2, 516, '#6b4a2f');
    boxPart(pierParts, 1, 2.5, 1, LANDMARKS.pier.x + 3.5, 1.2, 516, '#6b4a2f');
    const pier = new THREE.Mesh(mergeGeometries(pierParts), this.lambert);
    pier.castShadow = true;
    this.scene.add(pier);
    const lhParts = [];
    boxPart(lhParts, 6, 2, 6, LANDMARKS.lighthouse.x, 1, LANDMARKS.lighthouse.z, '#dfe3e6');
    const lhBase = new THREE.Mesh(mergeGeometries(lhParts), this.lambert);
    this.scene.add(lhBase);
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 2.8, 18, 10),
      new THREE.MeshLambertMaterial({ color: '#e8e2d0' }),
    );
    tower.position.set(LANDMARKS.lighthouse.x, 11, LANDMARKS.lighthouse.z);
    tower.castShadow = true;
    this.scene.add(tower);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 10, 8),
      new THREE.MeshBasicMaterial({ color: '#fff2a0' }),
    );
    lamp.position.set(LANDMARKS.lighthouse.x, 20.5, LANDMARKS.lighthouse.z);
    this.scene.add(lamp);
    const beamGeo = new THREE.ConeGeometry(6, 40, 12, 1, true);
    beamGeo.translate(0, 20, 0);
    beamGeo.rotateX(Math.PI / 2);
    this.lighthouseBeam = new THREE.Mesh(
      beamGeo,
      new THREE.MeshBasicMaterial({ color: '#fff2a0', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.lighthouseBeam.position.set(LANDMARKS.lighthouse.x, 20.5, LANDMARKS.lighthouse.z);
    this.scene.add(this.lighthouseBeam);
    const fountain = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 4.4, 1, 16),
      new THREE.MeshLambertMaterial({ color: '#9fb3c8' }),
    );
    fountain.position.set(LANDMARKS.plaza.x, 0.5, LANDMARKS.plaza.z + 10);
    this.scene.add(fountain);
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(3.4, 3.4, 0.3, 16),
      new THREE.MeshLambertMaterial({ color: '#3fa7d6' }),
    );
    water.position.set(LANDMARKS.plaza.x, 1.1, LANDMARKS.plaza.z + 10);
    this.scene.add(water);

    // Wheels: one instanced cylinder for every car slot.
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    this.wheelMesh = new THREE.InstancedMesh(wheelGeo, new THREE.MeshLambertMaterial({ color: '#14161a' }), this.maxCars * 4);
    this.wheelMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.wheelMesh);

    // Particles: one Points pool.
    const PMAX = 500;
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PMAX * 3), 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(PMAX * 3), 3));
    this.particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
    this.pMax = PMAX;

    // Rain: line segments falling around the camera.
    const RMAX = 320;
    const rGeo = new THREE.BufferGeometry();
    rGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RMAX * 6), 3));
    this.rain = new THREE.LineSegments(rGeo, new THREE.LineBasicMaterial({ color: '#a8c4de', transparent: true, opacity: 0.45 }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);
    this.rainDrops = [];
    for (let i = 0; i < RMAX; i++) {
      this.rainDrops.push({ x: 0, y: -10, z: 0, v: 38 + Math.random() * 10 });
    }

    // Skid marks: instanced dark quads, ring buffer.
    const skidGeo = new THREE.PlaneGeometry(1, 1);
    skidGeo.rotateX(-Math.PI / 2);
    this.skidMesh = new THREE.InstancedMesh(skidGeo, new THREE.MeshBasicMaterial({ color: '#111214', transparent: true, opacity: 0.55, depthWrite: false }), 240);
    this.skidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.skidMesh.count = 0;
    this.scene.add(this.skidMesh);

    // Tracers: a small pool of stretched boxes.
    for (let i = 0; i < 16; i++) {
      const t = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.07, 1),
        new THREE.MeshBasicMaterial({ color: '#ffe9a0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      t.visible = false;
      this.scene.add(t);
      this.tracers.push(t);
    }

    // Helicopter.
    const heli = new THREE.Group();
    const hParts = [];
    boxPart(hParts, 2.4, 1.6, 4.2, 0, 0, 0, '#1c2733');
    boxPart(hParts, 1.2, 0.8, 3.2, 0, -0.2, -3.4, '#1c2733');
    boxPart(hParts, 2.0, 0.7, 1.6, 0, 0.9, 0.6, '#0e1420');
    const hBody = new THREE.Mesh(mergeGeometries(hParts), this.lambert);
    hBody.castShadow = true;
    heli.add(hBody);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: '#22262e' }));
    rotor.position.y = 1.1;
    heli.add(rotor);
    this.heliRotor = rotor;
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.4), new THREE.MeshLambertMaterial({ color: '#22262e' }));
    tailRotor.position.set(0.7, 0, -4.6);
    heli.add(tailRotor);
    // Light bar.
    const barR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.3), new THREE.MeshBasicMaterial({ color: '#ff2222' }));
    barR.position.set(-0.6, 1.0, 0.6);
    heli.add(barR);
    const barB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.3), new THREE.MeshBasicMaterial({ color: '#2244ff' }));
    barB.position.set(0.6, 1.0, 0.6);
    heli.add(barB);
    this.heliBarR = barR;
    this.heliBarB = barB;
    // Searchlight cone (apex at the heli, pointing down).
    const coneGeo = new THREE.ConeGeometry(7, 45, 16, 1, true);
    coneGeo.translate(0, -22.5, 0);
    this.heliCone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: '#fff8c0', transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
    this.heliCone.visible = false;
    heli.add(this.heliCone);
    heli.visible = false;
    this.scene.add(heli);
    this.heliGroup = heli;
    // Ground light disc under the searchlight.
    this.heliDisc = new THREE.Mesh(
      new THREE.CircleGeometry(6, 20),
      new THREE.MeshBasicMaterial({ color: '#fff8c0', transparent: true, opacity: 0.25, depthWrite: false }),
    );
    this.heliDisc.rotation.x = -Math.PI / 2;
    this.heliDisc.visible = false;
    this.scene.add(this.heliDisc);

    // Objective marker: ring + light pillar + bobbing diamond.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.15, 32),
      new THREE.MeshBasicMaterial({ color: '#ffd700', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    this.markerGroup.add(ring);
    this.markerRing = ring;
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 40, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ffd700', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
    );
    pillar.position.y = 20;
    this.markerGroup.add(pillar);
    this.markerPillar = pillar;
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.1),
      new THREE.MeshBasicMaterial({ color: '#ffd700' }),
    );
    diamond.position.y = 6;
    this.markerGroup.add(diamond);
    this.markerDiamond = diamond;
    this.checkpointMeshes = [];
  }

  // ---- dynamic object sync ----

  getCarMesh(car) {
    let mesh = this.carMeshes.get(car);
    if (!mesh) {
      const geo = buildCarGeometry(car.model);
      mesh = new THREE.Mesh(geo, this.carMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      // Police light bar: two small flashing boxes on the roof.
      if (car.police) {
        const barR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: '#ff2222' }));
        barR.position.set(-0.55, 1.22, 0);
        mesh.add(barR);
        const barB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: '#2244ff' }));
        barB.position.set(0.55, 1.22, 0);
        mesh.add(barB);
        car._barR = barR;
        car._barB = barB;
      }
      this.scene.add(mesh);
      this.carMeshes.set(car, mesh);
    }
    return mesh;
  }

  removeCarMesh(car) {
    const mesh = this.carMeshes.get(car);
    if (mesh) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      this.carMeshes.delete(car);
    }
  }

  getCharMesh(who) {
    let mesh = this.charMeshes.get(who);
    if (!mesh) {
      const geo = buildCharacterGeometry(who.shirt, who.pants, who.skin);
      mesh = new THREE.Mesh(geo, this.lambert);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.charMeshes.set(who, mesh);
    }
    return mesh;
  }

  removeCharMesh(who) {
    const mesh = this.charMeshes.get(who);
    if (mesh) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      this.charMeshes.delete(who);
    }
  }

  setCheckpointMeshes(checkpoints) {
    for (const m of this.checkpointMeshes) this.scene.remove(m);
    this.checkpointMeshes = [];
    if (!checkpoints) return;
    for (const cp of checkpoints) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(cp.radius * 0.8, cp.radius, 32),
        new THREE.MeshBasicMaterial({ color: cp.hit ? '#2ecc71' : '#00cec9', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(cp.x, 0.15, cp.z);
      this.scene.add(ring);
      this.checkpointMeshes.push(ring);
    }
  }

  /** Push a skid segment into the ring buffer. */
  addSkid(x0, z0, x1, z1, w) {
    const i = this.skidIdx % 240;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const len = Math.hypot(x1 - x0, z1 - z0) + 0.4;
    m4.compose(new THREE.Vector3((x0 + x1) / 2, 0.06, (z0 + z1) / 2), q, new THREE.Vector3(w, 1, len));
    this.skidMesh.setMatrixAt(i, m4);
    this.skidMesh.instanceMatrix.needsUpdate = true;
    this.skidMesh.count = Math.min(240, this.skidIdx + 1);
    this.skidIdx++;
  }

  // ---- per-frame sync ----

  sync(state, dt, time) {
    const city = this.city;
    const player = state.player;

    // Cars.
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    let wheelIdx = 0;
    const seenCars = new Set();
    for (const car of state.cars) {
      seenCars.add(car);
      const mesh = this.getCarMesh(car);
      mesh.position.set(car.x, 0, car.z);
      mesh.rotation.y = car.yaw;
      // Visual pitch/roll from acceleration and slide.
      const pitch = clamp(-car.vF * 0.0012 + (car.accelVis || 0) * 0.02, -0.06, 0.06);
      const roll = clamp(-car.vL * 0.006, -0.09, 0.09);
      mesh.rotation.x = pitch;
      mesh.rotation.z = roll;
      // Burnt cars go charcoal.
      if (car.state === 'wreck' || car.state === 'burning') {
        mesh.material = mesh.material; // shared material; tint via scale of damage is skipped
      }
      // Police light bar flash.
      if (car._barR) {
        const flash = Math.floor(time * 6) % 2 === 0;
        car._barR.visible = flash;
        car._barB.visible = !flash;
      }
      // Wheels (instanced): 4 per car.
      const fx = Math.sin(car.yaw);
      const fz = Math.cos(car.yaw);
      const rx = -fz;
      const rz = fx;
      const halfLen = car.model.len * 0.32;
      const halfWid = car.model.wid / 2 - 0.05;
      const spin = (car.wheelSpin || 0);
      const steerYaw = car.steer || 0;
      const wheels = [
        { x: car.x + fx * halfLen + rx * halfWid, z: car.z + fz * halfLen + rz * halfWid, steer: true },
        { x: car.x + fx * halfLen - rx * halfWid, z: car.z + fz * halfLen - rz * halfWid, steer: true },
        { x: car.x - fx * halfLen + rx * halfWid, z: car.z - fz * halfLen + rz * halfWid, steer: false },
        { x: car.x - fx * halfLen - rx * halfWid, z: car.z - fz * halfLen - rz * halfWid, steer: false },
      ];
      for (const w of wheels) {
        if (wheelIdx >= this.maxCars * 4) break;
        const e = new THREE.Euler(spin, car.yaw + (w.steer ? steerYaw : 0), 0, 'YXZ');
        q.setFromEuler(e);
        p.set(w.x, 0.34, w.z);
        m4.compose(p, q, s);
        this.wheelMesh.setMatrixAt(wheelIdx, m4);
        wheelIdx++;
      }
    }
    // Hide unused wheel slots.
    for (let i = wheelIdx; i < this.maxCars * 4; i++) {
      p.set(0, -10, 0);
      q.identity();
      m4.compose(p, q, s);
      this.wheelMesh.setMatrixAt(i, m4);
    }
    this.wheelMesh.instanceMatrix.needsUpdate = true;
    for (const [car, mesh] of this.carMeshes) {
      if (!seenCars.has(car)) this.removeCarMesh(car);
    }

    // Player character.
    if (player.onFoot) {
      const pm = state.playerMesh;
      pm.visible = true;
      pm.position.set(player.x, 0, player.z);
      pm.rotation.y = player.yaw;
      const phase = player.walkPhase || 0;
      const swing = player.moving ? Math.sin(phase) * 0.5 : 0;
      state.playerLegL.rotation.x = swing;
      state.playerLegR.rotation.x = -swing;
      state.playerTorso.rotation.x = player.moving ? 0.08 : 0;
      pm.position.y = player.moving ? Math.abs(Math.sin(phase)) * 0.06 : 0;
    } else if (state.playerMesh) {
      state.playerMesh.visible = false;
    }

    // Peds + goons.
    const seenChars = new Set();
    for (const ped of [...state.peds, ...state.goons]) {
      if (ped.state === 'dead') continue;
      seenChars.add(ped);
      const mesh = this.getCharMesh(ped);
      mesh.position.set(ped.x, ped.moving ? Math.abs(Math.sin((ped.walkPhase || 0))) * 0.05 : 0, ped.z);
      mesh.rotation.y = ped.yaw;
    }
    for (const [who, mesh] of this.charMeshes) {
      if (!seenChars.has(who)) this.removeCharMesh(who);
    }

    // Coins spin.
    if (this.coinMesh && city) {
      city.coins.forEach((c, i) => {
        if (c.taken) {
          p.set(0, -10, 0);
        } else {
          p.set(c.x, 1 + Math.sin(time * 2 + i) * 0.15, c.z);
        }
        q.setFromEuler(new THREE.Euler(0, time * 2 + i, 0));
        s.set(1, 1, 1);
        m4.compose(p, q, s);
        this.coinMesh.setMatrixAt(i, m4);
      });
      this.coinMesh.instanceMatrix.needsUpdate = true;
    }

    // Helicopter.
    if (state.heli && state.heli.active) {
      const h = state.heli;
      this.heliGroup.visible = true;
      this.heliGroup.position.set(h.x, h.y, h.z);
      this.heliGroup.rotation.y = h.yaw;
      this.heliRotor.rotation.y = time * 22;
      const flash = Math.floor(time * 6) % 2 === 0;
      this.heliBarR.visible = flash;
      this.heliBarB.visible = !flash;
      const searching = h.mode === 'search';
      this.heliCone.visible = true;
      this.heliCone.rotation.z = searching ? Math.sin(time * 0.9) * 0.35 : 0;
      this.heliCone.rotation.x = searching ? Math.cos(time * 0.7) * 0.25 : 0;
      this.heliDisc.visible = true;
      this.heliDisc.position.set(h.lightX || h.x, 0.12, h.lightZ || h.z);
      const ls = 1 + Math.sin(time * 3) * 0.08;
      this.heliDisc.scale.set(ls, ls, 1);
    } else {
      this.heliGroup.visible = false;
      this.heliDisc.visible = false;
    }

    // Particles.
    const posAttr = this.particles.geometry.attributes.position;
    const colAttr = this.particles.geometry.attributes.color;
    const pos = posAttr.array;
    const col = colAttr.array;
    const tmpCol = new THREE.Color();
    for (let i = 0; i < this.pMax; i++) {
      const pt = state.particles[i];
      if (pt && pt.life > 0) {
        pos[i * 3] = pt.x;
        pos[i * 3 + 1] = pt.y;
        pos[i * 3 + 2] = pt.z;
        tmpCol.set(pt.color);
        const fade = clamp(pt.life / pt.maxLife, 0, 1);
        col[i * 3] = tmpCol.r * fade;
        col[i * 3 + 1] = tmpCol.g * fade;
        col[i * 3 + 2] = tmpCol.b * fade;
      } else {
        pos[i * 3 + 1] = -50;
        col[i * 3] = 0;
        col[i * 3 + 1] = 0;
        col[i * 3 + 2] = 0;
      }
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    // Tracers.
    for (let i = 0; i < this.tracers.length; i++) {
      const t = this.tracers[i];
      const tr = state.tracers[i];
      if (tr && tr.life > 0) {
        const dx = tr.x1 - tr.x0;
        const dy = tr.y1 - tr.y0;
        const dz = tr.z1 - tr.z0;
        const len = Math.hypot(dx, dy, dz);
        t.visible = true;
        t.position.set((tr.x0 + tr.x1) / 2, (tr.y0 + tr.y1) / 2, (tr.z0 + tr.z1) / 2);
        t.lookAt(tr.x1, tr.y1, tr.z1);
        t.scale.set(1, 1, Math.max(0.1, len));
        t.material.opacity = clamp(tr.life / 0.12, 0, 1) * 0.9;
      } else {
        t.visible = false;
      }
    }

    // Rain.
    const raining = state.weather === 'rain' || state.weather === 'storm';
    this.rain.visible = raining;
    if (raining) {
      const rPos = this.rain.geometry.attributes.position.array;
      const cx = player.x;
      const cz = player.z;
      for (let i = 0; i < this.rainDrops.length; i++) {
        const d = this.rainDrops[i];
        d.y -= d.v * dt;
        if (d.y < 0) {
          d.x = cx + (Math.random() - 0.5) * 120;
          d.z = cz + (Math.random() - 0.5) * 120;
          d.y = 25 + Math.random() * 15;
        }
        rPos[i * 6] = d.x;
        rPos[i * 6 + 1] = d.y;
        rPos[i * 6 + 2] = d.z;
        rPos[i * 6 + 3] = d.x;
        rPos[i * 6 + 4] = d.y - 1.6;
        rPos[i * 6 + 5] = d.z;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }

    // Objective marker.
    if (state.marker && state.marker.active) {
      this.markerGroup.visible = true;
      this.markerGroup.position.set(state.marker.x, 0, state.marker.z);
      const r = state.marker.radius || 10;
      this.markerRing.scale.set(r, r, 1);
      this.markerDiamond.position.y = 6 + Math.sin(time * 2.5) * 0.8;
      this.markerDiamond.rotation.y = time * 1.5;
      const mc = new THREE.Color(state.marker.color || '#ffd700');
      this.markerRing.material.color.copy(mc);
      this.markerPillar.material.color.copy(mc);
      this.markerDiamond.material.color.copy(mc);
    } else {
      this.markerGroup.visible = false;
    }

    // Lighthouse beam rotates at night.
    if (this.lighthouseBeam) {
      this.lighthouseBeam.rotation.y = time * 0.4;
      this.lighthouseBeam.material.opacity = state.nightFactor > 0.4 ? 0.14 : 0.05;
    }

    this.updateLighting(state, dt);
    this.updateCamera(state, dt);
    this.drawMinimap(state);
    this.renderer.render(this.scene, this.camera);
  }

  updateLighting(state, dt) {
    const minutes = state.clockMinutes;
    // Sun elevation: 1 at noon (720), 0 at 06:00/18:00, negative at night.
    const sunElev = Math.sin(((minutes - 360) / 720) * Math.PI);
    const dayFactor = clamp(sunElev * 2.2 + 0.18, 0, 1);
    const nightFactor = 1 - dayFactor;
    state.nightFactor = nightFactor;
    // Sun azimuth: east at dawn, west at dusk.
    const az = ((minutes - 360) / 720) * Math.PI; // 0 dawn, PI dusk
    const sunDir = new THREE.Vector3(Math.cos(az), Math.max(0.08, sunElev), 0.35);
    sunDir.normalize();
    const px = state.player.x;
    const pz = state.player.z;
    this.sun.position.set(px + sunDir.x * 160, sunDir.y * 160 + 20, pz + sunDir.z * 160);
    this.sun.target.position.set(px, 0, pz);
    const lowSun = clamp(1 - Math.abs(sunElev) * 2.5, 0, 1);
    const sunCol = new THREE.Color('#ffdcae').lerp(new THREE.Color('#ff8a4c'), lowSun * 0.7);
    this.sun.color.copy(sunCol);
    let sunI = 2.6 * dayFactor + 0.12;
    if (state.lightning > 0) sunI += state.lightning * 3;
    this.sun.intensity = sunI;
    this.hemi.intensity = 0.3 + 0.75 * dayFactor + (state.lightning > 0 ? state.lightning * 1.5 : 0);
    // Sky: day blue, dusk orange, night deep blue.
    const daySky = new THREE.Color('#87b5e0');
    const duskSky = new THREE.Color('#ff9a5c');
    const nightSky = new THREE.Color('#0b1026');
    const sky = nightSky.clone().lerp(daySky, dayFactor).lerp(duskSky, lowSun * 0.55 * dayFactor);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky).lerp(new THREE.Color('#ffffff'), 0.08);
    // Windows glow at night; neon brightens at night.
    if (this.windowMat) {
      const c = new THREE.Color('#1a2233').lerp(new THREE.Color('#ffffff'), nightFactor);
      this.windowMat.color.copy(c);
    }
    if (this.neonMat) {
      const c = new THREE.Color('#ffffff').multiplyScalar(0.45 + 0.55 * nightFactor);
      this.neonMat.color.copy(c);
    }
    if (this.lampMat) {
      const c = new THREE.Color('#555a60').lerp(new THREE.Color('#ffd27a'), nightFactor);
      this.lampMat.color.copy(c);
    }
  }

  updateCamera(state, dt) {
    const player = state.player;
    const inCar = !player.onFoot && player.car;
    const speed = inCar ? Math.abs(player.car.vF || 0) : (player.speed || 0);
    const maxSpeed = inCar ? 42 * player.car.model.maxSpeed : 6;
    const speedRatio = clamp(speed / maxSpeed, 0, 1);
    const yaw = player.yaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    // Chase spring: distance grows with speed, camera trails behind.
    const dist = inCar ? 9 + 0.06 * speed : 6.5;
    const height = inCar ? 3.6 : 2.8;
    const lookAhead = inCar ? 6 + 0.25 * speed : 3;
    const tx = player.x;
    const tz = player.z;
    const desiredX = tx - fx * dist;
    const desiredZ = tz - fz * dist;
    const desiredY = height;
    const stiff = inCar ? 3.4 : 5;
    const k = 1 - Math.exp(-stiff * dt);
    this.camPos.x += (desiredX - this.camPos.x) * k;
    this.camPos.y += (desiredY - this.camPos.y) * k;
    this.camPos.z += (desiredZ - this.camPos.z) * k;
    // Keep the camera out of buildings: push out horizontally, then lift.
    if (this.city) {
      for (const b of this.city.buildings) {
        const hw = b.w / 2 + 0.6;
        const hd = b.d / 2 + 0.6;
        if (this.camPos.x > b.x - hw && this.camPos.x < b.x + hw &&
            this.camPos.z > b.z - hd && this.camPos.z < b.z + hd &&
            this.camPos.y < b.h + 1) {
          const dxl = this.camPos.x - (b.x - hw);
          const dxr = (b.x + hw) - this.camPos.x;
          const dzl = this.camPos.z - (b.z - hd);
          const dzr = (b.z + hd) - this.camPos.z;
          const m = Math.min(dxl, dxr, dzl, dzr);
          if (m === dxl) this.camPos.x = b.x - hw;
          else if (m === dxr) this.camPos.x = b.x + hw;
          else if (m === dzl) this.camPos.z = b.z - hd;
          else this.camPos.z = b.z + hd;
          this.camPos.y = Math.max(this.camPos.y, 2.2);
        }
      }
    }
    const lookX = tx + fx * lookAhead;
    const lookZ = tz + fz * lookAhead;
    const lk = 1 - Math.exp(-8 * dt);
    this.camLook.x += (lookX - this.camLook.x) * lk;
    this.camLook.y += (1.4 - this.camLook.y) * lk;
    this.camLook.z += (lookZ - this.camLook.z) * lk;
    // Screen shake.
    this.shake = Math.max(0, (state.camShake || 0) - dt * 2.2);
    state.camShake = this.shake;
    const sh = this.shake * this.shake * 0.6;
    const shx = (Math.random() - 0.5) * sh;
    const shy = (Math.random() - 0.5) * sh * 0.6;
    this.camera.position.set(this.camPos.x + shx, this.camPos.y + shy, this.camPos.z);
    this.camera.lookAt(this.camLook.x + shx, this.camLook.y + shy, this.camLook.z);
    const targetFov = 60 + speedRatio * 18;
    this.camFov += (targetFov - this.camFov) * (1 - Math.exp(-3 * dt));
    if (Math.abs(this.camera.fov - this.camFov) > 0.05) {
      this.camera.fov = this.camFov;
      this.camera.updateProjectionMatrix();
    }
    // Expose for the HUD / debug hooks.
    state.cameraFov = this.camFov;
    state.cameraZoom = dist;
  }

  drawMinimap(state) {
    const cv = this.minimap;
    if (!cv) return;
    const g = cv.getContext('2d');
    const S = cv.width;
    const cx = S / 2;
    const cy = S / 2;
    const player = state.player;
    const range = 130; // metres visible across the minimap
    const scale = S / range;
    g.clearRect(0, 0, S, S);
    g.save();
    // Circular clip.
    g.beginPath();
    g.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#10131c';
    g.fillRect(0, 0, S, S);
    g.translate(cx, cy);
    g.rotate(player.yaw + Math.PI); // heading up
    const px = player.x;
    const pz = player.z;
    // Ground texture.
    if (this.groundCanvas) {
      g.drawImage(this.groundCanvas, -px * scale, -pz * scale, WORLD_SIZE * scale, WORLD_SIZE * scale);
    }
    // GPS route to the active objective.
    if (state.gpsRoute && state.gpsRoute.length > 1) {
      g.strokeStyle = '#ffd700';
      g.lineWidth = 3;
      g.lineJoin = 'round';
      g.beginPath();
      state.gpsRoute.forEach((pt, i) => {
        const x = (pt.x - px) * scale;
        const y = (pt.z - pz) * scale;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.stroke();
    }
    // Search circle (when escaping).
    if (state.wantedState === 'escaping' && state.lastSeen) {
      g.strokeStyle = 'rgba(255,60,60,0.9)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc((state.lastSeen.x - px) * scale, (state.lastSeen.z - pz) * scale, 55 * scale, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = 'rgba(255,60,60,0.15)';
      g.fill();
    }
    // Checkpoints.
    if (state.checkpoints) {
      for (const cp of state.checkpoints) {
        g.fillStyle = cp.hit ? '#2ecc71' : '#00cec9';
        g.beginPath();
        g.arc((cp.x - px) * scale, (cp.z - pz) * scale, 5, 0, Math.PI * 2);
        g.fill();
      }
    }
    // Objective marker.
    if (state.marker && state.marker.active) {
      g.fillStyle = '#ffd700';
      g.save();
      g.translate((state.marker.x - px) * scale, (state.marker.z - pz) * scale);
      g.rotate(-player.yaw - Math.PI + Math.PI / 4);
      g.fillRect(-5, -5, 10, 10);
      g.restore();
    }
    // Money van.
    if (state.van && state.van.active) {
      g.fillStyle = '#2ecc71';
      g.font = 'bold 13px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('$', (state.van.x - px) * scale, (state.van.z - pz) * scale);
    }
    // Police (blue dots, flashing red while chasing).
    const flash = Math.floor(performance.now() / 300) % 2 === 0;
    for (const car of state.cars) {
      if (!car.police) continue;
      g.fillStyle = state.wantedStars > 0 && flash ? '#ff4444' : '#4488ff';
      g.beginPath();
      g.arc((car.x - px) * scale, (car.z - pz) * scale, 3.5, 0, Math.PI * 2);
      g.fill();
    }
    // Heli.
    if (state.heli && state.heli.active) {
      g.fillStyle = '#ffffff';
      g.font = 'bold 12px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('H', (state.heli.x - px) * scale, (state.heli.z - pz) * scale);
    }
    g.restore();
    // Player arrow (centre, heading up).
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#111111';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(cx, cy - 8);
    g.lineTo(cx + 5.5, cy + 6);
    g.lineTo(cx, cy + 2.5);
    g.lineTo(cx - 5.5, cy + 6);
    g.closePath();
    g.fill();
    g.stroke();
    // Rim.
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    g.stroke();
  }
}
