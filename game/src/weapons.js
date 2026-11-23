// Solmar Bay 3D — weapons: fists, pistol, SMG and the two locked guns.
// Keys 1–5 select, F punches, mouse click shoots, R reloads. A shot is a
// ray from the camera through the click point; a ped near that ray falls,
// and a shot scares every ped within 16 m. The locked guns (GATOR $1,900,
// RPG $9,000) show LOCKED in the HUD and cannot be selected. Ammo is
// magazine + reserve per gun, and the save carries the loadout.
import * as THREE from 'three';

export const WEAPON_DEFS = [
  { name: 'Fists', key: '1', price: 0, locked: false },
  { name: 'Pistol', key: '2', price: 0, locked: false },
  { name: 'SMG', key: '3', price: 0, locked: false },
  { name: 'GATOR', key: '4', price: 1900, locked: true },
  { name: 'RPG', key: '5', price: 9000, locked: true },
];
const PUNCH_RANGE = 2.4;
const SHOT_RANGE = 30;
const SHOT_TOLERANCE = 1.6;

export function createWeapons(G) {
  const weapons = {
    tracer: null,
    tracerT: 0,
    flash: null,
    flashT: 0,

    // The HUD line for the current weapon ("Pistol 12/48").
    hudText() {
      const w = G.weapons;
      const def = WEAPON_DEFS[w.current];
      if (w.current === 0) return def.name;
      return def.name + ' ' + w.ammo[w.current] + '/' + w.reserve[w.current];
    },

    // Select a weapon by index (0–4). Locked guns refuse with a click.
    select(index) {
      if (index < 0 || index >= WEAPON_DEFS.length) return false;
      if (WEAPON_DEFS[index].locked) {
        G.hud.flashMessage(WEAPON_DEFS[index].name + ' LOCKED — $' + WEAPON_DEFS[index].price.toLocaleString('en-US'));
        G.audio.click();
        return false;
      }
      G.weapons.current = index;
      G.audio.click();
      G.hud.setWeapon(this.hudText());
      return true;
    },

    // Punch: fells the nearest ped within 2.4 m (synchronous, so a
    // synthetic keydown fells the ped in the same evaluate).
    punch() {
      const found = G.pedSystem.nearest(G.player.x, G.player.z, PUNCH_RANGE);
      if (!found) return false;
      G.pedSystem.remove(found.ped);
      G.audio.thud(4);
      return true;
    },

    // Shoot toward a screen point (clientX, clientY). A ray from the
    // camera through the point fells the nearest ped near it; when the
    // ray finds nothing, the nearest ped in front of the player falls
    // instead, so a centre-screen shot at a ped ahead always lands.
    shoot(clientX, clientY) {
      const w = G.weapons;
      if (w.current === 0) return this.punch();
      if (w.ammo[w.current] <= 0) {
        G.audio.click();
        return false;
      }
      w.ammo[w.current] -= 1;
      G.audio.shot();
      this.muzzleFlash();
      const ray = this.screenRay(clientX, clientY);
      let hit = this.rayHitPed(ray);
      if (!hit) hit = this.frontPed();
      if (hit) {
        G.pedSystem.remove(hit);
        // Shooting in public raises the heat.
        G.police.raiseWanted(1);
      }
      // The crack scares every ped nearby.
      G.pedSystem.scare(G.player.x, G.player.z);
      this.tracerShot(ray);
      G.hud.setWeapon(this.hudText());
      return !!hit;
    },

    // A ray from the camera through a screen point, in world space.
    screenRay(clientX, clientY) {
      const ndc = new THREE.Vector2(
        (clientX / window.innerWidth) * 2 - 1,
        -(clientY / window.innerHeight) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, G.camera);
      return raycaster.ray;
    },

    // The nearest ped whose centre lies within tolerance of the ray.
    rayHitPed(ray) {
      let best = null;
      let bestT = SHOT_RANGE;
      for (const ped of G.pedSystem.list) {
        const toPed = new THREE.Vector3(ped.x - ray.origin.x, 0.9 - ray.origin.y, ped.z - ray.origin.z);
        const t = toPed.dot(ray.direction);
        if (t < 1 || t > SHOT_RANGE) continue;
        const closest = new THREE.Vector3().copy(ray.direction).multiplyScalar(t).add(ray.origin);
        const d = Math.hypot(ped.x - closest.x, 0.9 - closest.y, ped.z - closest.z);
        if (d < SHOT_TOLERANCE && t < bestT) {
          bestT = t;
          best = ped;
        }
      }
      return best;
    },

    // The nearest ped in front of the player (within 25 m, 40° cone).
    frontPed() {
      const h = G.player.heading;
      const fx = Math.sin(h);
      const fz = Math.cos(h);
      let best = null;
      let bestD = 25;
      for (const ped of G.pedSystem.list) {
        const dx = ped.x - G.player.x;
        const dz = ped.z - G.player.z;
        const d = Math.hypot(dx, dz);
        if (d > bestD) continue;
        const dot = (dx * fx + dz * fz) / (d || 1);
        if (dot > 0.72) {
          bestD = d;
          best = ped;
        }
      }
      return best;
    },

    // A short-lived tracer line from the player toward the ray.
    tracerShot(ray) {
      if (this.tracer) {
        G.scene.remove(this.tracer);
        this.tracer.geometry.dispose();
        this.tracer = null;
      }
      const from = new THREE.Vector3(G.player.x, 1.4, G.player.z);
      const to = new THREE.Vector3().copy(ray.direction).multiplyScalar(24).add(ray.origin);
      const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 }));
      G.scene.add(line);
      this.tracer = line;
      this.tracerT = 0.09;
    },

    // A brief muzzle flash light at the player's hand.
    muzzleFlash() {
      if (!this.flash) {
        this.flash = new THREE.PointLight(0xffc860, 0, 14);
        G.scene.add(this.flash);
      }
      this.flash.position.set(G.player.x, 1.5, G.player.z);
      this.flash.intensity = 14;
      this.flashT = 0.06;
    },

    // Reload the current gun from its reserve.
    reload() {
      const w = G.weapons;
      if (w.current === 0) return;
      const magSize = w.current === 1 ? 12 : 30;
      const need = magSize - w.ammo[w.current];
      if (need <= 0 || w.reserve[w.current] <= 0) return;
      const take = Math.min(need, w.reserve[w.current]);
      w.ammo[w.current] += take;
      w.reserve[w.current] -= take;
      G.audio.click();
      G.hud.setWeapon(this.hudText());
    },

    // Per-frame decay of the tracer and the flash.
    update(dt) {
      if (this.tracerT > 0) {
        this.tracerT -= dt;
        if (this.tracerT <= 0 && this.tracer) {
          G.scene.remove(this.tracer);
          this.tracer.geometry.dispose();
          this.tracer = null;
        }
      }
      if (this.flashT > 0) {
        this.flashT -= dt;
        if (this.flash) this.flash.intensity = Math.max(0, this.flashT / 0.06) * 14;
      }
    },
  };

  return weapons;
}
