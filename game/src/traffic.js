// Solmar Bay 3D — traffic: the 14 circulating cars, the parked cars Dante
// can steal, the staged cars for the cover shot, and the taxi job's cab.
// Traffic cars drive along the streets in lanes, slow for the car ahead,
// and turn at intersections. Parked cars sit at the kerb; the nearest one
// is what nearestCarPos() returns. Staged cars (parkSpots) are placed by
// hand for the cover shot and never move — the chase loop skips them.
import { buildCar, CAR_COLORS } from './vehicles.js';

export const TRAFFIC_COUNT = 14;

// The cover shot's staged cars: five separate cars ahead of the Comet, on
// the main street, each marked staged so nothing moves them mid-shot.
export const PARK_SPOTS = [
  [-3.5, 58],
  [7, 24],
  [0, 72],
  [-6, 40],
  [6.5, 86],
];

const TRAFFIC_MODELS = [
  { color: CAR_COLORS.red, model: 'Coupe', spoiler: true },
  { color: CAR_COLORS.teal, model: 'Sports', spoiler: true },
  { color: CAR_COLORS.grey, model: 'Van', spoiler: false },
  { color: CAR_COLORS.blue, model: 'Sedan', spoiler: false },
  { color: CAR_COLORS.purple, model: 'Coupe', spoiler: true },
];

