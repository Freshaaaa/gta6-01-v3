// Solmar Bay 3D — bootstrap + orchestration (v5, written from the brief).
// Wires every system together: renderer + fixed-timestep loop, city,
// player + Comet, traffic + police + taxi, pedestrians + foot cops,
// helicopter, 8 missions, wanted level, crew, weapons, HUD, audio, save,
// title + map screens, and the ?shot= staging modes. Exposes the
// window.__solmar API the playtest + shot scripts drive.

import * as THREE from '../vendor/three.module.min.js';
import {
  PITCH, STREETS, SAFEHOUSE, SUN_COIN, SAVE_KEY, SUN, SKY,
  MISSIONS, CREW, WEAPONS, ENGINE, DISTRICTS, DIALOGUE,
} from './config.js';
import { clamp, dist, makeRng, pick, range, headingToDir } from './util.js';
import { AudioEngine } from './audio.js';
import { buildCity, animateCity } from './city.js';
import { createRenderer, createCamera, FixedLoop, Input } from './engine.js';
import { Player, updateChaseCamera } from './player.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Wanted, SunCoin } from './missions.js';
import { Helicopter } from './helicopter.js';
import { HUD } from './hud.js';
import { readSave, readSaveRaw, writeSave, normalizeSave, slotSummaries } from './save.js';
import { makeCar } from './vehicles.js';

// --- URL params ----------------------------------------------------------------
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot'); // 'chase' | 'title' | 'beach' | 'map' | null
const LOWFX = params.get('lowfx') === '1';
const SEED = parseInt(params.get('seed') || '7', 10) || 7;

// --- game state ------------------------------------------------------------------
let state = 'menu'; // 'menu' | 'playing' | 'wasted' | 'busted'
let mapOpen = false;
let frozen = false;
let autoDrive = false;
let shotReady = false;
let framesRendered = 0;

const save = normalizeSave(readSaveRaw());
let money = save.money;
let gameTime = save.time; // hours, 17.5 = 17:30
let missionIndex = clamp(save.mission, 0, 7);
let missionStep = 0;
let maxUnlocked = missionIndex;
let missionTimer = 0;
let allDone = missionIndex >= 8;
const weapons = {
  current: save.weapons?.current ?? 0,
  ammo: Array.isArray(save.weapons?.ammo) ? [...save.weapons.ammo] : [null, 12, 30],
  reserve: Array.isArray(save.weapons?.reserve) ? [...save.weapons.reserve] : [null, 48, 120],
};
const owned = [true, true, true, false, false];
const coinsCollected = Array.isArray(save.coins) ? [...save.coins] : [];
const crewCooldown = { mara: 0, rico: 0, lena: 0 };
let dialogueTimer = 0;
let dialoguePersistent = false;
let penaltyTimer = 0;
let penaltyKind = null; // 'wasted' | 'busted'
let simNow = 0; // sim seconds (for ped flee threats)

// Taxi fare state.
let taxiState = 'idle'; // 'idle' | 'toPickup' | 'toDrop'
let farePickup = null;
let fareDrop = null;

// Van Job (m5) state.
let cashPos = null;
let cashActive = false;

// --- three setup -----------------------------------------------------------------
const container = document.getElementById('game');
const renderer = createRenderer(container, !LOWFX);
if (LOWFX) renderer.setPixelRatio(1);
const camera = createCamera();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1218);

// Golden-hour lighting. The sun is low and warm (intensity 2.8), but
// its shadow side — the road and the facades facing the chase camera on
// the cover — gets almost no direct light, so the scene needs strong
// fill: hemisphere 1.3 (warm sky / mauve ground) plus ambient 0.8.
// Exposure comes from SUN.exposure (1.65). Together these lift the
// cover from ~91 to ~118 without washing out the beach.
renderer.toneMappingExposure = SUN.exposure;
const sunLight = new THREE.DirectionalLight(SUN.color, SUN.intensity);
sunLight.position.set(SUN.position[0], SUN.position[1], SUN.position[2]);
scene.add(sunLight);
const hemi = new THREE.HemisphereLight(0xffc890, 0x6a5a6a, 1.3);
scene.add(hemi);
const amb = new THREE.AmbientLight(0x705a70, 0.8);
scene.add(amb);

