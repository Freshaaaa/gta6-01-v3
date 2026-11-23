// Solmar Bay 3D — the city (v5 luxury rebuild, written from the brief).
// Builds the whole world: golden-hour sky, sun + clouds, grid city with
// varied facades, luxury hotel tower, storefronts + neon, palms, lamps,
// planters, beach resort + pier, ocean, distant skyline, birds, haze.
// Uses cheap Lambert/Basic materials + canvas textures (fast under SwiftShader).
// No real shadow maps — blob shadows live on the cars (vehicles.js).

import * as THREE from '../vendor/three.module.min.js';
import { PITCH, STREETS, ROAD_HALF, WALK_HALF, CITY_EDGE, BEACH_START, BEACH_END, OCEAN_END, FACADES, ROOF_COLORS, AWNING_COLORS, NEON_COLORS, SKY, SUN, ASPHALT, SAND, SAND_LIGHT, OCEAN, FOAM } from './config.js';
import { makeRng, pick, range, rangeInt, clamp } from './util.js';

// --- canvas texture helpers -------------------------------------------------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Facade texture: base colour + window grid (some lit warm, some dark).
// Variants differ in lit ratio + grid density. Shared across buildings.
function facadeTexture(base, litRatio, cols, rows) {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    // subtle vertical grime strips
    g.fillStyle = 'rgba(0,0,0,0.06)';
    for (let i = 0; i < 8; i++) g.fillRect(i * 32 + 8, 0, 5, 256);
    const cw = 256 / cols, ch = 256 / rows;
    const rng = makeRng(base.length * 7919 + cols * 131 + rows * 17);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw + cw * 0.22, y = r * ch + ch * 0.2;
        const w = cw * 0.56, h = ch * 0.58;
        const lit = rng() < litRatio;
        // window frame
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x - 2, y - 2, w + 4, h + 4);
        g.fillStyle = lit ? (rng() < 0.75 ? '#ffd88a' : '#cfe8ff') : '#2a323e';
        g.fillRect(x, y, w, h);
        // mullion cross
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(x + w / 2 - 1, y, 2, h);
        g.fillRect(x, y + h / 2 - 1, w, 2);
      }
    }
  });
}

// Road texture tile (52 long x 16 wide): asphalt, edge lines, dashed centre,
// crosswalk band at one end (repeats every block = every intersection).
function roadTexture() {
  return canvasTex(256, 128, (g) => {
    g.fillStyle = '#9a938a'; g.fillRect(0, 0, 256, 128);
    // asphalt speckle
    const rng = makeRng(42);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)';
      g.fillRect(rng() * 256, rng() * 128, 2, 2);
    }
    // edge lines
    g.fillStyle = '#e8e4da';
    g.fillRect(0, 4, 256, 3); g.fillRect(0, 121, 256, 3);
    // dashed centre line (pale yellow)
    g.fillStyle = '#e8d878';
    for (let x = 0; x < 256; x += 32) g.fillRect(x, 62, 18, 4);
    // crosswalk band at the tile start (white bars across the road)
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let y = 10; y < 120; y += 16) g.fillRect(2, y, 14, 8);
  });
}

// Sky gradient texture (vertical): orange horizon -> magenta -> dusky blue.
function skyTexture() {
  return canvasTex(16, 512, (g) => {
    const grad = g.createLinearGradient(0, 512, 0, 0);
    grad.addColorStop(0.0, SKY.horizon);
    grad.addColorStop(0.35, '#f07a5a');
    grad.addColorStop(0.55, SKY.mid);
    grad.addColorStop(0.8, '#6a5a8a');
    grad.addColorStop(1.0, SKY.top);
    g.fillStyle = grad; g.fillRect(0, 0, 16, 512);
  });
}

// Sand texture: two-tone gradient (lighter near the water).
function sandTexture() {
  return canvasTex(256, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    // addColorStop needs a CSS string, not the numeric hex in config.
    grad.addColorStop(0, '#' + SAND_LIGHT.toString(16).padStart(6, '0'));
    grad.addColorStop(1, '#' + SAND.toString(16).padStart(6, '0'));
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    const rng = makeRng(7);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)';
      g.fillRect(rng() * 256, rng() * 256, 2, 2);
    }
  });
}

