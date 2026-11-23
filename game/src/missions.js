// Solmar Bay 3D — missions: the 8-mission story arc and the checkpoint
// system. Each mission is a list of steps (steal a car, reach a marker,
// ram the van, grab the cash, lose the heat); finishing the last step pays
// out and unlocks the next mission. The current marker is drawn as a
// glowing beam in the world and a yellow blip on the minimap, and the HUD
// banner names the mission and its next objective.
import * as THREE from 'three';
import { buildCar, CAR_COLORS } from './vehicles.js';

const MARKER_RADIUS = 8;

// The 8 missions: name, payout and the steps that build them.
const MISSION_DEFS = [
  { name: 'Welcome to Solmar', payout: 500, steps: [{ type: 'goto', x: 26, z: 26, text: 'Go to the safehouse' }] },
  { name: 'First Wheels', payout: 800, steps: [
    { type: 'steal', text: 'Steal a car' },
    { type: 'goto', x: -104, z: 104, text: 'Drive to the north-west garage' },
  ] },
  { name: 'Beach Run', payout: 1200, steps: [{ type: 'goto', x: -156, z: 0, text: 'Race to the west checkpoint' }] },
  { name: 'Marina Delivery', payout: 1500, steps: [{ type: 'goto', x: -104, z: -104, text: 'Deliver to the north docks' }] },
  { name: 'Downtown Dash', payout: 2000, steps: [{ type: 'goto', x: 104, z: -104, text: 'Dash to the east tower' }] },
  { name: 'Van Job', payout: 5000, steps: [
    { type: 'ram', text: 'Ram the white van' },
    { type: 'collect', text: 'Grab the cash' },
    { type: 'escape', text: 'Lose the heat' },
  ] },
  { name: 'Harbor Heist', payout: 3000, steps: [
    { type: 'goto', x: 156, z: 156, text: 'Reach the harbor gate' },
    { type: 'goto', x: 0, z: 270, text: 'Reach the beach drop' },
  ] },
  { name: 'The Big Score', payout: 10000, steps: [
    { type: 'steal', text: 'Steal a fast car' },
    { type: 'goto', x: 156, z: -156, text: 'Reach the east vault' },
    { type: 'escape', text: 'Lose the heat' },
  ] },
];

