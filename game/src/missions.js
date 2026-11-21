// Solmar Bay 3D — missions + story: 8 story missions (Dante + Mara), taxi
// fares, sun-coin collectibles, 3D objective marker + minimap marker.
// Written fresh for the gta6-01 3D rebuild (branch v12-3d, systems build).
import * as THREE from 'three';
import { Vehicle } from './vehicles.js';
import { makePersonMesh } from './pedestrians.js';
import { BEACH_Z } from './city.js';
import { mulberry32 } from './engine.js';

const SAFEHOUSE = { x: 26, z: 26 };
const CHOPSHOP = { x: -104, z: 104 };
const BANK = { x: -52, z: -52 };

export const MISSION_DEFS = [
  { name: 'Welcome to Solmar', payout: 500 },
  { name: 'First Wheels', payout: 800 },
  { name: 'Beach Run', payout: 1200 },
  { name: 'The Drop', payout: 1500 },
  { name: 'Ironwood Intro', payout: 2000 },
  { name: 'Van Job', payout: 5000 },
  { name: 'Heat', payout: 3000 },
  { name: 'The Big One', payout: 25000 },
];

const COIN_SPOTS = [
  { x: 0, z: BEACH_Z + 20 },
  { x: -156, z: 104 },
  { x: 104, z: -156 },
];

export class Missions {
  constructor(scene, city, ctx) {
    this.scene = scene;
    this.city = city;
    this.ctx = ctx; // {getPlayer, hud, police, audio, addMoney, saveNow, traffic}
    this.rng = mulberry32(123);
    this.unlocked = ctx.unlocked || 0;
    this.current = -1;
    this.step = 0;
    this.missionT = 0;
    this.stepT = 0;
    this.failT = 0;
    this.target = null; // tail target car (m5)
    this.van = null; // money van (m6)
    this.mara = null; // Mara ped (m5)
    this.cashMarker = null;
    this.coinsCollected = new Set(ctx.coinsCollected || []);
    this.taxi = { active: false, phase: 'idle', fare: null, fareMesh: null, dest: null, waitT: 0, fareT: 0 };
    this.buildMarker();
    this.buildCoins();
  }