// --- shared materials / geometries (reused, cheap) --------------------------
function lam(color) { return new THREE.MeshLambertMaterial({ color }); }
function basic(color, opts = {}) { return new THREE.MeshBasicMaterial({ color, ...opts }); }

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
const CONE = new THREE.ConeGeometry(1, 1, 8);
const SPHERE = new THREE.SphereGeometry(1, 10, 8);
const PLANE = new THREE.PlaneGeometry(1, 1);

function box(mat, w, h, d, x, y, z, ry = 0) {
  const m = new THREE.Mesh(BOX, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  return m;
}

// --- sky --------------------------------------------------------------------
function buildSky(scene, rng) {
  const group = new THREE.Group();
  // Gradient dome.
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), skyMat);
  dome.position.y = 0;
  group.add(dome);
  // Sun disc (bigger in v5) + glow halo.
  const sunDir = new THREE.Vector3(SUN.position[0], SUN.position[1], SUN.position[2]).normalize();
  const sunPos = sunDir.clone().multiplyScalar(820);
  const sunMat = basic(0xfff3c8, { fog: false });
  const sun = new THREE.Mesh(new THREE.CircleGeometry(34, 32), sunMat);
  sun.position.copy(sunPos);
  sun.lookAt(0, 0, 0);
  group.add(sun);
  const haloMat = basic(0xffc86a, { fog: false, transparent: true, opacity: 0.35 });
  const halo = new THREE.Mesh(new THREE.CircleGeometry(74, 32), haloMat);
  halo.position.copy(sunPos).multiplyScalar(0.999);
  halo.lookAt(0, 0, 0);
  group.add(halo);
  // Clouds: 6-8 soft white/pink puffs, slow drift (animated).
  const clouds = [];
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffe0e8, emissive: 0x802040, emissiveIntensity: 0.25 });
  const cloudMat2 = new THREE.MeshLambertMaterial({ color: 0xfff0f0, emissive: 0x603050, emissiveIntensity: 0.2 });
  for (let i = 0; i < 8; i++) {
    const c = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 3);
    for (let j = 0; j < puffs; j++) {
      const p = new THREE.Mesh(SPHERE, rng() < 0.5 ? cloudMat : cloudMat2);
      p.scale.set(range(rng, 14, 26), range(rng, 5, 9), range(rng, 10, 16));
      p.position.set(j * 14 - puffs * 7 + range(rng, -4, 4), range(rng, -2, 3), range(rng, -6, 6));
      c.add(p);
    }
    c.position.set(range(rng, -600, 600), range(rng, 120, 260), range(rng, -500, 500));
    c.userData.drift = range(rng, 0.4, 1.1);
    clouds.push(c);
    group.add(c);
  }
  // Warm haze band at the horizon (wide, low, translucent orange).
  const haze = new THREE.Mesh(
    new THREE.CylinderGeometry(780, 780, 46, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff9a4a, transparent: true, opacity: 0.16, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  haze.position.y = 12;
  group.add(haze);
  // Distant skyline silhouette across the bay (dark purple-grey, low).
  const skyMat2 = lam(0x5a4a68);
  for (let i = 0; i < 12; i++) {
    const w = range(rng, 18, 42), h = range(rng, 22, 70);
    const b = box(skyMat2, w, h, 14, -420 + i * 76 + range(rng, -12, 12), h / 2 - 4, 400 + range(rng, -14, 14));
    group.add(b);
  }
  // Birds: 3 small dark V shapes, drifting (animated).
  const birds = [];
  const birdMat = basic(0x2a2430, { fog: false });
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Group();
    const w1 = box(birdMat, 2.4, 0.18, 0.5, -1.1, 0, 0); w1.rotation.z = 0.5;
    const w2 = box(birdMat, 2.4, 0.18, 0.5, 1.1, 0, 0); w2.rotation.z = -0.5;
    b.add(w1); b.add(w2);
    b.position.set(range(rng, -200, 200), range(rng, 90, 150), range(rng, 100, 320));
    b.userData.speed = range(rng, 1.5, 3);
    birds.push(b);
    group.add(b);
  }
  scene.add(group);
  return { clouds, birds };
}

