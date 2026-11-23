// Solmar Bay 3D — main: the bootstrap, the state machine, the shot
// staging and the playtest API. The game boots to the title screen; Play
// starts driving. ?shot=chase/title/beach/map stages the four screenshots.
// window.__solmar is the whole public surface the playtest and the shot
// scripts drive: plain serialisable values (no THREE objects leak out, so
// CDP and JSON.stringify never choke on a scene graph).
import * as THREE from 'three';
import { createEngine } from './engine.js';
import { createCity } from './city.js';
import { createPlayer } from './player.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createPedestrians } from './pedestrians.js';
import { createWeapons } from './weapons.js';
import { createMissions } from './missions.js';
import { createHelicopter } from './helicopter.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { readSaveString, writeSave, parseSave, applySave } from './save.js';

// A seeded RNG (mulberry32) so a seed always builds the same city.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A soft radial glow texture (sun halo, beacon halo) shared by the city
// and the helicopter so it is built once.
function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const params = new URLSearchParams(window.location.search);
const seed = parseInt(params.get('seed') || '7', 10) || 7;
const lowfx = params.get('lowfx') === '1';
const shot = params.get('shot') || '';

// The shared game state. Every module reads and writes this object; the
// __solmar API below is a plain, serialisable view of it.
const G = {
  rng: mulberry32(seed),
  rand(a, b) { return a + this.rng() * (b - a); },
  lowfx,
  shot,
  exposure: 1.9,
  sunIntensity: 2.6,
  hemiIntensity: 1.45,
  state: 'title',
  simTime: 0,
  timeOfDay: 17.5,
  money: 100,
  wanted: 0,
  chaseDist: 5.5,
  chaseLateral: 1.0,
  autoDrive: false,
  autoSteer: 0,
  frozen: false,
  keys: new Set(),
  player: { x: 0, z: 0, heading: 0, health: 100, inCar: false, car: null },
  mission: { current: 0, unlocked: 0, step: 0 },
  weapons: { current: 0, ammo: [null, 12, 30], reserve: [null, 48, 120] },
  crew: {
    mara: { cd: 0, cdMax: 30 },
    rico: { cd: 0, cdMax: 20, boostT: 0 },
    lena: { cd: 0, cdMax: 45 },
  },
  coinsCollected: [],
  trafficCars: [],
  parkedCars: [],
  policeCars: [],
  pedsList: [],
  taxiCar: null,
  taxiState: 'idle',
  taxiFare: 0,
  marker: null,
  vanPos: null,
  missionTime: 300,
  glowTexture: null,
  step: null,
  events: {},
};
G.glowTexture = makeGlowTexture();

// Load the progressed save (slot 1) before the world is built, so money,
// mission progress and coins are already in place.
applySave(G, parseSave(readSaveString()));

// --- Build the world (each module attaches itself to G) ---
const engine = createEngine(G);
const city = createCity(G);
G.city = city;
const playerSystem = createPlayer(G);
G.playerSystem = playerSystem;
const trafficSystem = createTraffic(G);
G.trafficSystem = trafficSystem;
const police = createPolice(G);
G.police = police;
const pedSystem = createPedestrians(G);
G.pedSystem = pedSystem;
const weaponSystem = createWeapons(G);
G.weaponSystem = weaponSystem;
const missionSystem = createMissions(G);
G.missionSystem = missionSystem;
const heliSystem = createHelicopter(G);
G.heliSystem = heliSystem;
const hud = createHud(G);
G.hud = hud;
const audio = createAudio(G);
G.audio = audio;

trafficSystem.spawnFleet();
trafficSystem.spawnParked();
trafficSystem.spawnTaxi();
pedSystem.spawnCrowd();

// The sun coin: a spinning gold disc on the beach at (0, 270).
const coinGroup = new THREE.Group();
{
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 0.18, 20),
    new THREE.MeshLambertMaterial({ color: 0xe8b83a, emissive: 0xa87810, emissiveIntensity: 0.9 })
  );
  coin.rotation.x = Math.PI / 2;
  coinGroup.add(coin);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.5, 0.1, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.7 })
  );
  coinGroup.add(ring);
  coinGroup.position.set(0, 1.2, 270);
  G.scene.add(coinGroup);
}
const sunCoin = { group: coinGroup, x: 0, z: 270, id: 0 };
if (G.coinsCollected.includes(0)) coinGroup.visible = false;