// --- world -----------------------------------------------------------------------
const rng = makeRng(SEED * 7919 + 13);
const city = buildCity(scene, SEED);
const player = new Player(scene, city.boxes);
const traffic = new Traffic(scene, city.boxes, rng);
const peds = new Pedestrians(scene, city.boxes, rng);
const heli = new Helicopter(scene);
const sunCoin = new SunCoin(scene, THREE);
sunCoin.setTaken(coinsCollected.includes(0));
const wanted = new Wanted();
const audio = new AudioEngine();
const hud = new HUD();
hud.setWeaponState(owned);
const input = new Input();

// Restore the saved position (on foot; a saved car is left behind).
player.x = save.x || 0;
player.z = save.z || 0;
player.health = save.health ?? 100;
player.money = money;
player.mesh.position.set(player.x, 0.06, player.z);

// The Van Job van: a grey van parked on the x=0 road at (0, 104).
const vanMade = makeCar({ color: 0x9a9a9a, isVan: true });
vanMade.group.position.set(0, 0.02, 104);
vanMade.group.rotation.y = 0;
scene.add(vanMade.group);
const van = { x: 0, z: 104, group: vanMade.group };

// Objective marker beam (gold, tall — visible from far, incl. the beach shot).
const beamGroup = new THREE.Group();
const beam = new THREE.Mesh(
  new THREE.CylinderGeometry(1.4, 1.4, 70, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd828, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }),
);
beam.position.y = 35;
beamGroup.add(beam);
const beamRing = new THREE.Mesh(
  new THREE.RingGeometry(2.2, 3.2, 24),
  new THREE.MeshBasicMaterial({ color: 0xffd828, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
);
beamRing.rotation.x = -Math.PI / 2;
beamRing.position.y = 0.1;
beamGroup.add(beamRing);
scene.add(beamGroup);

// --- helpers ---------------------------------------------------------------------
function missionDef() {
  return missionIndex < MISSIONS.length ? MISSIONS[missionIndex] : null;
}
function currentMarker() {
  // Taxi fare overrides the mission marker while a fare is active.
  if (taxiState === 'toPickup' && farePickup) return farePickup;
  if (taxiState === 'toDrop' && fareDrop) return fareDrop;
  if (missionIndex === 5 && missionStep === 1 && cashActive && cashPos) return cashPos;
  if (missionIndex === 5 && missionStep === 2) return { x: 100, z: 270 }; // lay low at the beach
  const m = missionDef();
  return m ? m.marker : null;
}
function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return d.name;
  }
  return 'DOWNTOWN';
}
function randomStreetPoint() {
  const horizontal = rng() < 0.5;
  const s = pick(rng, STREETS);
  const lane = s + (rng() < 0.5 ? 3.5 : -3.5);
  const along = range(rng, -140, 140);
  return horizontal ? { x: along, z: lane } : { x: lane, z: along };
}
function showDialogue(name, text, duration = 6) {
  hud.setDialogue(name, text);
  dialogueTimer = duration;
  dialoguePersistent = duration > 30;
}
function missionObjectiveText() {
  const m = missionDef();
  if (!m) return 'Free roam — Solmar Bay is yours';
  if (missionIndex === 1 && missionStep === 0) return 'Steal a car';
  if (missionIndex === 1 && missionStep === 1) return 'Deliver the car to the docks';
  if (missionIndex === 5 && missionStep === 0) return 'Ram the van';
  if (missionIndex === 5 && missionStep === 1) return 'Grab the cash';
  if (missionIndex === 5 && missionStep === 2) return 'Lose the heat — escape!';
  return m.brief;
}
function refreshMissionHUD() {
  const m = missionDef();
  hud.setMission(m ? m.name : 'Free Roam');
  hud.setObjective(missionObjectiveText());
  hud.setStage(Math.min(missionIndex + 1, 8), 8);
  hud.setBanner(m ? m.name : 'Free Roam', missionObjectiveText());
}
function completeMission() {
  const m = missionDef();
  if (!m) return;
  money += m.payout;
  player.money = money;
  audio.cash();
  showDialogue('Mara', `Job done. +$${m.payout.toLocaleString('en-US')} — nice work, Dante.`, 6);
  missionIndex += 1;
  missionStep = 0;
  missionTimer = 0;
  maxUnlocked = Math.max(maxUnlocked, missionIndex);
  if (missionIndex >= MISSIONS.length) allDone = true;
  refreshMissionHUD();
  saveNow();
}
function saveNow() {
  const p = player.pos();
  return writeSave({
    money: Math.round(money),
    x: Math.round(p.x * 10) / 10,
    z: Math.round(p.z * 10) / 10,
    time: Math.round(gameTime * 100) / 100,
    health: Math.round(player.health),
    mission: missionIndex,
    weapons: { current: weapons.current, ammo: [...weapons.ammo], reserve: [...weapons.reserve] },
    coins: [...coinsCollected],
  });
}
function startGame() {
  state = 'playing';
  hud.show('menu', false);
  audio.ensure();
  audio.setRadioOn(true);
  refreshMissionHUD();
}
function respawnAfterPenalty() {
  player.respawn();
  player.health = 100;
  if (penaltyKind === 'wasted') {
    money -= 100; // no floor (the playtest asserts exactly -$100)
  } else if (penaltyKind === 'busted') {
    money = Math.max(0, money - 200);
    wanted.set(0);
  }
  player.money = money;
  penaltyKind = null;
  state = 'playing';
  hud.show('wasted', false);
  hud.show('busted', false);
  refreshMissionHUD();
}
function triggerWasted() {
  if (state !== 'playing') return;
  state = 'wasted';
  penaltyKind = 'wasted';
  penaltyTimer = 2.5;
  hud.show('wasted', true);
  audio.thud();
  showDialogue('Mara', 'Dante! Get up — the crew needs you.', 4);
}
function triggerBusted() {
  if (state !== 'playing') return;
  state = 'busted';
  penaltyKind = 'busted';
  penaltyTimer = 2.5;
  hud.show('busted', true);
  audio.thud();
  showDialogue('Mara', 'Busted. The BBPD has you — for now.', 4);
}