// --- ground / roads / blocks -------------------------------------------------
function buildGround(scene) {
  const group = new THREE.Group();
  // Base earth (dark, under everything).
  const earth = new THREE.Mesh(PLANE, lam(0x6a6258));
  earth.rotation.x = -Math.PI / 2;
  earth.scale.set(1200, 1200, 1);
  earth.position.set(0, -0.05, 60);
  group.add(earth);
  // Roads: asphalt texture planes, one per street (both directions).
  const rTex = roadTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: rTex });
  const roadLen = CITY_EDGE * 2 + 52; // -208..208
  for (const s of STREETS) {
    // North-south road (along z).
    const ns = new THREE.Mesh(PLANE, roadMat);
    ns.rotation.x = -Math.PI / 2;
    ns.rotation.z = Math.PI / 2;
    ns.scale.set(roadLen, ROAD_HALF * 2, 1);
    ns.position.set(s, 0.02, 0);
    // repeat the tile along the length
    const t1 = rTex.clone(); t1.needsUpdate = true; t1.repeat.set(roadLen / PITCH, 1);
    ns.material = new THREE.MeshLambertMaterial({ map: t1 });
    group.add(ns);
    // East-west road (along x).
    const ew = new THREE.Mesh(PLANE, roadMat);
    ew.rotation.x = -Math.PI / 2;
    ew.scale.set(roadLen, ROAD_HALF * 2, 1);
    ew.position.set(0, 0.02, s);
    const t2 = rTex.clone(); t2.needsUpdate = true; t2.repeat.set(roadLen / PITCH, 1);
    ew.material = new THREE.MeshLambertMaterial({ map: t2 });
    group.add(ew);
  }
  // City blocks: raised concrete slabs (the sidewalk level, curb effect).
  const blockMat = lam(0xb8b0a2);
  const blockSize = PITCH - ROAD_HALF * 2 - 4; // ~32
  for (let ix = 0; ix < 6; ix++) {
    for (let iz = 0; iz < 6; iz++) {
      const cx = -130 + ix * PITCH, cz = -130 + iz * PITCH;
      const b = box(blockMat, blockSize, 0.24, blockSize, cx, 0.0, cz);
      b.position.y = 0.0;
      group.add(b);
      // Park patch: one block gets a green lawn instead of concrete.
      if (ix === 4 && iz === 2) {
        const lawn = box(lam(0x4a8a3a), blockSize - 4, 0.3, blockSize - 4, cx, 0.02, cz);
        group.add(lawn);
      }
    }
  }
  scene.add(group);
}

