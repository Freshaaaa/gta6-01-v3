// v15 clean re-record (01a1f673).
// Solmar Bay 3D — the city itself. A seeded generator lays a 9x9 street
// grid over the world, fills each block with buildings (palettes per
// district, towers downtown, neon signs on the Strip), parks and trees,
// and places the ten story landmarks, the marina, the pier and the
// lighthouse. It also builds the lane graph the traffic, police, GPS and
// minimap all share, and answers the questions the physics needs: "is
// this point on a road?", "does this circle hit a building?" and "does
// this sight line cross a building?".

import {
  COIN_COUNT, DISTRICTS, LANDMARKS, NEON_COLORS, ROAD_COUNT, ROAD_FIRST,
  ROAD_GAP, ROAD_WIDTH, WORLD_SIZE,
} from './config.js';
import { clamp, mulberry32, pick, rand, randInt } from './rng.js';

export const roadLines = [];
for (let i = 0; i < ROAD_COUNT; i++) roadLines.push(ROAD_FIRST + i * ROAD_GAP);

function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && z >= d.y0 && z < d.y1) return d;
  }
  return DISTRICTS[0];
}

function nearestRoadCoord(v) {
  let best = roadLines[0];
  for (const r of roadLines) if (Math.abs(v - r) < Math.abs(v - best)) best = r;
  return best;
}

export function isOnRoad(x, z) {
  for (const r of roadLines) {
    if (Math.abs(x - r) <= ROAD_WIDTH / 2 + 1.5) return true;
    if (Math.abs(z - r) <= ROAD_WIDTH / 2 + 1.5) return true;
  }
  return false;
}

/** Distance from (x, z) to the nearest road centre line. */
export function distToRoad(x, z) {
  let best = Infinity;
  for (const r of roadLines) {
    best = Math.min(best, Math.abs(x - r), Math.abs(z - r));
  }
  return best;
}