// --- Events: wasted / busted / respawn ---
function respawn(fine) {
  G.money = Math.max(0, G.money - fine);
  G.player.health = 100;
  G.player.x = 26;
  G.player.z = 26;
  G.player.heading = 0;
  if (G.player.inCar) playerSystem.exitCar();
  G.player.x = 26;
  G.player.z = 26;
  G.wanted = 0;
  police.clearCars();
  heliSystem.hide();
  hud.setMoney(G.money);
  hud.setHealth(100);
  hud.setWanted(0);
  el('wasted').style.display = 'none';
  el('busted').style.display = 'none';
  G.state = 'playing';
  hud.setDialog('Mara', 'Back on your feet, Dante. The city is still yours.');
}
G.events.wasted = function () {
  if (G.state !== 'playing') return;
  G.state = 'wasted';
  el('wasted').style.display = 'flex';
  audio.thud(10);
  setTimeout(() => respawn(100), 2500);
};
G.events.busted = function () {
  if (G.state !== 'playing') return;
  G.state = 'busted';
  el('busted').style.display = 'flex';
  setTimeout(() => respawn(200), 2500);
};
G.events.damagePlayer = function (n) {
  if (G.state !== 'playing') return;
  G.player.health = Math.max(0, G.player.health - n);
  hud.setHealth(G.player.health);
  if (G.player.health <= 0) G.events.wasted();
};

// --- Crew abilities (Z / X / C) ---
function useCrew(name) {
  const c = G.crew[name];
  if (!c || c.cd > 0) return false;
  if (name === 'mara') {
    if (G.player.health >= 100) {
      hud.flashMessage('Mara: you are already at full health');
      return false;
    }
    G.player.health = Math.min(100, G.player.health + 40);
    hud.setHealth(G.player.health);
    hud.setDialog('Mara', 'Patched up. Try not to get shot again, Dante.');
  } else if (name === 'rico') {
    c.boostT = 5;
    hud.setDialog('Rico', 'Ram speed! Hold on tight!');
  } else if (name === 'lena') {
    if (G.wanted <= 0) {
      hud.flashMessage('Lena: no heat to lose right now');
      return false;
    }
    police.setWanted(G.wanted - 1);
    hud.setDialog('Lena', 'Ghost protocol. One star gone — stay low.');
  }
  c.cd = c.cdMax;
  audio.click();
  return true;
}

// --- Taxi job ---
function taxiUpdate() {
  if (G.taxiState === 'idle') return;
  const cab = G.taxiCar;
  if (!cab || !G.player.inCar || G.player.car !== cab) return;
  if (!G.marker) return;
  const d = Math.hypot(G.player.x - G.marker.x, G.player.z - G.marker.z);
  if (d > 8) return;
  if (G.taxiState === 'toPickup') {
    G.taxiState = 'toDrop';
    G.taxiFare = 50 + Math.floor(G.rand(0, 40));
    // A destination somewhere else in the city.
    const dest = { x: (Math.floor(G.rand(-3, 4)) * 52), z: (Math.floor(G.rand(-3, 4)) * 52) };
    G.marker = dest;
    hud.setObjective('Drop the fare at the destination');
    hud.setDialog('Fare', 'Thanks for stopping. The east side, please — and step on it.');
  } else if (G.taxiState === 'toDrop') {
    G.money += G.taxiFare;
    hud.setMoney(G.money);
    audio.payout();
    hud.showBanner('Fare delivered — +$' + G.taxiFare);
    G.taxiState = 'idle';
    G.taxiFare = 0;
    missionSystem.updateMarker();
  }
}
function startTaxiJob() {
  G.taxiState = 'toPickup';
  // A pickup a couple of blocks away.
  const px = G.player.x + (G.rng() < 0.5 ? 104 : -104);
  const pz = G.player.z + (G.rng() < 0.5 ? 104 : -104);
  G.marker = { x: Math.max(-208, Math.min(208, px)), z: Math.max(-208, Math.min(208, pz)) };
  hud.setObjective('Pick up the fare');
  hud.setDialog('Dispatch', 'Fare waiting nearby. Go get them, Dante.');
}