// --- buildings ---------------------------------------------------------------
function buildBuildings(scene, rng) {
  const group = new THREE.Group();
  const boxes = []; // AABBs for collision {minX,maxX,minZ,maxZ}
  let count = 0;
  // Facade texture variants (cached, shared).
  const texA = facadeTexture('#d8c8a8', 0.45, 5, 8);
  const texB = facadeTexture('#c8c8c8', 0.3, 6, 10);
  const texC = facadeTexture('#a87858', 0.5, 4, 6);
  const texD = facadeTexture('#e8e4d8', 0.35, 5, 7);
  const texE = facadeTexture('#8a98a8', 0.55, 6, 9);
  const texF = facadeTexture('#9a5a48', 0.4, 4, 5);
  const variants = [texA, texB, texC, texD, texE, texF];
  const roofMat = lam(0x5a4a42);

  // One hotel tower (luxury, glass facade, lit sign band) — east of the cover road.
  const hotel = { cx: 52, cz: 104, w: 30, d: 26, h: 64 };
  {
    const glassTex = facadeTexture('#7a94b8', 0.8, 8, 16);
    const mat = new THREE.MeshLambertMaterial({ map: glassTex, emissive: 0x2a3a52, emissiveIntensity: 0.35 });
    const tower = box(mat, hotel.w, hotel.h, hotel.d, hotel.cx, hotel.h / 2 + 0.12, hotel.cz);
    group.add(tower);
    // Lit sign band at the top (warm gold, emissive).
    const sign = box(basic(0xffc828), hotel.w * 0.7, 2.2, 0.6, hotel.cx, hotel.h + 1.2, hotel.cz + hotel.d / 2 + 0.1);
    group.add(sign);
    const sign2 = box(basic(0xffc828), 0.6, 2.2, hotel.d * 0.7, hotel.cx + hotel.w / 2 + 0.1, hotel.h + 1.2, hotel.cz);
    group.add(sign2);
    // Rooftop garden on the tower.
    const garden = box(lam(0x3a7a2a), 10, 1.2, 8, hotel.cx - 6, hotel.h + 0.7, hotel.cz - 4);
    group.add(garden);
    boxes.push({ minX: hotel.cx - hotel.w / 2, maxX: hotel.cx + hotel.w / 2, minZ: hotel.cz - hotel.d / 2, maxZ: hotel.cz + hotel.d / 2 });
    count++;
  }

  // Regular blocks: 2-4 buildings per block, varied heights + colours.
  for (let ix = 0; ix < 6; ix++) {
    for (let iz = 0; iz < 6; iz++) {
      const bx = -130 + ix * PITCH, bz = -130 + iz * PITCH;
      // Skip the hotel block and the park block (4,2).
      if (ix === 3 && iz === 4) continue; // hotel block (52,104)
      if (ix === 4 && iz === 2) continue; // park block
      const n = 2 + Math.floor(rng() * 3); // 2-4 buildings
      for (let k = 0; k < n; k++) {
        const ox = (rng() - 0.5) * 14, oz = (rng() - 0.5) * 14;
        const w = range(rng, 10, 16), d = range(rng, 10, 16);
        const h = pick(rng, [8, 10, 12, 14, 18, 22, 26, 30]);
        const cx = bx + ox, cz = bz + oz;
        const tex = pick(rng, variants);
        const mat = new THREE.MeshLambertMaterial({ map: tex });
        // Texture repeat by size bucket (so windows stay ~2.5m).
        const rep = h > 20 ? 3 : 2;
        // Clone the texture for a per-building repeat (shares the canvas).
        const t = tex.clone(); t.needsUpdate = true; t.repeat.set(Math.max(1, Math.round(w / 14)), Math.max(1, Math.round(h / 16)));
        mat.map = t;
        const b = box(mat, w, h, d, cx, h / 2 + 0.12, cz);
        group.add(b);
        // Roof slab.
        const roof = box(roofMat, w + 0.6, 0.5, d + 0.6, cx, h + 0.35, cz);
        group.add(roof);
        // Rooftop details on some buildings (AC box / water tank / antenna).
        const r = rng();
        if (r < 0.3) {
          group.add(box(lam(0x8a8a8a), 2.4, 1.2, 2.0, cx + w * 0.2, h + 1.1, cz));
        } else if (r < 0.5) {
          const tank = new THREE.Mesh(CYL, lam(0x7a8a9a));
          tank.scale.set(1.4, 2.4, 1.4);
          tank.position.set(cx - w * 0.2, h + 1.5, cz + d * 0.15);
          group.add(tank);
        } else if (r < 0.62) {
          const ant = new THREE.Mesh(CYL, lam(0x3a3a3a));
          ant.scale.set(0.12, 5, 0.12);
          ant.position.set(cx, h + 2.8, cz);
          group.add(ant);
        }
        // Balconies on mid-rise buildings (protruding box + railing strip).
        if (h >= 14 && h <= 22 && rng() < 0.5) {
          const bal = box(lam(0x6a5a48), w * 0.5, 0.4, 1.6, cx, h * 0.55, cz + d / 2 + 0.7);
          group.add(bal);
          const rail = box(basic(0x2a2a2e), w * 0.5, 0.9, 0.15, cx, h * 0.55 + 0.6, cz + d / 2 + 1.4);
          group.add(rail);
        }
        // Rooftop garden on 2-3 buildings overall (small green box + tiny tree).
        if (rng() < 0.06) {
          group.add(box(lam(0x3a7a2a), 5, 1.0, 4, cx, h + 0.9, cz));
          const tree = new THREE.Mesh(CONE, lam(0x2a6a2a));
          tree.scale.set(1.2, 2.4, 1.2);
          tree.position.set(cx + 1, h + 2.4, cz);
          group.add(tree);
        }
        // Storefronts on the main street (x=0 road): awning + neon sign.
        if (Math.abs(cx) < 24 && rng() < 0.55) {
          const aw = pick(rng, AWNING_COLORS);
          const side = cx > 0 ? 1 : -1;
          const awn = box(lam(aw), w * 0.7, 0.5, 2.6, cx + side * (w / 2 + 0.6), 3.4, cz);
          awn.rotation.z = side * 0.25;
          group.add(awn);
          const neon = box(basic(pick(rng, NEON_COLORS)), w * 0.5, 0.7, 0.3, cx + side * (w / 2 + 0.2), 5.2, cz);
          group.add(neon);
        }
        boxes.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
        count++;
      }
    }
  }
  scene.add(group);
  return { count, boxes };
}

