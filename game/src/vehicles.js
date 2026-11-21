// Solmar Bay 3D — vehicles: box-built low-poly cars, arcade bicycle-model
// physics, stealable parked cars. Written fresh for the gta6-01 3D rebuild.
import * as THREE from 'three';
import { mulberry32 } from './engine.js';

export const MODELS = {
  sedan:  { name: 'Primo',   top: 34, accel: 13, turn: 1.9, w: 1.9, l: 4.4, h: 1.35, cab: 0.62, color: 0xc8ccd4 },
  coupe:  { name: 'Vela',    top: 38, accel: 15, turn: 2.1, w: 1.85, l: 4.1, h: 1.2, cab: 0.55, color: 0xd84a4a },
  taxi:   { name: 'Cab',     top: 32, accel: 12, turn: 2.0, w: 1.9, l: 4.4, h: 1.4, cab: 0.62, color: 0xf2c230 },
  van:    { name: 'Hauler',  top: 28, accel: 10, turn: 1.6, w: 2.0, l: 5.0, h: 1.9, cab: 0.8, color: 0x7a8a9a },
  sports: { name: 'Comet',   top: 48, accel: 19, turn: 2.4, w: 1.95, l: 4.3, h: 1.05, cab: 0.5, color: 0x37e0c8 },
};

function buildCarMesh(model, color) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x18242e, roughness: 0.15, metalness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(model.w, model.h * 0.55, model.l), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(model.w * 0.86, model.h * 0.55, model.l * 0.45), glass);
  cabin.position.set(0, model.h * 0.82, -model.l * 0.06);
  cabin.castShadow = true;
  g.add(cabin);
  // Wheels: cylinders that spin and steer (front pair).
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const wheels = [];
  const wx = model.w / 2 - 0.05, wz = model.l / 2 - 0.75;
  for (const [sx, sz, front] of [[-wx, wz, true], [wx, wz, true], [-wx, -wz, false], [wx, -wz, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx, 0.36, sz);
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.castShadow = true;
    pivot.add(wheel);
    g.add(pivot);
    wheels.push({ pivot, wheel, front });
  }
  // Headlights (emissive) + taillights.
  const hlMat = new THREE.MeshStandardMaterial({ color: 0xfff6c0, emissive: 0xffe9a0, emissiveIntensity: 2 });
  const tlMat = new THREE.MeshStandardMaterial({ color: 0xaa1010, emissive: 0xff2020, emissiveIntensity: 1.2 });
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), hlMat);
    hl.position.set(sx * (model.w / 2 - 0.35), 0.62, model.l / 2 + 0.02);
    g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), tlMat);
    tl.position.set(sx * (model.w / 2 - 0.35), 0.62, -model.l / 2 - 0.02);
    g.add(tl);
  }
  // Taxi sign.
  if (model === MODELS.taxi) {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.22, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffd23e, emissiveIntensity: 1.5 }),
    );
    sign.position.set(0, model.h * 1.12, 0);
    g.add(sign);
  }
  return { group: g, wheels };
}

export class Vehicle {
  constructor(scene, modelKey, x, z, heading, color) {
    this.modelKey = modelKey;
    this.model = MODELS[modelKey];
    this.color = color ?? this.model.color;
    const { group, wheels } = buildCarMesh(this.model, this.color);
    this.group = group;
    this.wheels = wheels;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = heading;
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0;       // m/s, forward positive
    this.steer = 0;       // smoothed steering angle
    this.driven = false;
    this.headlight = null;
    scene.add(group);
  }

  // Arcade bicycle model. input: {throttle (-1..1), steer (-1..1), handbrake}
  update(dt, input, city) {
    const m = this.model;
    const targetSteer = (input?.steer ?? 0) * 0.55;
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 8);
    const throttle = input?.throttle ?? 0;
    if (throttle > 0) this.speed += m.accel * throttle * dt;
    else if (throttle < 0) this.speed += m.accel * 1.4 * throttle * dt; // brake/reverse stronger
    // Drag + rolling resistance.
    this.speed -= this.speed * (input?.handbrake ? 1.6 : 0.35) * dt;
    if (Math.abs(this.speed) < 0.05 && throttle === 0) this.speed = 0;
    this.speed = Math.max(-12, Math.min(m.top, this.speed));
    // Bicycle model: heading rate grows with speed and steering.
    const wheelbase = m.l * 0.62;
    const grip = input?.handbrake ? 0.45 : 1;
    this.heading += (this.speed / wheelbase) * Math.tan(this.steer) * grip * dt;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let nx = this.x + fx * this.speed * dt;
    let nz = this.z + fz * this.speed * dt;
    // Handbrake drift: slide sideways a touch.
    if (input?.handbrake && Math.abs(this.speed) > 8) {
      nx += Math.cos(this.heading) * this.speed * 0.12 * dt * (this.steer >= 0 ? 1 : -1);
      nz += -Math.sin(this.heading) * this.speed * 0.12 * dt * (this.steer >= 0 ? 1 : -1);
    }
    // Building collision: AABB push-out, kills speed on a hard hit.
    const hit = city.collideCircle(nx, nz, Math.max(m.w, m.l) * 0.42);
    if (hit.hit && Math.abs(this.speed) > 10) this.speed *= 0.45;
    this.x = hit.x; this.z = hit.z;
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
    // Wheels spin with speed; front wheels steer.
    const spin = (this.speed * dt) / 0.36;
    for (const w of this.wheels) {
      w.wheel.rotation.x += spin;
      if (w.front) w.pivot.rotation.y = this.steer * 0.9;
    }
  }

  setHeadlight(on) {
    if (on && !this.headlight) {
      const s = new THREE.SpotLight(0xffe9a0, 60, 40, 0.5, 0.5, 1.2);
      s.position.set(0, 0.7, this.model.l / 2);
      const tgt = new THREE.Object3D();
      tgt.position.set(0, 0, 12);
      this.group.add(tgt);
      s.target = tgt;
      this.group.add(s);
      this.headlight = s;
    } else if (!on && this.headlight) {
      this.group.remove(this.headlight);
      this.headlight = null;
    }
  }
}

export class VehicleManager {
  constructor(scene, city, seed = 21) {
    this.scene = scene;
    this.city = city;
    this.rng = mulberry32(seed);
    this.cars = [];
    const keys = Object.keys(MODELS);
    for (let i = 0; i < 26; i++) {
      const spot = city.randomParkedSpot(this.rng);
      const key = keys[Math.floor(this.rng() * keys.length)];
      const car = new Vehicle(scene, key, spot.x, spot.z, spot.heading);
      car.parked = true;
      this.cars.push(car);
    }
  }

  nearestCar(x, z, maxDist = 4) {
    let best = null, bd = maxDist;
    for (const c of this.cars) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  update(dt, drivenCar, input) {
    for (const c of this.cars) {
      if (c === drivenCar) c.update(dt, input, this.city);
      // Parked cars sit still.
    }
  }
}
