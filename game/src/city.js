// Solmar Bay: Heatwave — the city itself. A seeded generator lays a 9x9
// street grid over the world, fills each block with buildings (palettes per
// district, towers downtown), parks and trees, and places the ten story
// landmarks, the marina with its boats, the pier and the lighthouse. It
// also answers the two questions the physics needs: "is this point on a
// road?" and "does this circle hit a building?".

import {
  COIN_COUNT, DISTRICTS, LANDMARKS, ROAD_COUNT, ROAD_FIRST, ROAD_GAP,
  ROAD_WIDTH, WORLD_SIZE,
} from './config.js';
import { floatBetween, intBetween, pick } from './rng.js';

export function roadCenters() {
  const centers = [];
  for (let i = 0; i < ROAD_COUNT; i += 1) centers.push(ROAD_FIRST + i * ROAD_GAP);
  return centers;
}

export function isOnRoad(x, y) {
  const half = ROAD_WIDTH / 2;
  for (let i = 0; i < ROAD_COUNT; i += 1) {
    const c = ROAD_FIRST + i * ROAD_GAP;
    if (Math.abs(x - c) < half || Math.abs(y - c) < half) return true;
  }
  return false;
}

// Nearest road centre line to a coordinate (used to snap traffic to lanes).
export function nearestRoad(value) {
  let best = ROAD_FIRST;
  let bestDist = Infinity;
  for (let i = 0; i < ROAD_COUNT; i += 1) {
    const c = ROAD_FIRST + i * ROAD_GAP;
    const d = Math.abs(value - c);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best;
}

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  }
  return DISTRICTS[0];
}

export function createCity(rng) {
  const buildings = [];
  const trees = [];
  const lamps = [];
  const parks = [];
  const boats = [];
  const centers = roadCenters();
  const halfRoad = ROAD_WIDTH / 2;

  // Blocks sit between neighbouring roads. Each block gets 1-4 buildings,
  // a park, or a plaza, with a margin so sidewalks stay walkable.
  for (let bx = 0; bx < ROAD_COUNT - 1; bx += 1) {
    for (let by = 0; by < ROAD_COUNT - 1; by += 1) {
      const x0 = centers[bx] + halfRoad + 14;
      const y0 = centers[by] + halfRoad + 14;
      const x1 = centers[bx + 1] - halfRoad - 14;
      const y1 = centers[by + 1] - halfRoad - 14;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const district = districtAt(cx, cy);
      const roll = rng();

      if (roll < 0.12) {
        // Park: grass, trees, a pond.
        parks.push({ x0, y0, x1, y1 });
        const n = intBetween(rng, 4, 7);
        for (let t = 0; t < n; t += 1) {
          trees.push({ x: floatBetween(rng, x0 + 20, x1 - 20), y: floatBetween(rng, y0 + 20, y1 - 20), r: floatBetween(rng, 10, 16) });
        }
        continue;
      }

      const count = roll < 0.45 ? 1 : roll < 0.8 ? 2 : 4;
      if (count === 1) {
        const w = floatBetween(rng, 150, 220);
        const h = floatBetween(rng, 150, 220);
        buildings.push(makeBuilding(cx - w / 2, cy - h / 2, w, h, district, rng));
      } else if (count === 2) {
        const vertical = rng() < 0.5;
        for (let k = 0; k < 2; k += 1) {
          if (vertical) {
            const w = (x1 - x0) * 0.42;
            const h = floatBetween(rng, 150, 220);
            buildings.push(makeBuilding(x0 + k * ((x1 - x0) * 0.58), cy - h / 2, w, h, district, rng));
          } else {
            const w = floatBetween(rng, 150, 220);
            const h = (y1 - y0) * 0.42;
            buildings.push(makeBuilding(cx - w / 2, y0 + k * ((y1 - y0) * 0.58), w, h, district, rng));
          }
        }
      } else {
        const w = (x1 - x0) * 0.44;
        const h = (y1 - y0) * 0.44;
        for (let gx = 0; gx < 2; gx += 1) {
          for (let gy = 0; gy < 2; gy += 1) {
            buildings.push(makeBuilding(x0 + gx * (w + 12), y0 + gy * (h + 12), w, h, district, rng));
          }
        }
      }

      // A palm or two on the block corners, clear of the buildings.
      if (rng() < 0.7) {
        trees.push({ x: x0 + 12, y: y0 + 12, r: 11, palm: rng() < 0.6 });
        trees.push({ x: x1 - 12, y: y1 - 12, r: 11, palm: rng() < 0.6 });
      }
    }
  }

  // Street lamps along every road, every other block.
  for (const c of centers) {
    for (let i = 0; i < ROAD_COUNT - 1; i += 1) {
      const along = centers[i] + ROAD_GAP / 2;
      lamps.push({ x: c + halfRoad + 6, y: along });
      lamps.push({ x: along, y: c - halfRoad - 6 });
    }
  }

  // The beach: a sand strip and water along the south edge, with the pier.
  const beach = { x0: 0, y0: WORLD_SIZE - 130, x1: WORLD_SIZE, y1: WORLD_SIZE };
  // Boats bobbing in the marina water, south-west.
  for (let i = 0; i < 7; i += 1) {
    boats.push({
      x: floatBetween(rng, 300, 1600),
      y: WORLD_SIZE - 95 + floatBetween(rng, -8, 8),
      angle: floatBetween(rng, -0.3, 0.3),
      size: floatBetween(rng, 26, 44),
      color: pick(rng, ['#f1c40f', '#ecf0f1', '#e74c3c', '#3498db']),
      bob: floatBetween(rng, 0, Math.PI * 2),
    });
  }
  // The pier: planks out into the water at the Marina Pier landmark.
  const pier = { x: LANDMARKS.pier.x - 14, y: LANDMARKS.pier.y, w: 28, h: 220 };
  // The lighthouse, on the sand at the south-west corner.
  const lighthouse = { x: LANDMARKS.lighthouse.x, y: LANDMARKS.lighthouse.y };
  // The Solmar Plaza fountain — a roundabout in the middle of the square —
  // and beach umbrellas on the sand, clear of the pier.
  const fountain = { x: LANDMARKS.plaza.x, y: LANDMARKS.plaza.y, r: 42 };
  const umbrellas = [];
  for (let i = 0; i < 8; i += 1) {
    umbrellas.push({
      x: floatBetween(rng, 800, 3400),
      y: WORLD_SIZE - 100 + floatBetween(rng, -12, 12),
      color: pick(rng, ['#e74c3c', '#f1c40f', '#3498db', '#e84393']),
      tilt: floatBetween(rng, -0.4, 0.4),
    });
  }

  // Sun-coin spots: spread over the city, always on a sidewalk or park,
  // never inside a building.
  const coins = [];
  let guard = 0;
  while (coins.length < COIN_COUNT && guard < 400) {
    guard += 1;
    const x = floatBetween(rng, 250, 3350);
    const y = floatBetween(rng, 250, 3350);
    if (isOnRoad(x, y)) continue;
    if (rectHitsBuildingRaw(buildings, x, y, 20, 20)) continue;
    if (coins.some((c) => Math.hypot(c.x - x, c.y - y) < 300)) continue;
    coins.push({ x, y, taken: false });
  }

  return { buildings, trees, lamps, parks, beach, boats, pier, lighthouse, fountain, umbrellas, coins, centers };
}