// --- The sun coin ---
function coinUpdate() {
  if (!sunCoin.group.visible) return;
  sunCoin.group.rotation.y += 0.03;
  const d = Math.hypot(G.player.x - sunCoin.x, G.player.z - sunCoin.z);
  if (d < 4) {
    G.coinsCollected.push(sunCoin.id);
    G.money += 250;
    hud.setMoney(G.money);
    audio.payout();
    hud.flashMessage('Sun coin collected — +$250');
    sunCoin.group.visible = false;
  }
}

// --- Input ---
function el(id) { return document.getElementById(id); }
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  G.keys.add(e.code);
  audio.unlock();
  audio.resume();
  if (G.state === 'playing') {
    if (e.code === 'KeyE') {
      if (G.player.inCar) {
        exitCarFlow();
      } else {
        enterCarFlow();
      }
    } else if (e.code === 'KeyF') {
      weaponSystem.punch();
    } else if (e.code === 'Digit1') weaponSystem.select(0);
    else if (e.code === 'Digit2') weaponSystem.select(1);
    else if (e.code === 'Digit3') weaponSystem.select(2);
    else if (e.code === 'Digit4') weaponSystem.select(3);
    else if (e.code === 'Digit5') weaponSystem.select(4);
    else if (e.code === 'KeyR') weaponSystem.reload();
    else if (e.code === 'KeyQ') hud.flashMessage('Radio: ' + audio.nextStation());
    else if (e.code === 'KeyM') hud.flashMessage(audio.toggleMute() ? 'Muted' : 'Sound on');
    else if (e.code === 'KeyZ') useCrew('mara');
    else if (e.code === 'KeyX') useCrew('rico');
    else if (e.code === 'KeyC') useCrew('lena');
    else if (e.code === 'KeyN') {
      const map = el('map-screen');
      hud.showMap(map.style.display !== 'flex');
    }
  } else if (G.state === 'map') {
    if (e.code === 'KeyN' || e.code === 'Escape') {
      hud.showMap(false);
      G.state = 'playing';
    }
  }
});
window.addEventListener('keyup', (e) => {
  G.keys.delete(e.code);
});
window.addEventListener('blur', () => G.keys.clear());
el('game-canvas').addEventListener('mousedown', (e) => {
  if (G.state !== 'playing') return;
  audio.unlock();
  if (G.weapons.current === 0) {
    weaponSystem.punch();
  } else {
    weaponSystem.shoot(e.clientX, e.clientY);
  }
});
el('play-btn').addEventListener('click', () => {
  audio.unlock();
  audio.resume();
  audio.click();
  hud.showTitle(false);
  G.state = 'playing';
  hud.setDialog('Mara', 'Welcome back, Dante. The city is waiting — and so is the heat.');
});
el('new-game-btn').addEventListener('click', () => {
  audio.unlock();
  audio.click();
  try { localStorage.removeItem('solmar-bay-save-v1'); } catch { /* ignore */ }
  G.money = 100;
  G.mission = { current: 0, unlocked: 0, step: 0 };
  G.player.x = 0;
  G.player.z = 0;
  G.player.health = 100;
  hud.setMoney(100);
  hud.setHealth(100);
  hud.showTitle(false);
  G.state = 'playing';
  missionSystem.startMission(0);
});
el('map-close-btn').addEventListener('click', () => {
  hud.showMap(false);
  G.state = 'playing';
});
el('options-btn').addEventListener('click', () => {
  hud.flashMessage('Options: use Q for radio, M to mute, N for the map');
});
for (let i = 1; i <= 3; i++) {
  const slot = el('save-slot-' + i);
  if (slot) {
    slot.addEventListener('click', () => {
      audio.click();
      hud.flashMessage('Slot ' + i + ' — ' + slot.textContent);
    });
  }
}