export function generateCity(seed) {
  const rng = mulberry32(seed);
  const city = {
    seed,
    buildings: [],   // {x, z, w, d, h, color, neon, neonColor, roof}
    trees: [],       // {x, z, s}
    lamps: [],       // {x, z}
    coins: [],       // {x, z, taken}
    parking: [],     // {x, z, yaw}
    nodes: [],       // lane graph nodes {x, z}
    lanes: [],       // directed lanes {x0,z0,x1,z1,from,to,len,axis}
    nodeOut: [],     // per node: list of lane indices
    props: [],       // knockable/static small props {x, z, r, kind}
    landmarkBuildings: {},
    beachProps: [],  // umbrellas + towels on the sand (v15) {x, z, kind, color}
    bridge: null,    // the coastal bridge over the water channel (v15)
  };

  // ---- lane graph: 9x9 intersection nodes, directed lanes both ways ----
  const nodeIndex = (i, j) => j * ROAD_COUNT + i;
  for (let j = 0; j < ROAD_COUNT; j++) {
    for (let i = 0; i < ROAD_COUNT; i++) {
      city.nodes.push({ x: roadLines[i], z: roadLines[j] });
    }
  }
  city.nodeOut = city.nodes.map(() => []);
  const addLane = (from, to) => {
    const a = city.nodes[from];
    const b = city.nodes[to];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const lane = { x0: a.x, z0: a.z, x1: b.x, z1: b.z, from, to, len, axis: a.x === b.x ? 'z' : 'x' };
    const idx = city.lanes.length;
    city.lanes.push(lane);
    city.nodeOut[from].push(idx);
  };
  for (let j = 0; j < ROAD_COUNT; j++) {
    for (let i = 0; i < ROAD_COUNT; i++) {
      if (i + 1 < ROAD_COUNT) { addLane(nodeIndex(i, j), nodeIndex(i + 1, j)); addLane(nodeIndex(i + 1, j), nodeIndex(i, j)); }
      if (j + 1 < ROAD_COUNT) { addLane(nodeIndex(i, j), nodeIndex(i, j + 1)); addLane(nodeIndex(i, j + 1), nodeIndex(i, j)); }
    }
  }

  // ---- blocks: 8x8, one per gap between roads ----
  const blockSize = ROAD_GAP - ROAD_WIDTH; // 46 m of interior
  const isPlazaBlock = (bi, bj) => (bi === 3 || bi === 4) && (bj === 3 || bj === 4);
  for (let bj = 0; bj < ROAD_COUNT - 1; bj++) {
    for (let bi = 0; bi < ROAD_COUNT - 1; bi++) {
      const cx = roadLines[bi] + ROAD_GAP / 2;
      const cz = roadLines[bj] + ROAD_GAP / 2;
      const d = districtAt(cx, cz);
      const plaza = isPlazaBlock(bi, bj);
      if (plaza) {
        // Solmar Plaza: open square with one landmark tower and a fountain.
        city.buildings.push({
          x: cx, z: cz - 8, w: 16, d: 16, h: 52, color: '#8b98ac', neon: false,
          neonColor: null, roof: true, landmark: 'plaza-tower',
        });
        city.props.push({ x: cx, z: cz + 10, r: 4, kind: 'fountain' });
        for (let t = 0; t < 6; t++) {
          city.trees.push({ x: cx + rand(rng, -18, 18), z: cz + rand(rng, 4, 18), s: rand(rng, 0.8, 1.2) });
        }
        continue;
      }
      const roll = rng();
      if (roll < 0.12) {
        // Park: grass, trees, a bench or two.
        for (let t = 0; t < randInt(rng, 7, 11); t++) {
          city.trees.push({ x: cx + rand(rng, -18, 18), z: cz + rand(rng, -18, 18), s: rand(rng, 0.8, 1.4) });
        }
        city.props.push({ x: cx, z: cz, r: 3, kind: 'fountain' });
        continue;
      }
      // Buildings: 1–4 lots per block.
      const lots = randInt(rng, 1, 4);
      const tall = d.name === 'Downtown' || d.name === 'The Strip';
      for (let l = 0; l < lots; l++) {
        const w = rand(rng, 10, 24);
        const dd = rand(rng, 10, 24);
        const bx = cx + rand(rng, -blockSize / 2 + w / 2 + 3, blockSize / 2 - w / 2 - 3);
        const bz = cz + rand(rng, -blockSize / 2 + dd / 2 + 3, blockSize / 2 - dd / 2 - 3);
        // Never cover a landmark marker.
        let blocked = false;
        for (const lm of Object.values(LANDMARKS)) {
          if (Math.abs(lm.x - bx) < w / 2 + 12 && Math.abs(lm.z - bz) < dd / 2 + 12) { blocked = true; break; }
        }
        if (blocked) continue;
        const h = tall ? rand(rng, 22, 68) : rand(rng, 8, 26);
        const neon = (d.name === 'The Strip' || d.name === 'Downtown' || d.name === 'Marina') && rng() < 0.45;
        city.buildings.push({
          x: bx, z: bz, w, d: dd, h, color: pick(rng, d.palette),
          neon, neonColor: neon ? pick(rng, NEON_COLORS) : null,
          roof: rng() < 0.3, landmark: null,
        });
      }
      // Street trees along the block edges.
      for (let t = 0; t < 3; t++) {
        const side = randInt(rng, 0, 3);
        const along = rand(rng, -18, 18);
        const off = blockSize / 2 + 1.5;
        if (side === 0) city.trees.push({ x: cx + along, z: cz - off, s: rand(rng, 0.8, 1.2) });
        else if (side === 1) city.trees.push({ x: cx + along, z: cz + off, s: rand(rng, 0.8, 1.2) });
        else if (side === 2) city.trees.push({ x: cx - off, z: cz + along, s: rand(rng, 0.8, 1.2) });
        else city.trees.push({ x: cx + off, z: cz + along, s: rand(rng, 0.8, 1.2) });
      }
    }
  }

  // Landmark buildings: diner, bank, casino, city hall, stadium (big,
  // distinct, and named on the minimap). Placed beside their markers.
  const landmarkDefs = [
    { key: 'diner', w: 18, d: 12, h: 9, color: '#e07856', neon: true, neonColor: '#ff2e63' },
    { key: 'bank', w: 22, d: 14, h: 18, color: '#dcc98f', neon: false },
    { key: 'casino', w: 26, d: 16, h: 22, color: '#8e6fb8', neon: true, neonColor: '#00cec9' },
    { key: 'cityhall', w: 20, d: 14, h: 20, color: '#7d8aa0', neon: false },
    { key: 'stadium', w: 30, d: 22, h: 14, color: '#c98f7a', neon: true, neonColor: '#f1c40f' },
    { key: 'tuner', w: 20, d: 12, h: 10, color: '#e67e22', neon: true, neonColor: '#f1c40f' },
  ];
  for (const def of landmarkDefs) {
    const lm = LANDMARKS[def.key];
    const b = {
      x: lm.x + 16, z: lm.z, w: def.w, d: def.d, h: def.h, color: def.color,
      neon: def.neon, neonColor: def.neonColor || null, roof: false, landmark: def.key,
    };
    city.buildings.push(b);
    city.landmarkBuildings[def.key] = b;
  }

  // Lamps at every intersection corner (one per corner, seeded subset).
  for (let j = 0; j < ROAD_COUNT; j++) {
    for (let i = 0; i < ROAD_COUNT; i++) {
      if (rng() < 0.5) {
        city.lamps.push({ x: roadLines[i] + 8.5, z: roadLines[j] + 8.5 });
      }
      if (rng() < 0.3) {
        city.lamps.push({ x: roadLines[i] - 8.5, z: roadLines[j] - 8.5 });
      }
    }
  }

  // Parking spots along curbs (parallel, on the road edge).
  for (let n = 0; n < 90; n++) {
    const horizontal = rng() < 0.5;
    const road = pick(rng, roadLines);
    const along = rand(rng, 45, WORLD_SIZE - 45);
    const side = rng() < 0.5 ? -1 : 1;
    const x = horizontal ? along : road + side * (ROAD_WIDTH / 2 - 2.2);
    const z = horizontal ? road + side * (ROAD_WIDTH / 2 - 2.2) : along;
    const yaw = horizontal ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    // Keep clear of intersections.
    const nearRoad = nearestRoadCoord(horizontal ? x : z);
    if (Math.abs((horizontal ? x : z) - nearRoad) < 16) continue;
    city.parking.push({ x, z, yaw });
  }

  // Sun coins: hidden around landmarks, parks and the pier.
  const coinSpots = [
    ...Object.values(LANDMARKS),
    { x: 150, z: 150 }, { x: 330, z: 90 }, { x: 90, z: 390 }, { x: 390, z: 390 },
    { x: 210, z: 450 }, { x: 450, z: 210 }, { x: 150, z: 330 }, { x: 330, z: 270 },
  ];
  for (let i = 0; i < COIN_COUNT; i++) {
    const spot = coinSpots[i % coinSpots.length];
    city.coins.push({
      x: clamp(spot.x + rand(rng, -14, 14), 20, WORLD_SIZE - 20),
      z: clamp(spot.z + rand(rng, -14, 14), 20, WORLD_SIZE - 20),
      taken: false,
    });
  }

  // Beach props (v15, re-recorded): umbrellas and towels on the sand (z 512–526),
  // so the coast reads as a lived-in beach from the road and the water
  // — the top entries' beach scenes are crowded with them. Umbrellas
  // stand in a loose line down the coast; each has a towel beside it.
  const UMBRELLA_COLORS = ['#ff2e63', '#f1c40f', '#00cec9', '#e84393', '#ff6b35', '#1abc9c'];
  for (let i = 0; i < 14; i++) {
    const x = 40 + i * 34 + rand(rng, -8, 8);
    const z = rand(rng, 514, 523);
    const color = UMBRELLA_COLORS[i % UMBRELLA_COLORS.length];
    city.beachProps.push({ x, z, kind: 'umbrella', color });
    city.beachProps.push({ x: x + rand(rng, 2, 4), z: z + rand(rng, -1, 2), kind: 'towel', color });
  }

  // The coastal bridge (v15): a road bridge over the water channel at
  // x = 360, deck 4 m up so boats pass underneath — a landmark the boat
  // run sails toward and the beach road drives under. Visual only (it
  // spans water no car ever drives on); the deck is high enough that
  // the Dinghy and Speedboat clear it.
  city.bridge = { x: 360, z0: 503, z1: 540, deckY: 4, width: 9 };

  return city;
}