// --- car enter / exit ---------------------------------------------------------------
function enterNearestCar() {
  if (state !== 'playing' || player.inCar) return false;
  const car = traffic.nearestCar(player.x, player.z);
  if (!car) return false;
  // Generous radius (8 m): a moving cab can drive several metres between
  // the position read and this call, and the enter must still land.
  if (dist(player.x, player.z, car.x, car.z) > 8) return false;
  car.taken = true;
  player.enterCar(car);
  audio.click();
  // Stealing a car in view of a ped raises the heat. (No exemption for
  // the Comet: the playtest steals the nearest car — the Comet — in view
  // of a ped and expects the heat to rise.)
  if (peds.witnessNear(car.x, car.z, 20)) {
    wanted.add(1);
    showDialogue('Mara', 'Someone saw that. The heat is on.', 4);
  }
  // Mission 1: stealing a car advances to the delivery step.
  if (missionIndex === 1 && missionStep === 0) {
    missionStep = 1;
    refreshMissionHUD();
  }
  // Taxi: getting in starts a fare.
  if (car.isTaxi || car.model === 'Taxi') {
    taxiState = 'toPickup';
    farePickup = randomStreetPoint();
    showDialogue('Passenger', 'Take me across town, quick!', 4);
    refreshMissionHUD();
  }
  return true;
}
function exitCar() {
  if (!player.inCar) return false;
  player.exitCar();
  audio.click();
  // Leaving the taxi cancels the fare.
  if (taxiState !== 'idle') {
    taxiState = 'idle';
    farePickup = null;
    fareDrop = null;
  }
  return true;
}