// Enter the nearest car (parked, taxi or traffic) within 10 m.
function enterCarFlow() {
  const found = api.nearestCarPos();
  if (!found || found.dist > 10) {
    hud.flashMessage('No car close enough');
    return false;
  }
  let car = null;
  let kind = 'parked';
  // Prefer the exact car nearestCarPos found: re-resolve it by position.
  const all = [...trafficSystem.parked, trafficSystem.taxi, ...trafficSystem.cars].filter(Boolean);
  let best = null;
  let bestD = Infinity;
  for (const c of all) {
    if (c.staged || c.isPolice) continue;
    const d = Math.hypot(c.x - G.player.x, c.z - G.player.z);
    if (d < bestD) { bestD = d; best = c; }
  }
  car = best;
  if (!car || bestD > 10) return false;
  if (car === trafficSystem.taxi) kind = 'taxi';
  else if (trafficSystem.cars.includes(car)) kind = 'traffic';
  // Take it out of its old list.
  const pi = trafficSystem.parked.indexOf(car);
  if (pi >= 0) trafficSystem.parked.splice(pi, 1);
  playerSystem.enterCar(car);
  if (kind === 'taxi') {
    startTaxiJob();
  } else {
    // Stealing in view of a ped raises the heat.
    const witness = pedSystem.nearest(G.player.x, G.player.z, 30);
    if (witness) police.raiseWanted(1);
    missionSystem.onEnterCar();
  }
  hud.setDialog('Dante', 'This one will do. Keys? What keys?');
  return true;
}

function exitCarFlow() {
  const car = G.player.car;
  const wasTaxi = car === trafficSystem.taxi;
  playerSystem.exitCar();
  if (wasTaxi) {
    G.taxiState = 'idle';
    G.taxiFare = 0;
    missionSystem.updateMarker();
  } else if (car) {
    // A stolen car left behind becomes a parked car again.
    car.speed = 0;
    trafficSystem.parked.push(car);
  }
}

// --- The fixed-step update ---
G.step = function (dt) {
  G.simTime += dt;
  // The clock: one sim-second is one game-minute.
  G.timeOfDay += dt / 60;
  if (G.timeOfDay >= 24) G.timeOfDay -= 24;
  // Crew cooldowns tick down.
  for (const name of ['mara', 'rico', 'lena']) {
    const c = G.crew[name];
    if (c.cd > 0) c.cd = Math.max(0, c.cd - dt);
    if (name === 'rico' && c.boostT > 0) c.boostT = Math.max(0, c.boostT - dt);
  }
  if (G.state === 'title') {
    // A slow orbit behind the title screen.
    const a = G.simTime * 0.05;
    G.camera.position.set(Math.sin(a) * 130, 42, Math.cos(a) * 130);
    G.camera.lookAt(0, 8, 40);
    city.update(dt);
    return;
  }
  if (G.state !== 'playing') return;
  // Mission timer (display only — it never fails a mission).
  if (G.missionTime > 0) G.missionTime = Math.max(0, G.missionTime - dt);
  playerSystem.update(dt);
  trafficSystem.update(dt);
  police.update(dt);
  pedSystem.update(dt);
  weaponSystem.update(dt);
  missionSystem.update();
  heliSystem.update(dt);
  city.update(dt);
  taxiUpdate();
  coinUpdate();
  audio.updateSiren(G.wanted, dt);
  hud.update(dt);
  hud.setTimer(G.missionTime);
  // The steal prompt: show it when a stealable car is near on foot.
  if (!G.player.inCar) {
    const near = api.nearestCarPos();
    hud.setPrompt(near && near.dist < 6 ? 'Press E to steal the ' + near.model : '');
  } else {
    hud.setPrompt('');
  }
};

// --- Shot staging (?shot=...) ---
function stageShot() {
  if (shot === 'chase') {
    // The cover: the Comet on the main street, five staged cars ahead,
    // the BBPD heli low and in frame, wanted 3, Mara on the radio.
    const comet = playerSystem.giveComet(0, 0, 0);
    playerSystem.enterCar(comet);
    trafficSystem.stageCoverCars();
    // stageAt(x, z, height): heli low over the road ahead — 12 m up, 48 m out.
    heliSystem.stageAt(2, 48, 12);
    police.setWanted(3);
    G.mission.current = 7;
    G.mission.unlocked = 8;
    G.mission.step = 0;
    missionSystem.updateMarker();
    hud.setMission();
    hud.setObjective('Escape the police — wanted level 3!');
    hud.showBanner('Escape the police — wanted level 3!');
    hud.setDialog('Mara', 'The BBPD heli is on us — lose it on the beach road, Dante.');
    hud.setMoney(G.money);
    G.state = 'playing';
    hud.showTitle(false);
  } else if (shot === 'title') {
    hud.refreshSlots();
    hud.showTitle(true);
    G.state = 'title';
  } else if (shot === 'beach') {
    // The beach: the Comet on the sand, facing west toward the checkpoint.
    const comet = playerSystem.giveComet(0, 270, -Math.PI / 2);
    playerSystem.enterCar(comet);
    G.state = 'playing';
    hud.showTitle(false);
    hud.setDialog('Dante', 'Beach Run. Flat out west, no stops.');
  } else if (shot === 'map') {
    G.state = 'playing';
    hud.showTitle(false);
    hud.refreshSlots();
    hud.showMap(true);
    G.state = 'map';
  }
}