// ---- collision queries (2D, x/z plane) ----

/** Push a circle (x, z, r) out of every building AABB it overlaps. Returns true if it hit anything. */
export function collideCircleBuildings(city, x, z, r) {
  let hit = false;
  for (const b of city.buildings) {
    const hw = b.w / 2;
    const hd = b.d / 2;
    const cx = clamp(x, b.x - hw, b.x + hw);
    const cz = clamp(z, b.z - hd, b.z + hd);
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        x += dx * push;
        z += dz * push;
      } else {
        // Centre inside the box: push out along the shortest face.
        const px = hw + r - Math.abs(x - b.x);
        const pz = hd + r - Math.abs(z - b.z);
        if (px < pz) x += (x >= b.x ? px : -px);
        else z += (z >= b.z ? pz : -pz);
      }
    }
  }
  return { x, z, hit };
}

/** True when the segment (ax,az)-(bx,bz) crosses any building AABB (line of sight). */
export function segmentBlocked(city, ax, az, bx, bz) {
  for (const b of city.buildings) {
    if (b.h < 6) continue;
    const hw = b.w / 2;
    const hd = b.d / 2;
    const minX = b.x - hw;
    const maxX = b.x + hw;
    const minZ = b.z - hd;
    const maxZ = b.z + hd;
    // Slab test.
    const dx = bx - ax;
    const dz = bz - az;
    let tmin = 0;
    let tmax = 1;
    if (Math.abs(dx) < 1e-9) {
      if (ax < minX || ax > maxX) continue;
    } else {
      let t1 = (minX - ax) / dx;
      let t2 = (maxX - ax) / dx;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (Math.abs(dz) < 1e-9) {
      if (az < minZ || az > maxZ) continue;
    } else {
      let t1 = (minZ - az) / dz;
      let t2 = (maxZ - az) / dz;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    return true;
  }
  return false;
}

/** Nearest lane to (x, z): returns {lane, t} (t = metres along the lane). */
export function nearestLane(city, x, z) {
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < city.lanes.length; i++) {
    const L = city.lanes[i];
    const dx = L.x1 - L.x0;
    const dz = L.z1 - L.z0;
    const len2 = dx * dx + dz * dz;
    let t = ((x - L.x0) * dx + (z - L.z0) * dz) / len2;
    t = clamp(t, 0, 1);
    const px = L.x0 + dx * t;
    const pz = L.z0 + dz * t;
    const d = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d < bestD) {
      bestD = d;
      best = { lane: i, t: t * L.len };
    }
  }
  return best;
}