function makeBuilding(x, y, w, h, district, rng) {
  const color = pick(rng, district.palette);
  const downtown = district.name === 'Downtown';
  const tower = downtown && rng() < 0.35;
  return {
    x, y, w, h,
    color,
    roof: shade(color, -18),
    side: shade(color, -42),
    height: tower ? intBetween(rng, 6, 10) : intBetween(rng, 1, downtown ? 4 : 3),
    windows: intBetween(rng, 2, 5),
    district: district.name,
    tower,
  };
}

// Darken a #rrggbb colour by an amount (negative = darker).
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amount));
  return `rgb(${r},${g},${b})`;
}

function rectHitsBuildingRaw(buildings, x, y, hw, hh) {
  for (const b of buildings) {
    if (x - hw < b.x + b.w && x + hw > b.x && y - hh < b.y + b.h && y + hh > b.y) return b;
  }
  return null;
}

// Circle (x, y, radius) vs building rectangles: push the circle out and
// return the corrected position. Used for the player and pedestrians.
export function collideCircleBuildings(city, x, y, radius) {
  for (const b of city.buildings) {
    const closestX = Math.max(b.x, Math.min(x, b.x + b.w));
    const closestY = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - closestX;
    const dy = y - closestY;
    const distSq = dx * dx + dy * dy;
    if (distSq < radius * radius) {
      if (distSq > 0.01) {
        const dist = Math.sqrt(distSq);
        x = closestX + (dx / dist) * radius;
        y = closestY + (dy / dist) * radius;
      } else {
        // Centre inside the building: push out along the smallest overlap.
        const pushLeft = x - b.x + radius;
        const pushRight = b.x + b.w - x + radius;
        const pushUp = y - b.y + radius;
        const pushDown = b.y + b.h - y + radius;
        const m = Math.min(pushLeft, pushRight, pushUp, pushDown);
        if (m === pushLeft) x = b.x - radius;
        else if (m === pushRight) x = b.x + b.w + radius;
        else if (m === pushUp) y = b.y - radius;
        else y = b.y + b.h + radius;
      }
    }
  }
  return { x, y };
}

// Axis-aligned rectangle (a car) vs buildings: returns true on overlap.
export function rectHitsBuilding(city, x, y, hw, hh) {
  return rectHitsBuildingRaw(city.buildings, x, y, hw, hh);
}

export { LANDMARKS };
