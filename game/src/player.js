// Solmar Bay 3D — player: low-poly box humanoid, third-person on-foot
// movement, camera orbit, enter/exit cars, punch. Written fresh for the
// gta6-01 3D rebuild (branch v12-3d).
import * as THREE from 'three';

const WALK_SPEED = 4.2;
const SPRINT_SPEED = 8.0;

function box(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
  );
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export class Player {
  constructor(scene) {
    this.group = new THREE.Group();
    // Dante: teal shirt, dark jeans, skin head, cap.
    this.torso = box(0.62, 0.72, 0.34, 0x1f8a8a, 0, 1.12, 0);
    this.head = box(0.42, 0.42, 0.4, 0xd8a878, 0, 1.68, 0);
    const cap = box(0.46, 0.14, 0.44, 0x222831, 0, 1.92, 0);
    this.armL = box(0.18, 0.66, 0.2, 0x1f8a8a, -0.42, 1.12, 0);
    this.armR = box(0.18, 0.66, 0.2, 0x1f8a8a, 0.42, 1.12, 0);
    this.legL = box(0.22, 0.72, 0.24, 0x2c3550, -0.16, 0.38, 0);
    this.legR = box(0.22, 0.72, 0.24, 0x2c3550, 0.16, 0.38, 0);
    // Pivot the limbs at the shoulder/hip so the walk swing looks right:
    // geometry hangs DOWN from the pivot (translate by -half height).
    for (const [limb, half] of [[this.armL, 0.33], [this.armR, 0.33], [this.legL, 0.36], [this.legR, 0.36]]) {
      limb.geometry.translate(0, -half, 0);
    }
    this.armL.position.y = 1.45; this.armR.position.y = 1.45;
    this.legL.position.y = 0.74; this.legR.position.y = 0.74;
    this.group.add(this.torso, this.head, cap, this.armL, this.armR, this.legL, this.legR);
    scene.add(this.group);

    this.x = 0; this.z = 26; this.y = 0;
    this.vy = 0; this.grounded = true;
    this.yaw = 0;          // facing (radians)
    this.camYaw = 0;       // camera orbit yaw
    this.camPitch = 0.32;  // camera orbit pitch
    this.walkPhase = 0;
    this.moving = false;
    this.punchT = 0;
    this.inCar = null;
    this.group.position.set(this.x, 0, this.z);
  }

  // input: {f, b, l, r, sprint, jump} — camera-relative. Returns speed.
  update(dt, input, city) {
    if (this.inCar) return 0;
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
    let mx = 0, mz = 0;
    if (input.f) { mx += fx; mz += fz; }
    if (input.b) { mx -= fx; mz -= fz; }
    if (input.r) { mx += rx; mz += rz; }
    if (input.l) { mx -= rx; mz -= rz; }
    const len = Math.hypot(mx, mz);
    this.moving = len > 0;
    const speed = input.sprint ? SPRINT_SPEED : WALK_SPEED;
    if (this.moving) {
      mx /= len; mz /= len;
      const nx = this.x + mx * speed * dt;
      const nz = this.z + mz * speed * dt;
      const hit = city.collideCircle(nx, nz, 0.5);
      this.x = hit.x; this.z = hit.z;
      this.yaw = Math.atan2(mx, mz);
      this.walkPhase += dt * (input.sprint ? 11 : 7);
    }
    // Jump + gravity.
    if (input.jump && this.grounded) { this.vy = 6.5; this.grounded = false; }
    if (!this.grounded) {
      this.vy -= 18 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; this.grounded = true; }
    }
    // Punch swing timer.
    if (this.punchT > 0) this.punchT -= dt;
    // Pose.
    const swing = this.moving ? Math.sin(this.walkPhase) * 0.55 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;
    if (this.punchT > 0) this.armR.rotation.x = -1.9; // arm extended forward
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.yaw;
    return this.moving ? speed : 0;
  }

  punch() { if (this.punchT <= 0) this.punchT = 0.35; }

  enterCar(car) {
    this.inCar = car;
    car.driven = true;
    car.parked = false;
    this.group.visible = false;
  }

  exitCar() {
    const car = this.inCar;
    if (!car) return;
    this.inCar = null;
    car.driven = false;
    // Step out to the driver's side.
    const sx = Math.cos(car.heading), sz = -Math.sin(car.heading);
    this.x = car.x + sx * 1.8;
    this.z = car.z + sz * 1.8;
    this.y = 0; this.vy = 0; this.grounded = true;
    this.camYaw = car.heading;
    this.group.visible = true;
    this.group.position.set(this.x, 0, this.z);
  }
}