// --- palms, lamps, planters (street luxury) ----------------------------------
function buildStreet(scene, rng) {
  const group = new THREE.Group();
  const trunkMat = lam(0x7a5a38);
  const frondMat = lam(0x2a7a2a);
  const frondMat2 = lam(0x3a8a2e);
  // Real palms: curved trunk (2 stacked segments) + 5-7 drooping fronds.
  function palm(x, z, s = 1) {
    const p = new THREE.Group();
    const t1 = new THREE.Mesh(CYL, trunkMat);
    t1.scale.set(0.28 * s, 3.2 * s, 0.28 * s);
    t1.position.set(0, 1.6 * s, 0);
    t1.rotation.z = 0.08;
    p.add(t1);
    const t2 = new THREE.Mesh(CYL, trunkMat);
    t2.scale.set(0.22 * s, 2.6 * s, 0.22 * s);
    t2.position.set(0.35 * s, 4.2 * s, 0);
    t2.rotation.z = 0.12;
    p.add(t2);
    const fronds = 5 + Math.floor(rng() * 3);
    for (let i = 0; i < fronds; i++) {
      const a = (i / fronds) * Math.PI * 2;
      const f = new THREE.Mesh(BOX, rng() < 0.5 ? frondMat : frondMat2);
      f.scale.set(0.5 * s, 0.08 * s, 3.2 * s);
      f.position.set(Math.sin(a) * 1.1 * s, 5.4 * s, Math.cos(a) * 1.1 * s);
      f.rotation.y = a;
      f.rotation.x = 0.55; // droop downward
      p.add(f);
    }
    p.position.set(x, 0.12, z);
    return p;
  }
  // Denser palms along the main street (x=0) + scattered elsewhere.
  for (let z = -150; z <= 170; z += 26) {
    if (rng() < 0.85) group.add(palm(-WALK_HALF - 1.5, z + range(rng, -4, 4), range(rng, 0.9, 1.15)));
    if (rng() < 0.85) group.add(palm(WALK_HALF + 1.5, z + range(rng, -4, 4), range(rng, 0.9, 1.15)));
  }
  for (const s of [-104, -52, 52, 104]) {
    for (let z = -130; z <= 150; z += 52) {
      if (rng() < 0.5) group.add(palm(s + WALK_HALF + 1.5, z + range(rng, -6, 6), range(rng, 0.8, 1.05)));
    }
  }
  // Street lamps ON THE SIDEWALK (never on the road): x = s + ROAD_HALF + 1.
  // Warm glowing bulbs (emissive spheres) at dusk.
  const poleMat = lam(0x2a2e33);
  const bulbMat = basic(0xffd88a);
  for (const s of STREETS) {
    for (let z = -156; z <= 156; z += PITCH) {
      const x = s + ROAD_HALF + 1; // east sidewalk
      const pole = new THREE.Mesh(CYL, poleMat);
      pole.scale.set(0.09, 5.2, 0.09);
      pole.position.set(x, 2.7, z + 6);
      group.add(pole);
      const arm = box(poleMat, 1.4, 0.12, 0.12, x - 0.6, 5.2, z + 6);
      group.add(arm);
      const bulb = new THREE.Mesh(SPHERE, bulbMat);
      bulb.scale.set(0.32, 0.32, 0.32);
      bulb.position.set(x - 1.3, 5.1, z + 6);
      group.add(bulb);
    }
  }
  // Planters with flowers along the main street sidewalks.
  const flowerColors = [0xff2a4a, 0xff7ab8, 0xffd828, 0xff6a2a];
  for (let z = -140; z <= 170; z += 26) {
    if (rng() < 0.7) {
      const side = rng() < 0.5 ? -1 : 1;
      const x = side * (WALK_HALF + 0.5);
      group.add(box(lam(0x4a5a3a), 2.2, 0.7, 1.2, x, 0.45, z));
      for (let f = 0; f < 4; f++) {
        const fl = new THREE.Mesh(SPHERE, basic(pick(rng, flowerColors)));
        fl.scale.set(0.22, 0.22, 0.22);
        fl.position.set(x + range(rng, -0.8, 0.8), 0.95, z + range(rng, -0.4, 0.4));
        group.add(fl);
      }
    }
  }
  scene.add(group);
}