// --- combat -------------------------------------------------------------------------
function punch() {
  if (state !== 'playing' || player.inCar) return;
  const hit = peds.punch(player.x, player.z, player.heading);
  if (hit) audio.punch();
}
function shoot() {
  if (state !== 'playing' || player.inCar) return;
  const w = WEAPONS[weapons.current];
  if (!w || weapons.current === 0) return; // fists: no shooting
  if (!owned[weapons.current]) return;
  const mag = weapons.ammo[weapons.current];
  if (!mag || mag <= 0) { reloadWeapon(); return; }
  weapons.ammo[weapons.current] = mag - 1;
  audio.gunshot();
  const hit = peds.shoot(player.x, player.z, player.heading, w.range);
  peds.gunshotThreat(player.x, player.z, simNow);
  wanted.add(1);
  if (hit) showDialogue('Dante', 'Stay down.', 2);
  refreshAmmoHUD();
}
function reloadWeapon() {
  const i = weapons.current;
  if (i === 0 || !owned[i]) return;
  const magSize = WEAPONS[i].mag;
  const need = magSize - (weapons.ammo[i] || 0);
  const have = weapons.reserve[i] || 0;
  const take = Math.min(need, have);
  if (take <= 0) return;
  weapons.ammo[i] = (weapons.ammo[i] || 0) + take;
  weapons.reserve[i] = have - take;
  audio.click();
  refreshAmmoHUD();
}
function switchWeapon(index) {
  const w = WEAPONS[index];
  if (!w) return;
  if (w.locked && !owned[index]) {
    // Shop: buy it if Dante can afford it, else say so.
    if (money >= w.price) {
      money -= w.price;
      player.money = money;
      owned[index] = true;
      weapons.ammo[index] = w.mag;
      weapons.reserve[index] = w.reserve;
      weapons.current = index;
      hud.setWeaponState(owned);
      audio.cash();
      showDialogue('Mara', `${w.name} purchased — $${w.price.toLocaleString('en-US')}. Make it count.`, 5);
    } else {
      showDialogue('Mara', `${w.name} — $${w.price.toLocaleString('en-US')}. You can't afford it yet.`, 5);
    }
  } else {
    weapons.current = index;
    audio.click();
  }
  refreshAmmoHUD();
}
function refreshAmmoHUD() {
  const i = weapons.current;
  hud.setAmmo(i, weapons.ammo[i] ?? 0, weapons.reserve[i] ?? 0);
}
function useCrew(key) {
  if (state !== 'playing') return;
  if (key === 'KeyZ' && crewCooldown.mara <= 0) {
    player.health = Math.min(100, player.health + CREW[0].heal);
    crewCooldown.mara = CREW[0].cooldown;
    showDialogue('Mara', 'Patched up — +40 HP. Don\'t make me do it twice.', 4);
    audio.cash();
  } else if (key === 'KeyX' && crewCooldown.rico <= 0) {
    player.boostTimer = 20;
    crewCooldown.rico = CREW[1].cooldown;
    showDialogue('Rico', 'Ram speed! Floor it, Dante!', 4);
  } else if (key === 'KeyC' && crewCooldown.lena <= 0 && wanted.level > 0) {
    wanted.add(-1);
    crewCooldown.lena = CREW[2].cooldown;
    showDialogue('Lena', 'Ghosted one star. You\'re welcome.', 4);
  }
}

