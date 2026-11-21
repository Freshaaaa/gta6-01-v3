// Solmar Bay 3D — combat: fists / pistol / SMG, click to shoot (tracer +
// muzzle flash), ammo + reload, damage to peds and police cars. Written fresh
// for the gta6-01 3D rebuild (branch v12-3d, systems build).
import * as THREE from 'three';

const WEAPONS = [
  { name: 'Fists', mag: Infinity, magSize: Infinity },
  { name: 'Pistol', mag: 12, magSize: 12 },
  { name: 'SMG', mag: 30, magSize: 30 },
];

export class Weapons {
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx; // {camera, getPlayer, peds, police, traffic, audio, addWanted}
    this.current = 0;
    this.ammo = [Infinity, 12, 30]; // magazine
    this.reserve = [Infinity, 48, 120];
    this.reloading = false;
    this.reloadT = 0;
    this.flash = null;
    this.flashT = 0;
    this.tracer = null;
    this.tracerT = 0;
    this.shotCooldown = 0;
  }

  get name() { return WEAPONS[this.current].name; }

  hudText() {
    if (this.current === 0) return 'Fists';
    const a = this.ammo[this.current], r = this.reserve[this.current];
    return `${WEAPONS[this.current].name} ${a}/${r}${this.reloading ? ' — reloading…' : ''}`;
  }

  switchTo(i) {
    if (i < 0 || i > 2 || i === this.current) return;
    this.current = i;
    this.reloading = false;
    this.ctx.audio.playClick();
    this.ctx.onWeaponChange?.(this.hudText());
  }

  reload() {
    if (this.current === 0 || this.reloading) return;
    if (this.ammo[this.current] === WEAPONS[this.current].magSize) return;
    if (this.reserve[this.current] <= 0) return;
    this.reloading = true;
    this.reloadT = 0.9;
    this.ctx.audio.playReload();
  }

  // Muzzle position: in front of the player (or the driven car).
  muzzlePos() {
    const p = this.ctx.getPlayer();
    if (p.inCar && p.car) {
      return { x: p.car.x + Math.sin(p.car.heading) * 2.4, y: 1.0, z: p.car.z + Math.cos(p.car.heading) * 2.4 };
    }
    return { x: p.x + Math.sin(p.yaw) * 0.9, y: 1.5, z: p.z + Math.cos(p.yaw) * 0.9 };
  }

  shoot() {
    if (this.current === 0) return false; // fists: use punch()
    if (this.reloading || this.shotCooldown > 0) return false;
    if (this.ammo[this.current] <= 0) { this.ctx.audio.playClick(); this.reload(); return false; }
    this.ammo[this.current]--;
    this.shotCooldown = this.current === 2 ? 0.09 : 0.28;
    // Aim from Dante's eye along his CAMERA yaw (camYaw), NOT his body yaw:
    // body yaw only updates while walking, so after exiting a car it is
    // stale (0) while camYaw tracks the car heading — aiming along body yaw
    // shoots 90° away from where the camera (and the ped ahead) points.
    // The chase camera looks down, so a screen-centre ray would hit the
    // ground a few metres ahead and never reach a ped 8m away.
    const p = this.ctx.getPlayer();
    const origin = new THREE.Vector3(p.x, 1.4, p.z);
    const dir = new THREE.Vector3(Math.sin(p.camYaw), 0, Math.cos(p.camYaw));
    const m = this.muzzlePos();
    const muzzle = new THREE.Vector3(m.x, m.y, m.z);
    // Find the nearest hittable target near Dante's facing.
    let best = null, bd = 70;
    const consider = (x, y, z, obj) => {
      const v = new THREE.Vector3(x - origin.x, y - origin.y, z - origin.z);
      const d = v.length();
      if (d > bd || d < 1) return;
      v.normalize();
      if (v.dot(dir) < 0.985) return; // ~10 degrees off-centre
      bd = d; best = { x, y, z, obj, d };
    };
    for (const p of this.ctx.peds.peds) {
      if (p.state === 'fallen') continue;
      consider(p.x, 1.2, p.z, { type: 'ped', ref: p });
    }
    for (const pc of this.ctx.police.cars) {
      if (pc.hp <= 0) continue;
      consider(pc.car.x, 1.0, pc.car.z, { type: 'policeCar', ref: pc.car });
    }
    for (const tc of this.ctx.traffic.cars) {
      if (tc.disabled) continue;
      consider(tc.car.x, 1.0, tc.car.z, { type: 'trafficCar', ref: tc.car });
    }
    const end = best ? new THREE.Vector3(best.x, best.y, best.z) : origin.clone().add(dir.clone().multiplyScalar(60));
    this.showTracer(muzzle, end);
    this.showFlash(muzzle);
    this.ctx.onShot?.({ x: muzzle.x, z: muzzle.z });
    this.ctx.audio.playShot();
    if (best) this.applyHit(best.obj);
    this.ctx.addWanted(1);
    this.ctx.onWeaponChange?.(this.hudText());
    return true;
  }

  applyHit(obj) {
    if (obj.type === 'ped') {
      this.ctx.peds.knockDown(obj.ref);
    } else if (obj.type === 'policeCar') {
      this.ctx.police.damageCar(obj.ref, 25);
    } else if (obj.type === 'trafficCar') {
      this.ctx.traffic.damageCar(obj.ref, 25);
    }
  }

  // Fists: hit the nearest ped/cop right in front of the player.
  punch() {
    const p = this.ctx.getPlayer();
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    let best = null, bd = 2.4;
    for (const ped of this.ctx.peds.peds) {
      if (ped.state === 'fallen') continue;
      const dx = ped.x - p.x, dz = ped.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < bd && (dx * fx + dz * fz) / Math.max(d, 0.01) > 0.3) { bd = d; best = ped; }
    }
    if (best) {
      this.ctx.peds.knockDown(best);
      this.ctx.audio.playPunch();
      this.ctx.addWanted(1);
      return true;
    }
    this.ctx.audio.playPunch();
    return false;
  }

  showTracer(from, to) {
    if (this.tracer) this.scene.remove(this.tracer);
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    this.tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 }));
    this.scene.add(this.tracer);
    this.tracerT = 0.09;
  }

  showFlash(pos) {
    if (!this.flash) {
      this.flash = new THREE.PointLight(0xffc860, 0, 9, 1.5);
      this.scene.add(this.flash);
    }
    this.flash.position.copy(pos);
    this.flash.intensity = 14;
    this.flashT = 0.06;
  }

  update(dt) {
    if (this.shotCooldown > 0) this.shotCooldown -= dt;
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.reloading = false;
        const w = WEAPONS[this.current];
        const need = w.magSize - this.ammo[this.current];
        const take = Math.min(need, this.reserve[this.current]);
        this.ammo[this.current] += take;
        this.reserve[this.current] -= take;
        this.ctx.onWeaponChange?.(this.hudText());
      }
    }
    if (this.tracerT > 0) {
      this.tracerT -= dt;
      if (this.tracerT <= 0 && this.tracer) {
        this.scene.remove(this.tracer);
        this.tracer.geometry.dispose();
        this.tracer = null;
      }
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flash) this.flash.intensity = Math.max(0, this.flashT / 0.06) * 14;
    }
  }
}