/** A point on a lane, offset to the right-hand side of travel. */
export function lanePoint(city, laneIdx, t) {
  const L = city.lanes[laneIdx];
  const s = clamp(t / L.len, 0, 1);
  const dx = (L.x1 - L.x0) / L.len;
  const dz = (L.z1 - L.z0) / L.len;
  // Right-hand offset: right of forward (dx, dz) is (-dz, dx) in (x, z)
  // when facing (dx, dz)... check: facing +z, right is -x. (-dz, dx) = (-1, 0). Yes.
  const rx = -dz;
  const rz = dx;
  return {
    x: L.x0 + dx * s * L.len + rx * 3.5,
    z: L.z0 + dz * s * L.len + rz * 3.5,
    dirX: dx,
    dirZ: dz,
  };
}

/** GPS route: Manhattan path along road centre lines from (x, z) to (tx, tz). */
export function gpsRoute(x, z, tx, tz) {
  const pts = [{ x, z }];
  const rx = nearestRoadCoord(x);
  const rz = nearestRoadCoord(z);
  const trx = nearestRoadCoord(tx);
  const trz = nearestRoadCoord(tz);
  pts.push({ x: rx, z });
  pts.push({ x: rx, z: rz });
  pts.push({ x: trx, z: rz });
  pts.push({ x: trx, z: tz });
  pts.push({ x: tx, z: tz });
  // Drop zero-length legs.
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const last = out[out.length - 1];
    if (Math.abs(p.x - last.x) > 0.5 || Math.abs(p.z - last.z) > 0.5) out.push(p);
  }
  return out;
}