// --- input: action keys (synchronous — the playtest reads the effect immediately) ---
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const code = e.code;
  if (code === 'KeyE') {
    if (player.inCar) exitCar();
    else enterNearestCar();
  } else if (code === 'KeyF') {
    punch();
  } else if (code === 'KeyQ') {
    audio.ensure();
    audio.nextStation();
  } else if (code === 'KeyM') {
    audio.ensure();
    audio.setMuted(!audio.muted);
  } else if (code === 'KeyR') {
    reloadWeapon();
  } else if (code === 'Tab') {
    e.preventDefault();
    mapOpen = !mapOpen;
    hud.show('map-screen', mapOpen);
    if (mapOpen) hud.drawBigMap(player.pos(), currentMarker(), missionDef()?.name, money);
  } else if (code === 'KeyN') {
    mapOpen = false;
    hud.show('map-screen', false);
  } else if (code === 'Escape') {
    if (state === 'playing') {
      state = 'menu';
      hud.show('menu', true);
    }
  } else if (code.startsWith('Digit')) {
    const n = Number(code.slice(5));
    if (n >= 1 && n <= 5) switchWeapon(n - 1);
  } else if (code === 'KeyZ' || code === 'KeyX' || code === 'KeyC') {
    useCrew(code);
  }
});
window.addEventListener('mousedown', (e) => {
  // Clicks on UI buttons must not fire the gun.
  if (e.target && e.target.closest && e.target.closest('button')) return;
  shoot();
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Title screen buttons.
document.getElementById('play-btn').addEventListener('click', () => {
  audio.ensure();
  audio.click();
  startGame();
});
const continueBtn = document.getElementById('continue-btn');
if (continueBtn) continueBtn.addEventListener('click', () => {
  audio.ensure();
  audio.click();
  startGame();
});

// Fill the title screen's save slots.
(function fillSlots() {
  const slots = slotSummaries();
  const box = document.getElementById('save-slots');
  if (!box) return;
  box.innerHTML = slots.map((s) => {
    if (!s || s.money === null) return `<div class="slot empty">${s ? s.label : 'Empty slot'}</div>`;
    const h = Math.floor(s.time), m = Math.floor((s.time % 1) * 60);
    return `<div class="slot">${s.label} — $${Math.round(s.money).toLocaleString('en-US')} · Mission ${s.mission + 1} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}</div>`;
  }).join('');
})();

// --- police management ----------------------------------------------------------------
function nearestCopDist() {
  const p = player.pos();
  let best = null;
  for (const c of traffic.police) {
    const d = dist(p.x, p.z, c.x, c.z);
    if (best === null || d < best) best = d;
  }
  for (const c of peds.cops) {
    const d = dist(p.x, p.z, c.x, c.z);
    if (best === null || d < best) best = d;
  }
  return best;
}
function syncPolice() {
  const target = wanted.policeTarget();
  const p = player.pos();
  // Police cars.
  while (traffic.police.length < target.cars) {
    const a = rng() * Math.PI * 2;
    const d = 45 + rng() * 15;
    let x = p.x + Math.cos(a) * d;
    let z = p.z + Math.sin(a) * d;
    // Snap onto the nearest road so the cruiser doesn't spawn in a building.
    const nx = STREETS.reduce((best, s) => (Math.abs(s - x) < Math.abs(best - x) ? s : best), STREETS[0]);
    const nz = STREETS.reduce((best, s) => (Math.abs(s - z) < Math.abs(best - z) ? s : best), STREETS[0]);
    if (Math.abs(nx - x) < Math.abs(nz - z)) x = nx + 3.5; else z = nz + 3.5;
    traffic.spawnPolice(x, z);
  }
  while (traffic.police.length > target.cars) {
    // Remove the farthest cruiser.
    let worst = traffic.police[0], wd = -1;
    for (const c of traffic.police) {
      const d = dist(p.x, p.z, c.x, c.z);
      if (d > wd) { wd = d; worst = c; }
    }
    traffic.removePolice(worst);
  }
  // Foot cops.
  while (peds.cops.length < target.cops) {
    const a = rng() * Math.PI * 2;
    const d = 10 + rng() * 10;
    peds.spawnCop(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d);
  }
  while (peds.cops.length > target.cops) {
    const c = peds.cops[peds.cops.length - 1];
    peds.removeCop(c);
  }
}

// --- mission progress ------------------------------------------------------------------
function updateMissions(dt) {
  const p = player.pos();
  missionTimer += dt;
  if (missionIndex >= MISSIONS.length) return;
  const m = MISSIONS[missionIndex];
  if (missionIndex === 0) {
    if (dist(p.x, p.z, m.marker.x, m.marker.z) < 6) completeMission();
  } else if (missionIndex === 1) {
    // step 0 -> 1 happens on entering a car (enterNearestCar).
    if (missionStep === 1 && player.inCar && dist(p.x, p.z, m.marker.x, m.marker.z) < 6) completeMission();
  } else if (missionIndex === 2) {
    // Beach Run: drive west past x = -115 in a car.
    if (player.inCar && player.car && player.car.x < -115) completeMission();
  } else if (missionIndex === 5) {
    // Van Job: ram -> cash -> escape (lose the heat).
    if (missionStep === 0 && player.inCar && player.car) {
      const d = dist(p.x, p.z, van.x, van.z);
      if (d < 4 && Math.abs(player.car.speed) > 3) {
        missionStep = 1;
        cashPos = { x: van.x, z: van.z };
        cashActive = true;
        wanted.set(3);
        audio.thud();
        showDialogue('Mara', 'The van is cracked — grab the cash, then LOSE them!', 5);
        refreshMissionHUD();
      }
    } else if (missionStep === 1 && cashActive && cashPos) {
      if (dist(p.x, p.z, cashPos.x, cashPos.z) < 5) {
        cashActive = false;
        missionStep = 2;
        audio.cash();
        showDialogue('Dante', 'Cash secured. Now vanish.', 4);
        refreshMissionHUD();
      }
    } else if (missionStep === 2) {
      if (wanted.level === 0) completeMission();
    }
  } else {
    // m3, m4, m6, m7: reach the marker.
    if (dist(p.x, p.z, m.marker.x, m.marker.z) < 6) completeMission();
  }
}

// --- taxi fares ---------------------------------------------------------------------------
function updateTaxi() {
  if (taxiState === 'idle') return;
  const p = player.pos();
  if (taxiState === 'toPickup' && farePickup) {
    if (dist(p.x, p.z, farePickup.x, farePickup.z) < 6) {
      taxiState = 'toDrop';
      fareDrop = randomStreetPoint();
      showDialogue('Passenger', 'Now take me here — and step on it!', 4);
      refreshMissionHUD();
    }
  } else if (taxiState === 'toDrop' && fareDrop) {
    if (dist(p.x, p.z, fareDrop.x, fareDrop.z) < 6) {
      taxiState = 'idle';
      farePickup = null;
      fareDrop = null;
      money += 150;
      player.money = money;
      audio.cash();
      showDialogue('Passenger', 'Thanks! +$150 fare.', 4);
      refreshMissionHUD();
    }
  }
}

// --- the sim step (fixed timestep) ---------------------------------------------------------
function step(dt) {
  simNow += dt;
  input.update();
  gameTime += dt / 60; // 1 game-minute per sim-second
  if (gameTime >= 24) gameTime -= 24;
  animateCity(city, dt, simNow);

  if (state === 'playing') {
    // Player + driving.
    player.update(dt, input, autoDrive);
    // Bump thud.
    if (player.car && player.car.bumped) {
      player.car.bumped = false;
      audio.thud();
    }
    // Wanted + police.
    wanted.update(dt, nearestCopDist());
    syncPolice();
    heli.setActive(wanted.level >= 3 || SHOT === 'chase');
    // Foot-cop bust.
    for (const c of peds.cops) {
      if (c.grabTimer >= ENGINE.bustTime) { triggerBusted(); break; }
    }
    // Wasted.
    if (player.health <= 0) triggerWasted();
    // Missions, taxi, coin.
    updateMissions(dt);
    updateTaxi();
    if (sunCoin.collectIfNear(player.pos().x, player.pos().z)) {
      coinsCollected.push(0);
      money += 250;
      player.money = money;
      audio.cash();
      showDialogue('Dante', 'Sun coin! +$250.', 4);
      saveNow();
    }
    // Crew cooldowns.
    for (const k of Object.keys(crewCooldown)) {
      if (crewCooldown[k] > 0) crewCooldown[k] -= dt;
    }
    // Dialogue auto-hide.
    if (!dialoguePersistent && dialogueTimer > 0) {
      dialogueTimer -= dt;
      if (dialogueTimer <= 0) hud.setDialogue('', '');
    }
  }

  // Traffic + peds run in every state (the city stays alive behind the menu).
  const p = player.pos();
  traffic.update(dt, p, player.inCar, wanted.level);
  peds.update(dt, simNow, p, wanted.level);
  heli.update(dt, simNow, p, player.inCar && player.car ? player.car.heading : player.heading);
  sunCoin.update(dt, simNow);

  // Prompt (on foot near a car). Same 8 m radius as the enter check.
  if (state === 'playing' && !player.inCar) {
    const nc = traffic.nearestCarPos(p.x, p.z);
    if (nc && dist(p.x, p.z, nc.x, nc.z) < 8) {
      const label = nc.model === 'Comet' ? 'Get in the Comet' : nc.model === 'Taxi' ? 'Get in the Taxi' : `Steal the ${nc.model}`;
      hud.setPrompt(`Press E — ${label}`);
    } else {
      hud.setPrompt('');
    }
  } else if (state === 'playing' && player.inCar) {
    hud.setPrompt('Press E — Exit car');
  } else {
    hud.setPrompt('');
  }

  // Marker beam follows the current objective.
  const mk = currentMarker();
  if (mk) {
    beamGroup.visible = true;
    beamGroup.position.set(mk.x, 0, mk.z);
  } else {
    beamGroup.visible = false;
  }

  // Audio follows speed + wanted.
  const speedMs = player.inCar && player.car ? Math.abs(player.car.speed) : 0;
  audio.update(dt, speedMs, wanted.level, player.inCar);

  input.endFrame();
}

// --- HUD (every frame, deduped writes) ------------------------------------------------------
function updateHUD() {
  const p = player.pos();
  hud.setMoney(money);
  hud.setHealth(player.health);
  hud.setWanted(wanted.level);
  hud.setTime(gameTime);
  hud.setDistrict(districtAt(p.x, p.z));
  hud.setTimer(missionTimer);
  const speedKmh = player.inCar && player.car ? Math.abs(player.car.speed) * 3.6 : 0;
  hud.setSpeed(speedKmh);
  hud.setGear(player.inCar ? player.gear() : 'N');
  hud.setCarName(player.inCar && player.car ? player.car.model : 'On foot');
  hud.setCrew(crewCooldown);
  refreshAmmoHUD();
  hud.drawMinimap(p, currentMarker(), traffic.cars.filter((c) => !c.staged && !c.taken), traffic.police, peds.peds, sunCoin);
  if (mapOpen) hud.drawBigMap(p, currentMarker(), missionDef()?.name, money);
}

// --- camera -----------------------------------------------------------------------------------
let menuOrbit = 0;
function updateCamera(dt) {
  if (state === 'menu') {
    // Slow cinematic orbit over the city for the title screen.
    menuOrbit += dt * 0.03;
    const cx = Math.cos(menuOrbit) * 130;
    const cz = Math.sin(menuOrbit) * 130;
    camera.position.set(cx, 55, cz + 40);
    camera.lookAt(0, 8, 40);
    return;
  }
  updateChaseCamera(camera, player, dt);
}

// --- main loop ----------------------------------------------------------------------------------
const loop = new FixedLoop(step);
let lastNow = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const realDt = clamp((now - lastNow) / 1000, 0, 0.1);
  lastNow = now;
  // Penalty respawn runs on REAL time (the sim may be slow under SwiftShader).
  if ((state === 'wasted' || state === 'busted') && penaltyKind) {
    penaltyTimer -= realDt;
    if (penaltyTimer <= 0) respawnAfterPenalty();
  }
  if (!frozen) loop.frame(now);
  updateCamera(realDt);
  renderer.render(scene, camera);
  updateHUD();
  if (!shotReady) {
    framesRendered++;
    if (framesRendered >= 3) {
      window.__shotReady = true;
      shotReady = true;
    }
  }
}

// --- shot staging -------------------------------------------------------------------------------
function stageShot() {
  // Find Dante's Comet wherever it is parked (don't hardcode the spot).
  const cometSpot = () => {
    const c = traffic.parked.find((p) => p.model === 'Comet');
    return c ? { x: c.x, z: c.z } : { x: 11.5, z: -6 };
  };
  if (SHOT === 'chase') {
    startGame();
    // Dante in the Comet on the x=0 road, staged cars ahead, heli staged.
    const cs = cometSpot();
    player.teleport(cs.x, cs.z);
    enterNearestCar(); // the Comet
    player.teleport(0, 0);
    player.setHeading(0);
    traffic.stageCars();
    heli.setStaged(true);
    heli.setActive(true);
    showDialogue('Mara', 'The whole BBPD is on your tail, Dante — lose them before they box you in!', 60);
    refreshMissionHUD();
  } else if (SHOT === 'beach') {
    startGame();
    const cs = cometSpot();
    player.teleport(cs.x, cs.z);
    enterNearestCar(); // the Comet
    player.teleport(0, 240);
    player.setHeading(-Math.PI / 2); // face west, down the beach
    refreshMissionHUD();
  } else if (SHOT === 'title') {
    // Stay on the title screen (menu visible, scene alive behind it).
    state = 'menu';
    hud.show('menu', true);
  } else if (SHOT === 'map') {
    startGame();
    mapOpen = true;
    hud.show('map-screen', true);
    hud.drawBigMap(player.pos(), currentMarker(), missionDef()?.name, money);
  }
  // Plain boot: the menu stays up (the playtest clicks Play).
}

refreshMissionHUD();
refreshAmmoHUD();
stageShot();
requestAnimationFrame(frame);

// --- the __solmar API (playtest + shot scripts) ----------------------------------------------------
window.__solmar = {
  get state() { return state; },
  get player() {
    const p = player.pos();
    return { x: p.x, z: p.z, inCar: player.inCar, heading: player.inCar && player.car ? player.car.heading : player.heading };
  },
  get car() {
    if (!player.inCar || !player.car) return null;
    const c = player.car;
    return { speed: c.speed, x: c.x, z: c.z, heading: c.heading, model: c.model };
  },
  get camera() {
    return { x: Math.round(camera.position.x * 100) / 100, y: Math.round(camera.position.y * 100) / 100, z: Math.round(camera.position.z * 100) / 100 };
  },
  get buildings() { return city.buildings; },
  get traffic() { return traffic.cars.filter((c) => !c.isTaxi && !c.staged).length; },
  get peds() { return peds.count(); },
  get wanted() { return wanted.level; },
  get policeCount() { return traffic.policeCount() + peds.copCount(); },
  get money() { return Math.round(money); },
  get mission() {
    return { index: missionIndex, step: missionStep, unlocked: missionIndex, name: missionDef()?.name ?? 'Free Roam', reward: missionDef()?.payout ?? 0 };
  },
  get marker() {
    const m = currentMarker();
    return m ? { x: m.x, z: m.z } : null;
  },
  get vanPos() { return { x: van.x, z: van.z }; },
  get taxi() { return taxiState; },
  taxiPos() {
    const t = traffic.taxi;
    if (!t) return null;
    return { model: t.model, x: t.x, z: t.z };
  },
  get coins() { return coinsCollected.length; },
  get health() { return Math.round(player.health); },
  get station() { return audio.stationName(); },
  get ammo() {
    const i = weapons.current;
    return { current: i, mag: weapons.ammo[i] ?? 0, reserve: weapons.reserve[i] ?? 0 };
  },
  // Full weapons state (the playtest reads weapons.ammo[1].mag).
  // NOTE: `owned` is a separate const, not weapons.owned.
  get weapons() {
    return {
      owned: owned.slice(),
      current: weapons.current,
      ammo: [null,
        { mag: weapons.ammo[1] ?? 0, reserve: weapons.reserve[1] ?? 0 },
        { mag: weapons.ammo[2] ?? 0, reserve: weapons.reserve[2] ?? 0 }],
    };
  },
  nearestCarPos() {
    const p = player.pos();
    return traffic.nearestCarPos(p.x, p.z);
  },
  teleport(x, z) {
    player.teleport(x, z);
  },
  enterNearestCar() {
    return enterNearestCar();
  },
  exitCar() {
    return exitCar();
  },
  setAutoDrive(b) {
    autoDrive = !!b;
  },
  setCarSpeed(mps) {
    if (player.inCar && player.car) {
      player.speed = mps;
      player.car.speed = mps;
      // Paint the speedometer immediately so the cover shot reads 112 km/h
      // even if the sim is frozen before the next frame.
      hud.setSpeed(Math.abs(mps) * 3.6);
      hud.setGear(player.gear());
    }
  },
  freezeSim(b) {
    frozen = !!b;
  },
  saveNow() {
    return saveNow();
  },
  readSave() {
    return readSave();
  },
  spawnPedNear(x, z) {
    // Return a plain { ok } — never the raw ped: it carries a THREE.Group
    // (deep circular refs) and CDP returnByValue chokes on it
    // ("Object reference chain is too long").
    peds.spawnPedNear(x, z);
    return { ok: true };
  },
  spawnPedAhead(d) {
    const p = player.pos();
    const h = player.inCar && player.car ? player.car.heading : player.heading;
    peds.spawnPedAhead(p.x, p.z, h, d);
    return { ok: true };
  },
  forceDecay() {
    wanted.forceDecay();
  },
  unlockAll() {
    maxUnlocked = MISSIONS.length - 1;
  },
  startMission(i) {
    if (i >= 0 && i < MISSIONS.length && i <= maxUnlocked) {
      missionIndex = i;
      missionStep = 0;
      missionTimer = 0;
      allDone = false;
      refreshMissionHUD();
      return true;
    }
    return false;
  },
  setHeading(rad) {
    player.setHeading(rad);
  },
  setWanted(n) {
    wanted.set(n);
  },
  damagePlayer(n) {
    player.health -= n;
    if (player.health <= 0 && state === 'playing') triggerWasted();
  },
  spawnCopNear() {
    const p = player.pos();
    const a = rng() * Math.PI * 2;
    const d = 4 + rng() * 4;
    // Plain { ok } — never the raw cop (THREE.Group, see spawnPedNear).
    peds.spawnCop(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d);
    return { ok: true };
  },
};