export function createMissions(G) {
  // The checkpoint beam: a tall glowing cylinder at the current marker.
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffc860, transparent: true, opacity: 0.55, depthWrite: false,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true), beamMat);
  beam.position.set(26, 30, 26);
  beam.visible = false;
  G.scene.add(beam);
  const beamRing = new THREE.Mesh(
    new THREE.RingGeometry(3, 4.2, 24),
    new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
  );
  beamRing.rotation.x = -Math.PI / 2;
  beamRing.position.set(26, 0.1, 26);
  beamRing.visible = false;
  G.scene.add(beamRing);

  const missions = {
    defs: MISSION_DEFS,
    van: null,
    cashPos: null,
    // A goto/collect step only completes when Dante ARRIVES at the marker:
    // if he is already standing inside the radius when the step is set
    // (e.g. a reload that spawns him on the safehouse marker), the step
    // stays un-armed until he leaves the radius, then completes on
    // re-entry. Without this a save/load at (26,26) auto-pays m0 (+$500).
    stepArmed: true,

    // Unlock every mission (the playtest's lever).
    unlockAll() {
      G.mission.unlocked = MISSION_DEFS.length;
      G.hud.setMission();
    },

    // Start a mission by index. Refuses anything above `unlocked`, so a
    // fresh profile can only start m0 until it earns the rest.
    startMission(i) {
      if (i < 0 || i >= MISSION_DEFS.length) return false;
      if (i > G.mission.unlocked) return false;
      G.mission.current = i;
      G.mission.step = 0;
      this.van = null;
      this.cashPos = null;
      if (i === 5) this.spawnVan();
      this.updateMarker();
      G.hud.setMission();
      G.hud.showBanner(MISSION_DEFS[i].name + ' — ' + this.stepText());
      return true;
    },

    // The white van for the Van Job, parked on the main street.
    spawnVan() {
      const van = buildCar(G, { color: 0xf0f0f0, model: 'Van', spoiler: false });
      van.x = 0;
      van.z = 104;
      van.heading = 0;
      van.speed = 0;
      van.sync();
      G.scene.add(van.group);
      this.van = van;
      G.vanPos = { x: van.x, z: van.z };
      return van;
    },

    stepDef() {
      const def = MISSION_DEFS[G.mission.current];
      if (!def) return null;
      return def.steps[G.mission.step] || null;
    },

    stepText() {
      const s = this.stepDef();
      return s ? s.text : 'Free roam';
    },

    // The current objective marker (the playtest reads it for teleports).
    updateMarker() {
      const s = this.stepDef();
      if (!s) {
        G.marker = null;
        beam.visible = false;
        beamRing.visible = false;
        G.hud.setObjective('Free roam — explore Solmar Bay');
        return;
      }
      if (s.type === 'goto') {
        G.marker = { x: s.x, z: s.z };
        beam.position.set(s.x, 30, s.z);
        beamRing.position.set(s.x, 0.1, s.z);
        beam.visible = true;
        beamRing.visible = true;
        // Arm only if Dante is not already standing on the marker.
        this.stepArmed = Math.hypot(G.player.x - s.x, G.player.z - s.z) >= MARKER_RADIUS;
      } else if (s.type === 'collect' && this.cashPos) {
        G.marker = { x: this.cashPos.x, z: this.cashPos.z };
        beam.position.set(this.cashPos.x, 30, this.cashPos.z);
        beamRing.position.set(this.cashPos.x, 0.1, this.cashPos.z);
        beam.visible = true;
        beamRing.visible = true;
        this.stepArmed = Math.hypot(G.player.x - this.cashPos.x, G.player.z - this.cashPos.z) >= MARKER_RADIUS;
      } else if (s.type === 'ram' && this.van) {
        G.marker = { x: this.van.x, z: this.van.z };
        beam.position.set(this.van.x, 30, this.van.z);
        beamRing.position.set(this.van.x, 0.1, this.van.z);
        beam.visible = true;
        beamRing.visible = true;
      } else {
        G.marker = null;
        beam.visible = false;
        beamRing.visible = false;
      }
      G.hud.setObjective(this.stepText());
    },

    // Advance one step, or finish the mission (payout + unlock next).
    advance() {
      G.mission.step += 1;
      const def = MISSION_DEFS[G.mission.current];
      if (G.mission.step >= def.steps.length) {
        this.complete(def);
      } else {
        this.updateMarker();
        G.hud.setMission();
      }
    },

    complete(def) {
      G.money += def.payout;
      G.audio.payout();
      G.hud.showBanner(def.name + ' complete — +$' + def.payout.toLocaleString('en-US'));
      G.hud.setMoney(G.money);
      if (G.mission.unlocked < G.mission.current + 1) {
        G.mission.unlocked = G.mission.current + 1;
      }
      // Move on to the next mission, or free roam after the last.
      if (G.mission.current + 1 < MISSION_DEFS.length) {
        G.mission.current += 1;
        G.mission.step = 0;
        if (G.mission.current === 5) this.spawnVan();
        this.updateMarker();
      } else {
        G.mission.step = 0;
        G.marker = null;
        beam.visible = false;
        beamRing.visible = false;
        G.hud.setObjective('All missions complete — free roam');
      }
      G.hud.setMission();
    },

    // Called when Dante enters a car (the steal step).
    onEnterCar() {
      const s = this.stepDef();
      if (s && s.type === 'steal') this.advance();
    },

    // Called when the player's car hits the van (the ram step).
    onRamVan() {
      const s = this.stepDef();
      if (!s || s.type !== 'ram' || !this.van) return;
      // The cash drops where the van was hit.
      this.cashPos = { x: this.van.x, z: this.van.z };
      G.police.raiseWanted(2);
      G.audio.thud(10);
      this.advance();
    },

    // One fixed step: check the current step's condition.
    update() {
      const s = this.stepDef();
      if (!s) return;
      if (s.type === 'goto') {
        const d = Math.hypot(G.player.x - s.x, G.player.z - s.z);
        if (d >= MARKER_RADIUS) this.stepArmed = true;
        else if (this.stepArmed) this.advance();
      } else if (s.type === 'collect' && this.cashPos) {
        const d = Math.hypot(G.player.x - this.cashPos.x, G.player.z - this.cashPos.z);
        if (d >= MARKER_RADIUS) this.stepArmed = true;
        else if (this.stepArmed) this.advance();
      } else if (s.type === 'escape') {
        if (G.wanted === 0) this.advance();
      } else if (s.type === 'ram' && this.van) {
        // The ram: the player's car within 4 m of the van.
        const car = G.player.car;
        if (car) {
          const d = Math.hypot(car.x - this.van.x, car.z - this.van.z);
          if (d < 4.5 && Math.abs(car.speed) > 2) {
            // Shove the van forward so the car can pass over the cash.
            this.van.z += 6;
            this.van.sync();
            this.onRamVan();
          }
        }
      }
      // Spin the beam slowly so it reads as a live checkpoint.
      if (beam.visible) {
        beam.rotation.y += 0.01;
        beamRing.scale.setScalar(1 + Math.sin(G.simTime * 3) * 0.08);
      }
    },
  };

  return missions;
}
