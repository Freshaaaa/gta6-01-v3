// Solmar Bay 3D — city: seeded grid, InstancedMesh buildings, beach + ocean,
// palms, props, neon. Exports road helpers for driving / traffic / GPS.
// Written fresh for the gta6-01 3D rebuild (branch v12-3d).
import * as THREE from 'three';
import { mulberry32 } from './engine.js';

export const PITCH = 52;        // block + road
export const ROAD_HALF = 6;     // road half-width
export const CITY_R = 5;        // roads at i*PITCH for i in -5..5
export const BEACH_Z = 250;     // sand starts here (south edge)
export const SEA_Z = 300;       // ocean starts here

// Canvas texture: a building face with lit windows (map + emissive map).
// Warm dark facade so the golden lit windows glow against it at dusk.
function windowsTexture(rng) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#6e5a50'; g.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 18) {
    for (let x = 8; x < 120; x += 18) {
      const lit = rng() < 0.55;
      g.fillStyle = lit ? (rng() < 0.8 ? '#ffd98a' : '#ffb36b') : '#241d1a';
      g.fillRect(x, y, 11, 12);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Saturated golden-hour facades: terracotta, coral, amber, teal, dusty rose.
const PALETTE = [0xe8965a, 0xd86a6a, 0xf5d9a0, 0x5a9ab0, 0xc86a8a, 0xe8b060, 0x7ab8a0, 0xf0a060];

export class City {
  constructor(scene, seed = 7) {
    this.scene = scene;
    this.rng = mulberry32(seed);
    this.buildingAABBs = []; // {minX,maxX,minZ,maxZ} for collision push-out
    this.palmSpots = [];
    this.buildGround();
    this.buildRoads();
    this.buildBuildings();
    this.buildLandmarks();
    this.buildPalms();
    this.buildProps();
    this.buildBeach();
    this.buildOcean();
  }

  buildGround() {
    // Base ground: dark asphalt for the whole city slab.
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshStandardMaterial({ color: 0x4a4441, roughness: 0.95 }),
    );
    g.rotation.x = -Math.PI / 2; g.position.set(0, 0, -40);
    g.receiveShadow = true;
    this.scene.add(g);
  }

  buildRoads() {
    const rng = this.rng;
    // Road strips (slightly lighter asphalt) + sidewalks per block.
    // Matte asphalt: a glossy road reflects the (dark) sky and reads black.
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x5e574e, roughness: 0.9 });
    const walkMat = new THREE.MeshStandardMaterial({ color: 0x8d8578, roughness: 0.95 });
    const roads = [];
    for (let i = -CITY_R; i <= CITY_R; i++) roads.push(i * PITCH);
    for (const r of roads) {
      const v = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 620), roadMat);
      v.rotation.x = -Math.PI / 2; v.position.set(r, 0.02, 0); v.receiveShadow = true;
      this.scene.add(v);
      const h = new THREE.Mesh(new THREE.PlaneGeometry(620, ROAD_HALF * 2), roadMat);
      h.rotation.x = -Math.PI / 2; h.position.set(0, 0.02, r); h.receiveShadow = true;
      this.scene.add(h);
    }
    // Sidewalk slabs inside each block.
    const walkGeo = new THREE.BoxGeometry(PITCH - ROAD_HALF * 2, 0.3, PITCH - ROAD_HALF * 2);
    const walks = new THREE.InstancedMesh(walkGeo, walkMat, 100);
    const m = new THREE.Matrix4();
    let n = 0;
    for (let ix = -CITY_R; ix < CITY_R; ix++) {
      for (let iz = -CITY_R; iz < CITY_R; iz++) {
        const cx = ix * PITCH + PITCH / 2, cz = iz * PITCH + PITCH / 2;
        if (cz > BEACH_Z - 10) continue; // beach blocks have no sidewalks
        m.makeTranslation(cx, 0.15, cz);
        walks.setMatrixAt(n++, m);
      }
    }
    walks.count = n;
    walks.receiveShadow = true;
    this.scene.add(walks);
    // Lane markings: dashed centre lines, instanced thin boxes.
    const dashGeo = new THREE.BoxGeometry(0.35, 0.05, 3.2);
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xe8c860 });
    const dashes = [];
    for (const r of roads) {
      for (let s = -300; s <= 300; s += 10) {
        if (Math.abs(s - r) < ROAD_HALF + 2) continue; // skip intersections
        dashes.push([r, s, 0]); dashes.push([s, r, 1]);
      }
    }
    const dm = new THREE.InstancedMesh(dashGeo, dashMat, dashes.length);
    dashes.forEach(([x, z, rot], i) => {
      m.makeRotationY(rot ? Math.PI / 2 : 0);
      m.setPosition(x, 0.05, z);
      dm.setMatrixAt(i, m);
    });
    this.scene.add(dm);
    // Crosswalks at a few central intersections.
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xd8d8d8 });
    const crossGeo = new THREE.BoxGeometry(1.1, 0.05, 5.5);
    const crosses = [];
    for (const ix of [-2, 0, 2]) for (const iz of [-2, 0, 2]) {
      for (let k = -2; k <= 2; k++) {
        crosses.push([ix * PITCH + k * 2.4, iz * PITCH - ROAD_HALF - 1.5, 0]);
        crosses.push([ix * PITCH + k * 2.4, iz * PITCH + ROAD_HALF + 1.5, 0]);
      }
    }
    const cm = new THREE.InstancedMesh(crossGeo, crossMat, crosses.length);
    crosses.forEach(([x, z], i) => { m.makeTranslation(x, 0.05, z); cm.setMatrixAt(i, m); });
    this.scene.add(cm);
  }

  buildBuildings() {
    const rng = this.rng;
    const tex = windowsTexture(rng);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0); // origin at the base, scale y = height
    const mat = new THREE.MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.85,
      roughness: 0.8, metalness: 0.1,
    });
    const spots = [];
    for (let ix = -CITY_R; ix < CITY_R; ix++) {
      for (let iz = -CITY_R; iz < CITY_R; iz++) {
        const cx = ix * PITCH + PITCH / 2, cz = iz * PITCH + PITCH / 2;
        if (cz > BEACH_Z - 20) continue;
        const n = 1 + Math.floor(rng() * 2);
        for (let k = 0; k < n; k++) {
          const w = 12 + rng() * 16, d = 12 + rng() * 16;
          const floors = 2 + Math.floor(Math.pow(rng(), 1.6) * 19);
          const h = floors * 3.4;
          const ox = (rng() - 0.5) * (PITCH - ROAD_HALF * 2 - w - 4);
          const oz = (rng() - 0.5) * (PITCH - ROAD_HALF * 2 - d - 4);
          spots.push({ x: cx + ox, z: cz + oz, w, d, h });
        }
      }
    }
    const inst = new THREE.InstancedMesh(geo, mat, spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    spots.forEach((b, i) => {
      p.set(b.x, 0, b.z); s.set(b.w, b.h, b.d); q.identity();
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
      col.setHex(PALETTE[Math.floor(rng() * PALETTE.length)]);
      inst.setColorAt(i, col);
      this.buildingAABBs.push({ minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2 });
    });
    inst.castShadow = true; inst.receiveShadow = true;
    this.scene.add(inst);
    this.buildingCount = spots.length;
  }

  buildLandmarks() {
    // Three tall towers with distinct silhouettes on the skyline.
    const defs = [
      { x: -104, z: -104, w: 26, h: 120, d: 26, c: 0x7fb8d8, top: 0xff5a8a },
      { x: 52, z: -156, w: 22, h: 96, d: 22, c: 0xe8b8d8, top: 0x37e0c8 },
      { x: 156, z: 0, w: 24, h: 108, d: 24, c: 0xf2d8a0, top: 0xffd23e },
    ];
    for (const d of defs) {
      const tower = new THREE.Mesh(
        new THREE.BoxGeometry(d.w, d.h, d.d),
        new THREE.MeshStandardMaterial({ color: d.c, roughness: 0.35, metalness: 0.45 }),
      );
      tower.position.set(d.x, d.h / 2, d.z);
      tower.castShadow = true;
      this.scene.add(tower);
      const crown = new THREE.Mesh(
        new THREE.BoxGeometry(d.w * 0.5, 6, d.d * 0.5),
        new THREE.MeshStandardMaterial({ color: d.top, emissive: d.top, emissiveIntensity: 1.6 }),
      );
      crown.position.set(d.x, d.h + 3, d.z);
      this.scene.add(crown);
      this.buildingAABBs.push({ minX: d.x - d.w / 2, maxX: d.x + d.w / 2, minZ: d.z - d.d / 2, maxZ: d.z + d.d / 2 });
    }
  }

  buildPalms() {
    const rng = this.rng;
    const spots = [];
    for (let i = 0; i < 170; i++) { // denser: a living beachfront + avenues
      const alongBeach = rng() < 0.55;
      let x, z;
      if (alongBeach) { x = (rng() - 0.5) * 520; z = BEACH_Z + 4 + rng() * 30; }
      else {
        const ix = Math.floor(rng() * (CITY_R * 2)) - CITY_R;
        const iz = Math.floor(rng() * (CITY_R * 2)) - CITY_R;
        x = ix * PITCH + PITCH / 2 + (rng() - 0.5) * 30;
        z = iz * PITCH + PITCH / 2 + (rng() - 0.5) * 30;
        if (z > BEACH_Z - 8) continue;
      }
      spots.push({ x, z, h: 5 + rng() * 3, lean: (rng() - 0.5) * 0.25, rot: rng() * Math.PI * 2 });
    }
    this.palmSpots = spots;
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.9 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const frondGeo = new THREE.ConeGeometry(1.6, 3.4, 4);
    frondGeo.rotateX(Math.PI / 2.6); // droop outward
    frondGeo.scale(1, 1, 0.22); // flatten
    // Dark silhouette green: against the sunset the palms read as
    // backlit fronds, the way the top-3 shots frame them.
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x1e6a38, roughness: 0.85, side: THREE.DoubleSide });
    const fronds = new THREE.InstancedMesh(frondGeo, frondMat, spots.length * 5);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    spots.forEach((pl, i) => {
      e.set(pl.lean, 0, 0); q.setFromEuler(e);
      p.set(pl.x, 0, pl.z); s.set(1, pl.h, 1);
      m.compose(p, q, s); trunks.setMatrixAt(i, m);
      for (let f = 0; f < 5; f++) {
        e.set(0, pl.rot + (f / 5) * Math.PI * 2, 0); q.setFromEuler(e);
        p.set(pl.x, pl.h, pl.z); s.set(1, 1, 1);
        m.compose(p, q, s); fronds.setMatrixAt(i * 5 + f, m);
      }
    });
    trunks.castShadow = true;
    this.scene.add(trunks, fronds);
  }

  buildProps() {
    const rng = this.rng;
    // Streetlights along the main avenues (emissive heads glow at night).
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 7, 6);
    poleGeo.translate(0, 3.5, 0);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.6, metalness: 0.5 });
    const headGeo = new THREE.SphereGeometry(0.35, 8, 6);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffd98a, emissiveIntensity: 1.4 });
    const spots = [];
    for (let i = -CITY_R; i <= CITY_R; i++) {
      for (let s = -260; s <= 260; s += 52) {
        spots.push([i * PITCH + ROAD_HALF + 1, s]);
        spots.push([s, i * PITCH + ROAD_HALF + 1]);
      }
    }
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length);
    const heads = new THREE.InstancedMesh(headGeo, headMat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      m.makeTranslation(x, 0, z); poles.setMatrixAt(i, m);
      m.makeTranslation(x, 7, z); heads.setMatrixAt(i, m);
    });
    this.scene.add(poles, heads);
    this.lampHeads = heads;
    // Neon signs: bright emissive boxes on buildings along the central strip.
    const neonCols = [0xff2a7a, 0x22d8ff, 0xffd23e, 0x7a5cff, 0x37ffa0];
    const neonGeo = new THREE.BoxGeometry(6, 1.4, 0.3);
    const neons = new THREE.InstancedMesh(neonGeo, new THREE.MeshStandardMaterial({ emissive: 0xffffff, emissiveIntensity: 2.6, color: 0x111111 }), 26);
    const col = new THREE.Color();
    for (let i = 0; i < 26; i++) {
      const bx = (Math.floor(rng() * 9) - 4) * PITCH + PITCH / 2;
      const bz = (Math.floor(rng() * 9) - 4) * PITCH + PITCH / 2;
      m.makeRotationY(rng() * Math.PI);
      m.setPosition(bx, 6 + rng() * 14, bz);
      neons.setMatrixAt(i, m);
      col.setHex(neonCols[i % neonCols.length]);
      neons.setColorAt(i, col);
    }
    this.scene.add(neons);
    // Traffic lights at central intersections (visual only).
    const tlGeo = new THREE.BoxGeometry(0.5, 1.6, 0.5);
    const tlMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });
    const tlSpots = [];
    for (const ix of [-2, 0, 2]) for (const iz of [-2, 0, 2]) {
      tlSpots.push([ix * PITCH + ROAD_HALF + 0.8, iz * PITCH + ROAD_HALF + 0.8]);
    }
    const tls = new THREE.InstancedMesh(tlGeo, tlMat, tlSpots.length);
    tlSpots.forEach(([x, z], i) => { m.makeTranslation(x, 4.4, z); tls.setMatrixAt(i, m); });
    this.scene.add(tls);
  }

  buildBeach() {
    // Sand strip on the south edge + a boardwalk.
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(620, SEA_Z - BEACH_Z + 12),
      new THREE.MeshStandardMaterial({ color: 0xe8d8a8, roughness: 1 }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.06, (BEACH_Z + SEA_Z) / 2);
    sand.receiveShadow = true;
    this.scene.add(sand);
    const walk = new THREE.Mesh(
      new THREE.BoxGeometry(620, 0.4, 6),
      new THREE.MeshStandardMaterial({ color: 0x9a7a58, roughness: 0.9 }),
    );
    walk.position.set(0, 0.2, BEACH_Z - 2);
    walk.receiveShadow = true;
    this.scene.add(walk);
    // Beach umbrellas: small cones on poles, a few rows.
    const rng = this.rng;
    const umGeo = new THREE.ConeGeometry(2.2, 1.2, 8);
    const umMat = new THREE.MeshStandardMaterial({ color: 0xff5a7a, roughness: 0.8 });
    const ums = new THREE.InstancedMesh(umGeo, umMat, 26);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    const umCols = [0xff5a7a, 0x22d8ff, 0xffd23e, 0xffffff];
    for (let i = 0; i < 26; i++) {
      m.makeTranslation((rng() - 0.5) * 480, 2.2, BEACH_Z + 14 + rng() * 26);
      ums.setMatrixAt(i, m);
      col.setHex(umCols[i % umCols.length]);
      ums.setColorAt(i, col);
    }
    this.scene.add(ums);
  }

  buildOcean() {
    // Teal sea plane, gently animated (opacity + a slow swell).
    const seaMat = new THREE.MeshStandardMaterial({
      color: 0x14919f, roughness: 0.15, metalness: 0.1,
      transparent: true, opacity: 0.92,
    });
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 500), seaMat);
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.position.set(0, 0.12, SEA_Z + 250);
    this.scene.add(this.sea);
    // Sun glitter: a golden path on the water running from the beach toward
    // the low south-west sun — the postcard shimmer in the beach shot.
    const glitMat = new THREE.MeshBasicMaterial({ color: 0xffb36b, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
    const glitGeo = new THREE.PlaneGeometry(46, 380);
    glitGeo.rotateX(-Math.PI / 2); // lay flat on the water
    this.glitter = new THREE.Mesh(glitGeo, glitMat);
    this.glitter.rotation.y = -0.43; // long axis points at the low sun (-260, 680)
    this.glitter.position.set(-140, 0.2, 420);
    this.scene.add(this.glitter);
    // White foam strip where the sea meets the sand.
    const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
    this.foam = new THREE.Mesh(new THREE.PlaneGeometry(900, 3), foamMat);
    this.foam.rotation.x = -Math.PI / 2;
    this.foam.position.set(0, 0.16, SEA_Z - 1);
    this.scene.add(this.foam);
    this.seaTime = 0;
  }

  update(dt) {
    this.seaTime += dt;
    this.sea.material.opacity = 0.9 + Math.sin(this.seaTime * 0.7) * 0.03;
    this.sea.position.y = 0.12 + Math.sin(this.seaTime * 0.5) * 0.08;
    this.glitter.material.opacity = 0.26 + Math.sin(this.seaTime * 0.9) * 0.08;
    this.foam.material.opacity = 0.35 + Math.sin(this.seaTime * 1.1) * 0.18;
    this.foam.position.z = SEA_Z - 1 + Math.sin(this.seaTime * 0.6) * 1.6;
  }

  // --- road helpers (for driving, traffic, GPS) ---
  roadCoord(v) { return Math.round(v / PITCH) * PITCH; }
  isOnRoad(x, z) {
    const dx = Math.abs(x - this.roadCoord(x));
    const dz = Math.abs(z - this.roadCoord(z));
    return dx < ROAD_HALF + 0.5 || dz < ROAD_HALF + 0.5;
  }
  nearestRoad(x, z) {
    const rx = this.roadCoord(x), rz = this.roadCoord(z);
    return Math.abs(x - rx) < Math.abs(z - rz) ? { x: rx, z, alongX: false } : { x, z: rz, alongX: true };
  }
  roadAt(x, z) { return this.nearestRoad(x, z); }
  randomParkedSpot(rng) {
    const alongX = rng() < 0.5;
    const road = (Math.floor(rng() * (CITY_R * 2 + 1)) - CITY_R) * PITCH;
    const along = (Math.floor(rng() * 11) - 5) * PITCH + (rng() - 0.5) * 30;
    const off = ROAD_HALF - 1.4;
    if (alongX) return { x: along, z: road + (rng() < 0.5 ? off : -off), heading: rng() < 0.5 ? 0 : Math.PI };
    return { x: road + (rng() < 0.5 ? off : -off), z: along, heading: rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
  }
  // Push a circle (x,z,r) out of every building AABB. Returns true if pushed.
  collideCircle(x, z, r) {
    let px = x, pz = z, hit = false;
    for (const b of this.buildingAABBs) {
      if (px < b.minX - r || px > b.maxX + r || pz < b.minZ - r || pz > b.maxZ + r) continue;
      const dxl = px - (b.minX - r), dxr = (b.maxX + r) - px;
      const dzl = pz - (b.minZ - r), dzr = (b.maxZ + r) - pz;
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) px = b.minX - r; else if (m === dxr) px = b.maxX + r;
      else if (m === dzl) pz = b.minZ - r; else pz = b.maxZ + r;
      hit = true;
    }
    return { x: px, z: pz, hit };
  }
}