// --- beach / ocean / pier (resort luxury) ------------------------------------
// The beach is the resort half of the map: deep warm sand (SAND, darkened
// for the brighter v5 lighting), a wide rich-blue ocean, a white foam line
// at the shoreline, a row of coloured umbrellas flanking the beach drive
// lane, and a wooden pier with a hut at its end. Umbrella positions use
// the shared rng in a fixed order (x jitter, z jitter, colour pick per
// umbrella) so the layout is deterministic for a given seed.
const UMBRELLA_COUNT = 10;
const UMBRELLA_SPACING = 36; // metres between umbrellas along the beach
const UMBRELLA_X0 = -170; // first umbrella x
const UMBRELLA_Z_LANES = [232, 248]; // two rows flanking the drive lane (z=240)
const UMBRELLA_COLORS = [0xe82828, 0xf8d828, 0x28b8b8, 0xff7a2a, 0x2a6ad8];
function buildBeach(scene, rng) {
  const group = new THREE.Group();
  // Sand: two-tone gradient, lighter near the water.
  const sand = new THREE.Mesh(PLANE, new THREE.MeshLambertMaterial({ map: sandTexture() }));
  sand.rotation.x = -Math.PI / 2;
  sand.scale.set(560, BEACH_END - BEACH_START + 20, 1);
  sand.position.set(0, 0.06, (BEACH_START + BEACH_END) / 2);
  group.add(sand);
  // Ocean: wider and richer blue than the city side, with a horizon line.
  const ocean = new THREE.Mesh(PLANE, lam(OCEAN));
  ocean.rotation.x = -Math.PI / 2;
  ocean.scale.set(1200, OCEAN_END - BEACH_END + 40, 1);
  ocean.position.set(0, 0.0, (BEACH_END + OCEAN_END) / 2);
  group.add(ocean);
  // White foam lines at the shoreline (a bright one plus a fainter one
  // further out, which the animation moves later).
  const foam = box(basic(FOAM, { transparent: true, opacity: 0.9 }), 560, 0.1, 2.2, 0, 0.08, BEACH_END - 1);
  group.add(foam);
  const foam2 = box(basic(FOAM, { transparent: true, opacity: 0.55 }), 560, 0.1, 1.4, 0, 0.08, BEACH_END + 6);
  group.add(foam2);
  // Beach umbrellas (coloured cones on poles) + lounge chairs. They stand
  // in two rows on either side of the beach drive lane, so the car drives
  // between them — a resort row, not distant dots. Each umbrella gets a
  // small random x/z jitter and a random colour from the palette.
  for (let i = 0; i < UMBRELLA_COUNT; i++) {
    const ux = UMBRELLA_X0 + i * UMBRELLA_SPACING + range(rng, -6, 6);
    const uz = UMBRELLA_Z_LANES[i % 2] + range(rng, -2, 2);
    const pole = new THREE.Mesh(CYL, lam(0x8a7a5a));
    pole.scale.set(0.09, 2.4, 0.09);
    pole.position.set(ux, 1.2, uz);
    group.add(pole);
    const top = new THREE.Mesh(CONE, lam(pick(rng, UMBRELLA_COLORS)));
    top.scale.set(2.6, 1.1, 2.6);
    top.position.set(ux, 2.8, uz);
    group.add(top);
    // Lounge chair beside each umbrella (flat seat + raised back).
    group.add(box(lam(0xe8e0d0), 1.8, 0.35, 0.7, ux + 2.6, 0.35, uz + 1));
    group.add(box(lam(0xe8e0d0), 0.7, 0.8, 0.7, ux + 3.4, 0.5, uz + 1));
  }
  // Wooden pier reaching out into the ocean (planks + posts + a hut at
  // the far end). Wide and light wood so it reads against the sand when
  // seen from the beach drive.
  const pierZ0 = BEACH_END - 4, pierZ1 = BEACH_END + 56;
  const pierLen = pierZ1 - pierZ0;
  const pier = box(lam(0xa0805a), 9, 0.5, pierLen, -60, 0.7, (pierZ0 + pierZ1) / 2);
  group.add(pier);
  for (let z = pierZ0; z <= pierZ1; z += 8) {
    group.add(box(lam(0x7a5a3a), 0.5, 1.6, 0.5, -64.2, 0.2, z));
    group.add(box(lam(0x7a5a3a), 0.5, 1.6, 0.5, -55.8, 0.2, z));
  }
  // Hut at the end of the pier (box + cone roof).
  group.add(box(lam(0xa8805a), 5, 3.4, 4.5, -60, 2.4, pierZ1 - 3));
  const hutRoof = new THREE.Mesh(CONE, lam(0x7a3a28));
  hutRoof.scale.set(3.6, 1.8, 3.2);
  hutRoof.position.set(-60, 5.0, pierZ1 - 3);
  group.add(hutRoof);
  scene.add(group);
  return { foam, foam2 };
}