// --- The playtest API: plain serialisable values only ---
const api = {
  get state() { return G.state; },
  get player() {
    return { x: G.player.x, z: G.player.z, heading: G.player.heading, inCar: G.player.inCar, health: G.player.health };
  },
  get car() {
    const c = G.player.car;
    return c ? { speed: c.speed, x: c.x, z: c.z, heading: c.heading, model: c.model } : null;
  },
  get camera() {
    return { x: G.camera.position.x, y: G.camera.position.y, z: G.camera.position.z, heading: G.player.heading };
  },
  get buildings() { return city.buildings; },
  get traffic() { return trafficSystem.cars.length; },
  get peds() { return pedSystem.list.length; },
  get wanted() { return G.wanted; },
  get policeCount() { return police.cars.length; },
  get money() { return G.money; },
  get health() { return G.player.health; },
  get mission() { return { current: G.mission.current, unlocked: G.mission.unlocked, step: G.mission.step }; },
  get marker() { return G.marker ? { x: G.marker.x, z: G.marker.z } : null; },
  get vanPos() { return G.vanPos ? { x: G.vanPos.x, z: G.vanPos.z } : null; },
  get ammo() {
    const w = G.weapons;
    return { current: w.current, mag: w.ammo[w.current], reserve: w.reserve[w.current] };
  },
  get taxi() { return G.taxiState; },
  get coins() { return G.coinsCollected.length; },
  get station() { return audio.station; },
  nearestCarPos() {
    const all = [...trafficSystem.parked, trafficSystem.taxi, ...trafficSystem.cars].filter(Boolean);
    let best = null;
    let bestD = Infinity;
    for (const c of all) {
      if (c.staged || c.isPolice) continue;
      if (G.player.car === c) continue;
      const d = Math.hypot(c.x - G.player.x, c.z - G.player.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best ? { model: best.model, x: best.x, z: best.z, dist: bestD } : null;
  },
  taxiPos() {
    const cab = trafficSystem.taxi;
    return cab ? { model: cab.model, x: cab.x, z: cab.z } : null;
  },
  teleport(x, z) {
    G.player.x = x;
    G.player.z = z;
    if (G.player.car) {
      G.player.car.x = x;
      G.player.car.z = z;
      G.player.car.sync();
    }
    playerSystem.mesh.position.set(x, 0, z);
    return true;
  },
  enterNearestCar() { return enterCarFlow(); },
  exitCar() { return exitCarFlow(); },
  setAutoDrive(b) { G.autoDrive = !!b; return true; },
  setCarSpeed(v) {
    if (G.player.car) G.player.car.speed = v;
    return true;
  },
  setHeading(h) {
    G.player.heading = h;
    if (G.player.car) {
      G.player.car.heading = h;
      G.player.car.sync();
    }
    return true;
  },
  freezeSim(b) { G.frozen = !!b; return true; },
  saveNow() { return writeSave(G); },
  readSave() { return readSaveString(); },
  unlockAll() { missionSystem.unlockAll(); return true; },
  startMission(i) { return missionSystem.startMission(i); },
  spawnPedNear(x, z) { pedSystem.spawnNear(x, z); return true; },
  spawnPedAhead(d) { pedSystem.spawnAhead(d); return true; },
  spawnCopNear() { police.spawnCopNear(); return true; },
  forceDecay() { police.forceDecay(); return true; },
  setWanted(n) { police.setWanted(n); return true; },
  damagePlayer(n) { G.events.damagePlayer(n); return true; },
};
window.__solmar = api;

// --- Boot ---
hud.setMoney(G.money);
hud.setHealth(G.player.health);
hud.setWanted(G.wanted);
hud.setWeapon('Fists');
hud.setMission();
hud.setObjective('Welcome to Solmar Bay');
hud.refreshSlots();
hud.drawMinimap();
missionSystem.startMission(0);
stageShot();
if (shot !== 'title' && shot !== 'map') {
  // The title screen shows on a plain boot; staged shots hide it above.
  if (!shot) hud.showTitle(true);
}
engine.start();