export function createTraffic(G) {
  const rng = G.rng;
  const traffic = {
    cars: [],
    parked: [],
    staged: [],
    taxi: null,

    // Spawn the circulating fleet: 14 cars on random streets, in lanes.
    spawnFleet() {
      for (let i = 0; i < TRAFFIC_COUNT; i++) {
        const spec = TRAFFIC_MODELS[i % TRAFFIC_MODELS.length];
        const car = buildCar(G, { color: spec.color, model: spec.model, spoiler: spec.spoiler });
        // Pick a street and a lane offset (right-hand driving).
        const horizontal = rng() < 0.5;
        const street = Math.floor(rng() * 9 - 4) * 52;
        const along = (rng() * 2 - 1) * 240;
        const lane = (rng() < 0.5 ? 1 : -1) * 3.5;
        if (horizontal) {
          car.x = along;
          car.z = street + lane;
          car.heading = lane > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else {
          car.x = street + lane;
          car.z = along;
          car.heading = lane > 0 ? 0 : Math.PI;
        }
        car.speed = 8 + rng() * 7;
        car.sync();
        G.scene.add(car.group);
        car.userData = { cruise: car.speed, turnAt: null };
        this.cars.push(car);
      }
      G.trafficCars = this.cars;
    },

    // Parked cars at the kerb, for stealing. One sits near the start so
    // the first steal is a short walk.
    spawnParked() {
      const spots = [
        [10, 4, 0], [-12, -30, Math.PI], [12, 60, 0], [-10, 104, Math.PI],
        [10, -60, 0], [-12, 156, Math.PI], [12, -104, 0], [-10, -156, Math.PI],
        [10, 208, 0], [-12, -208, Math.PI], [62, 10, Math.PI / 2], [-62, -12, -Math.PI / 2],
      ];
      for (const [x, z, heading] of spots) {
        const spec = TRAFFIC_MODELS[Math.floor(rng() * TRAFFIC_MODELS.length)];
        const car = buildCar(G, { color: spec.color, model: spec.model, spoiler: spec.spoiler });
        car.x = x;
        car.z = z;
        car.heading = heading;
        car.speed = 0;
        car.sync();
        G.scene.add(car.group);
        this.parked.push(car);
      }
      G.parkedCars = this.parked;
    },

    // The taxi: a yellow cab that the taxi job uses. It circulates until
    // Dante takes it, then it becomes the fare car.
    spawnTaxi() {
      const cab = buildCar(G, { color: CAR_COLORS.yellow, model: 'Taxi', taxi: true, spoiler: false });
      cab.x = 62;
      cab.z = -60;
      cab.heading = Math.PI / 2;
      cab.speed = 9;
      cab.sync();
      G.scene.add(cab.group);
      cab.userData = { cruise: 9 };
      this.taxi = cab;
      G.taxiCar = cab;
      return cab;
    },

    // Place the five staged cars for the cover shot. They are separate,
    // on the main street ahead of the Comet, and never move.
    stageCoverCars() {
      for (const [x, z] of PARK_SPOTS) {
        const spec = TRAFFIC_MODELS[Math.floor(rng() * TRAFFIC_MODELS.length)];
        const car = buildCar(G, { color: spec.color, model: spec.model, spoiler: spec.spoiler, staged: true });
        car.x = x;
        car.z = z;
        car.heading = 0;
        car.speed = 0;
        car.staged = true;
        car.sync();
        G.scene.add(car.group);
        this.staged.push(car);
      }
      return this.staged;
    },

    // The nearest parked car to a point (what the steal prompt reads).
    nearestParked(x, z) {
      let best = null;
      let bestD = Infinity;
      for (const car of this.parked) {
        const d = Math.hypot(car.x - x, car.z - z);
        if (d < bestD) {
          bestD = d;
          best = car;
        }
      }
      return best ? { car: best, dist: bestD } : null;
    },

    // One fixed step: traffic drives its lane, slows for the car ahead,
    // and turns at intersections. Staged cars are skipped entirely.
    update(dt) {
      for (const car of this.cars) {
        if (car.staged) continue;
        // Slow for the car ahead in the same lane.
        let ahead = Infinity;
        for (const other of this.cars) {
          if (other === car) continue;
          const dx = other.x - car.x;
          const dz = other.z - car.z;
          const fwd = Math.sin(car.heading) * dx + Math.cos(car.heading) * dz;
          const lat = Math.cos(car.heading) * dx - Math.sin(car.heading) * dz;
          if (fwd > 0 && fwd < 14 && Math.abs(lat) < 3) ahead = Math.min(ahead, fwd);
        }
        const playerCar = G.player.car;
        if (playerCar && playerCar !== car) {
          const dx = playerCar.x - car.x;
          const dz = playerCar.z - car.z;
          const fwd = Math.sin(car.heading) * dx + Math.cos(car.heading) * dz;
          const lat = Math.cos(car.heading) * dx - Math.sin(car.heading) * dz;
          if (fwd > 0 && fwd < 14 && Math.abs(lat) < 3) ahead = Math.min(ahead, fwd);
        }
        const target = ahead < 12 ? Math.max(0, (ahead - 5) * 0.8) : car.userData.cruise;
        car.speed += Math.max(-8 * dt, Math.min(6 * dt, target - car.speed));
        car.x += Math.sin(car.heading) * car.speed * dt;
        car.z += Math.cos(car.heading) * car.speed * dt;
        // Turn at intersections: when crossing a street line, sometimes
        // take the turn (left or right) instead of going straight.
        const nearX = Math.round(car.x / 52) * 52;
        const nearZ = Math.round(car.z / 52) * 52;
        const onIntersection = Math.abs(car.x - nearX) < 2.5 && Math.abs(car.z - nearZ) < 2.5;
        if (onIntersection && !car.userData.turnAt) {
          car.userData.turnAt = car.heading;
          if (rng() < 0.45) {
            car.heading += (rng() < 0.5 ? 1 : -1) * Math.PI / 2;
          }
        } else if (!onIntersection) {
          car.userData.turnAt = null;
        }
        // Wrap around the city edge so the fleet never thins out.
        if (car.x > 270) car.x = -270;
        if (car.x < -270) car.x = 270;
        if (car.z > 270) car.z = -270;
        if (car.z < -270) car.z = 270;
        car.sync();
        car.spin(dt);
      }
      // The taxi circulates like traffic until Dante takes it.
      if (this.taxi && G.taxiState === 'idle' && !G.player.inCar) {
        const cab = this.taxi;
        cab.x += Math.sin(cab.heading) * cab.speed * dt;
        cab.z += Math.cos(cab.heading) * cab.speed * dt;
        if (Math.abs(cab.x) > 260 || Math.abs(cab.z) > 260) cab.heading += Math.PI / 2;
        cab.sync();
        cab.spin(dt);
      }
    },
  };

  return traffic;
}