// --- main build ---------------------------------------------------------------
export function buildCity(scene, seed = 7) {
  const rng = makeRng(seed);
  const sky = buildSky(scene, rng);
  buildGround(scene);
  const { count, boxes } = buildBuildings(scene, rng);
  buildStreet(scene, rng);
  const beach = buildBeach(scene, rng);
  // Fog: warm haze that softens the far city (cheap atmosphere).
  scene.fog = new THREE.Fog(0xd88a6a, 220, 780);
  return {
    buildings: count,
    boxes,
    clouds: sky.clouds,
    birds: sky.birds,
    foam: beach.foam,
    foam2: beach.foam2,
  };
}

// Per-frame ambient animation (clouds drift, birds fly, foam breathes).
export function animateCity(city, dt, t) {
  for (const c of city.clouds) {
    c.position.x += c.userData.drift * dt;
    if (c.position.x > 650) c.position.x = -650;
  }
  for (const b of city.birds) {
    b.position.x += b.userData.speed * dt;
    b.position.y += Math.sin(t * 0.7 + b.position.x * 0.05) * 0.15 * dt * 10;
    if (b.position.x > 320) b.position.x = -320;
  }
  if (city.foam) {
    const s = 1 + Math.sin(t * 0.8) * 0.03;
    city.foam.scale.x = 560 * s;
  }
}