  buildMarker() {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 34, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 17;
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.1),
      new THREE.MeshBasicMaterial({ color: 0xffd23e }),
    );
    gem.position.y = 4;
    g.add(beam, gem);
    g.visible = false;
    this.scene.add(g);
    this.marker = g;
    this.markerGem = gem;
    this.markerPos = null;
    this.markerColor = 0xffd23e;
  }

  showMarker(x, z, color = 0xffd23e) {
    this.markerPos = { x, z };
    this.marker.position.set(x, 0, z);
    this.marker.visible = true;
    this.markerGem.material.color.setHex(color);
    this.marker.children[0].material.color.setHex(color);
    this.markerColor = color;
  }

  hideMarker() { this.marker.visible = false; this.markerPos = null; }

  buildCoins() {
    this.coins = [];
    const geo = new THREE.TorusGeometry(0.9, 0.32, 10, 20);
    COIN_SPOTS.forEach((s, i) => {
      if (this.coinsCollected.has(i)) return;
      const mat = new THREE.MeshStandardMaterial({ color: 0xffd23e, emissive: 0xa87800, emissiveIntensity: 1.2, metalness: 0.8, roughness: 0.25 });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(s.x, 1.6, s.z);
      this.scene.add(m);
      this.coins.push({ mesh: m, x: s.x, z: s.z, idx: i, phase: i * 2 });
    });
  }

  setObjective(t) { this.ctx.hud.setObjective(t); }

  startMission(i) {
    if (i < 0 || i >= MISSION_DEFS.length || i > this.unlocked) return false;
    this.current = i;
    this.step = 0;
    this.missionT = 0;
    this.stepT = 0;
    this.failT = 0;
    this.cleanupMissionActors();
    this.setupStep();
    return true;
  }

  cleanupMissionActors() {
    if (this.target) { this.scene.remove(this.target.group); this.target = null; }
    if (this.van) { this.scene.remove(this.van.group); this.van = null; }
    if (this.mara) { this.scene.remove(this.mara.group); this.mara = null; }
    if (this.cashMarker) { this.scene.remove(this.cashMarker); this.cashMarker = null; }
    this.hideMarker();
  }

  setupStep() {
    const i = this.current;
    const p = this.ctx.getPlayer();
    if (i === 0) {
      this.showMarker(SAFEHOUSE.x, SAFEHOUSE.z);
      this.setObjective('m1 Welcome to Solmar — go to the safehouse marker');
    } else if (i === 1) {
      this.setObjective('m2 First Wheels — steal any car (E near a car)');
      this.hideMarker();
    } else if (i === 2) {
      this.showMarker(-150, BEACH_Z + 12);
      this.setObjective('m3 Beach Run — drive through the 3 beach checkpoints (75s)');
    } else if (i === 3) {
      this.showMarker(104, -104);
      this.setObjective('m4 The Drop — pick up the package at the marker');
    } else if (i === 4) {
      this.showMarker(52, -52);
      this.setObjective('m5 Ironwood Intro — meet Mara at the marker');
      this.mara = makePersonMesh(0xff7eb8, 0xd8a878);
      this.mara.group.position.set(52, 0, -52);
      this.scene.add(this.mara.group);
    } else if (i === 5) {
      this.van = new Vehicle(this.scene, 'van', 0, -180, 0, 0xd8a020);
      this.van.moneyVan = true;
      this.setObjective('m6 Van Job — ram the gold money van on the main road');
      this.showMarker(0, -180, 0xff9040);
    } else if (i === 6) {
      this.ctx.police.setWanted(3);
      this.setObjective('m7 Heat — survive and lose the 3-star wanted level');
      this.hideMarker();
    } else if (i === 7) {
      this.showMarker(BANK.x, BANK.z);
      this.setObjective('m8 The Big One — reach the bank marker');
    }
  }

  completeStep() {
    this.step++;
    this.stepT = 0;
    this.setupStepContinue();
  }

  setupStepContinue() {
    const i = this.current, s = this.step;
    if (i === 1 && s === 1) {
      this.showMarker(CHOPSHOP.x, CHOPSHOP.z);
      this.setObjective('m2 First Wheels — deliver the car to the chop shop');
    } else if (i === 2 && s === 1) {
      this.showMarker(0, BEACH_Z + 12);
      this.setObjective('m3 Beach Run — checkpoint 2 of 3');
    } else if (i === 2 && s === 2) {
      this.showMarker(150, BEACH_Z + 12);
      this.setObjective('m3 Beach Run — final checkpoint!');
    } else if (i === 3 && s === 1) {
      this.showMarker(-156, 156);
      this.setObjective('m4 The Drop — deliver across town (cops are looking)');
    } else if (i === 4 && s === 1) {
      // Tail the target car: it drives the x=52 road north.
      this.target = new Vehicle(this.scene, 'sedan', 52, -120, 0, 0x7a5ad8);
      this.target.tailTarget = true;
      this.showMarker(52, -120, 0x9a7aff);
      this.setObjective('m5 Ironwood Intro — tail the purple car, stay 10–40m back');
    } else if (i === 5 && s === 1) {
      // Cash on the ground where the van stopped.
      const cm = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.5, 1.1),
        new THREE.MeshStandardMaterial({ color: 0x37e07a, emissive: 0x1a8a4a, emissiveIntensity: 1 }),
      );
      cm.position.set(this.van.x, 0.4, this.van.z);
      this.scene.add(cm);
      this.cashMarker = cm;
      this.showMarker(this.van.x, this.van.z, 0x37e07a);
      this.setObjective('m6 Van Job — grab the cash, then lose the cops');
    } else if (i === 5 && s === 2) {
      this.setObjective('m6 Van Job — lose the wanted level to finish');
      this.hideMarker();
    } else if (i === 7 && s === 1) {
      this.setObjective('m8 The Big One — stay at the bank, the job takes 10s…');
      this.showMarker(BANK.x, BANK.z);
    } else if (i === 7 && s === 2) {
      this.ctx.police.setWanted(4);
      this.showMarker(SAFEHOUSE.x, SAFEHOUSE.z);
      this.setObjective('m8 The Big One — 4 stars! Escape to the safehouse');
    }
  }

  completeMission() {
    const def = MISSION_DEFS[this.current];
    this.ctx.addMoney(def.payout);
    this.ctx.audio.playJingle();
    this.ctx.audio.playCash();
    this.setObjective(`✓ ${def.name} complete — +$${def.payout.toLocaleString('en-US')}`);
    this.unlocked = Math.max(this.unlocked, Math.min(this.current + 1, MISSION_DEFS.length - 1));
    this.cleanupMissionActors();
    this.ctx.saveNow();
    const next = this.current + 1;
    this.current = -1;
    if (next < MISSION_DEFS.length && next <= this.unlocked) {
      this.startMission(next);
    } else if (next >= MISSION_DEFS.length) {
      this.setObjective('All missions complete — Solmar Bay is yours, Dante!');
    }
  }

  failMission(reason) {
    this.setObjective(`✕ Failed: ${reason} — restarting mission…`);
    this.failT = 2.5;
    this.cleanupMissionActors();
    this.ctx.audio.playFail?.();
  }

  atMarker(p, radius = 7) {
    if (!this.markerPos) return false;
    return Math.hypot(p.x - this.markerPos.x, p.z - this.markerPos.z) < radius;
  }

  update(dt) {
    this.missionT += dt;
    this.stepT += dt;
    // Marker gem bob + spin.
    if (this.marker.visible) {
      this.markerGem.position.y = 4 + Math.sin(this.missionT * 2.2) * 0.5;
      this.markerGem.rotation.y += dt * 1.5;
    }
    // Coins spin + bob; collect on touch.
    const p = this.ctx.getPlayer();
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.mesh.rotation.y += dt * 2;
      c.mesh.position.y = 1.6 + Math.sin(this.missionT * 2 + c.phase) * 0.25;
      if (Math.hypot(p.x - c.x, p.z - c.z) < 3.5) {
        this.scene.remove(c.mesh);
        this.coins.splice(i, 1);
        this.coinsCollected.add(c.idx);
        this.ctx.addMoney(250);
        this.ctx.audio.playCash();
        this.setObjective('Sun coin found — +$250');
        this.ctx.saveNow();
      }
    }
    // Fail-restart countdown.
    if (this.failT > 0) {
      this.failT -= dt;
      if (this.failT <= 0) this.startMission(this.current);
      return;
    }
    // Taxi job runs alongside missions.
    this.updateTaxi(dt, p);
    if (this.current < 0) return;
    const i = this.current, s = this.step;
    if (i === 0) {
      if (this.atMarker(p, 8)) this.completeMission();
    } else if (i === 1) {
      if (s === 0 && p.inCar) this.completeStep();
      else if (s === 1 && this.atMarker(p, 8)) this.completeMission();
    } else if (i === 2) {
      const left = 75 - this.missionT;
      this.setObjective(`m3 Beach Run — checkpoint ${s + 1} of 3 (${Math.max(0, Math.ceil(left))}s left)`);
      if (left <= 0) { this.failMission('out of time'); return; }
      if (p.inCar && this.atMarker(p, 9)) {
        if (s === 2) this.completeMission();
        else this.completeStep();
      }
    } else if (i === 3) {
      if (s === 0 && this.atMarker(p, 7)) {
        this.ctx.police.addWanted(1);
        this.completeStep();
      } else if (s === 1 && this.atMarker(p, 8)) this.completeMission();
    } else if (i === 4) {
      if (s === 0 && this.atMarker(p, 7)) {
        this.completeStep();
        if (this.mara) { this.scene.remove(this.mara.group); this.mara = null; }
      } else if (s === 1 && this.target) {
        // Drive the target car north, wrap at the edge.
        this.target.update(dt, { throttle: 0.6, steer: 0, handbrake: false }, this.city);
        if (this.target.z > 260) { this.target.z = -260; this.target.group.position.z = -260; }
        this.showMarker(this.target.x, this.target.z, 0x9a7aff);
        const d = Math.hypot(p.x - this.target.x, p.z - this.target.z);
        this.tailNearT = (this.tailNearT || 0) + (d < 8 ? dt : -dt);
        this.tailNearT = Math.max(0, this.tailNearT);
        if (this.tailNearT > 2) { this.failMission('spotted by the target'); return; }
        this.tailT = (this.tailT || 0) + ((d >= 10 && d <= 40) ? dt : 0);
        this.setObjective(`m5 Ironwood Intro — tail the purple car (${Math.floor(this.tailT || 0)}/20s, ${Math.round(d)}m)`);
        if ((this.tailT || 0) >= 20) this.completeMission();
      }
    } else if (i === 5) {
      if (s === 0 && this.van) {
        // Van drives north on the x=0 road, wraps at the edge.
        this.van.update(dt, { throttle: 0.55, steer: 0, handbrake: false }, this.city);
        if (this.van.z > 260) { this.van.z = -260; this.van.group.position.z = -260; }
        this.showMarker(this.van.x, this.van.z, 0xff9040);
        // Ram check: player car hits the van hard.
        if (p.inCar && p.car) {
          const d = Math.hypot(p.x - this.van.x, p.z - this.van.z);
          if (d < 3.4 && Math.abs(p.car.speed) > 6) {
            this.van.speed = 0;
            this.ctx.police.addWanted(2);
            this.completeStep();
          }
        }
      } else if (s === 1) {
        if (this.atMarker(p, 5)) this.completeStep();
      } else if (s === 2) {
        if (this.ctx.police.wanted === 0) this.completeMission();
      }
    } else if (i === 6) {
      const elapsed = Math.floor(this.missionT);
      this.setObjective(`m7 Heat — survive the heat (${elapsed}s) — lose the cops!`);
      if (this.ctx.police.wanted === 0 && this.missionT > 60) this.completeMission();
    } else if (i === 7) {
      if (s === 0 && this.atMarker(p, 8)) this.completeStep();
      else if (s === 1) {
        if (this.atMarker(p, 8)) {
          if (this.stepT > 10) this.completeStep();
          this.setObjective(`m8 The Big One — cracking the vault… ${Math.ceil(10 - this.stepT)}s (stay in the marker)`);
        } else {
          this.stepT = Math.max(0, this.stepT - dt * 2); // leaving pauses progress
        }
      } else if (s === 2) {
        if (this.atMarker(p, 8) && this.ctx.police.wanted === 0) this.completeMission();
      }
    }
  }

  // --- Taxi fares ---
  updateTaxi(dt, p) {
    const t = this.taxi;
    if (!t.active) return;
    if (t.phase === 'idle') {
      t.waitT -= dt;
      if (t.waitT <= 0) {
        // Spawn a fare on a sidewalk near the player.
        const ang = this.rng() * Math.PI * 2;
        const fx = p.x + Math.cos(ang) * (25 + this.rng() * 30);
        const fz = p.z + Math.sin(ang) * (25 + this.rng() * 30);
        const road = this.city.nearestRoad(fx, fz);
        if (road.alongX) t.fare = { x: road.x, z: road.z + (this.rng() < 0.5 ? 8.5 : -8.5) };
        else t.fare = { x: road.x + (this.rng() < 0.5 ? 8.5 : -8.5), z: road.z };
        t.fareMesh = makePersonMesh(0xe8e8e8, 0xd8a878);
        t.fareMesh.group.position.set(t.fare.x, 0, t.fare.z);
        this.scene.add(t.fareMesh.group);
        t.phase = 'toPickup';
        this.showMarker(t.fare.x, t.fare.z, 0x37e07a);
      }
      return;
    }
    if (t.phase === 'toPickup') {
      if (!p.inCar) { t.fareT += dt; if (t.fareT > 20) this.cancelFare(); return; }
      if (Math.hypot(p.x - t.fare.x, p.z - t.fare.z) < 6) {
        this.scene.remove(t.fareMesh.group);
        t.fareMesh = null;
        const ang = this.rng() * Math.PI * 2;
        const dist = 110 + this.rng() * 90;
        t.dest = { x: Math.max(-250, Math.min(250, p.x + Math.cos(ang) * dist)), z: Math.max(-250, Math.min(250, p.z + Math.sin(ang) * dist)) };
        t.pay = Math.min(400, 150 + Math.round(dist * 1.2));
        t.phase = 'toDrop';
        this.showMarker(t.dest.x, t.dest.z, 0x37e07a);
        this.setObjective(`Taxi — drop the fare at the green marker ($${t.pay})`);
      }
      return;
    }
    if (t.phase === 'toDrop') {
      if (!p.inCar) { t.fareT += dt; if (t.fareT > 20) this.cancelFare(); return; }
      if (Math.hypot(p.x - t.dest.x, p.z - t.dest.z) < 8) {
        this.ctx.addMoney(t.pay);
        this.ctx.audio.playCash();
        this.setObjective(`Taxi fare done — +$${t.pay}`);
        this.hideMarker();
        t.phase = 'idle';
        t.waitT = 8;
        t.fareT = 0;
        this.ctx.saveNow();
      }
    }
  }

  cancelFare() {
    const t = this.taxi;
    if (t.fareMesh) { this.scene.remove(t.fareMesh.group); t.fareMesh = null; }
    t.phase = 'idle';
    t.waitT = 10;
    t.fareT = 0;
    this.hideMarker();
  }

  onEnterCar(car) {
    if (car.modelKey === 'taxi') {
      this.taxi.active = true;
      if (this.taxi.phase === 'idle') this.taxi.waitT = 2;
    }
  }

  onExitCar() {
    // Fare waits a bit, then cancels (handled in updateTaxi via fareT).
  }

  getMinimapExtras() {
    return {
      marker: this.markerPos,
      target: this.target ? { x: this.target.x, z: this.target.z } : null,
      taxi: (this.taxi.phase === 'toPickup' && this.taxi.fare) ? this.taxi.fare : (this.taxi.phase === 'toDrop' ? this.taxi.dest : null),
      coins: this.coins.map((c) => ({ x: c.x, z: c.z })),
    };
  }
}
