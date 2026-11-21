// Solmar Bay 3D — main: boots engine, city, player, vehicles, HUD; game
// loop, state machine (menu → playing → paused), input, chase camera,
// save, and the ?shot= staging hook for screenshots. Written fresh for the
// gta6-01 3D rebuild (branch v12-3d).
import * as THREE from 'three';
import { Engine } from './engine.js';
import { City, BEACH_Z } from './city.js';
import { Player } from './player.js';
import { VehicleManager } from './vehicles.js';
import { HUD } from './hud.js';
import { loadSave, writeSave } from './save.js';
import { AudioStub } from './audio.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') || '';
const SEED = parseInt(params.get('seed') || '7', 10);

const canvas = document.getElementById('game');
const engine = new Engine(canvas);
const city = new City(engine.scene, SEED);
const player = new Player(engine.scene);
const vehicles = new VehicleManager(engine.scene, city, SEED + 14);
const hud = new HUD();
const audio = new AudioStub();

let state = 'menu'; // menu | playing | paused
let money = 250;
let time = 17.5;
let simSeconds = 0; // simulation seconds advanced (frame-rate independent clock)
let drivenCar = null;
let autoDrive = false;
let saveTimer = 0;
let frames = 0;
const keys = {};
let drag = null;

// --- save ---
const saved = loadSave();
if (saved) {
  money = saved.money;
  player.x = saved.x ?? player.x;
  player.z = saved.z ?? player.z;
  time = saved.time ?? time;
  player.group.position.set(player.x, 0, player.z);
}
engine.setTime(time);
hud.setMoney(money);
hud.setHealth(100);
hud.setWanted(0);
hud.setWeapon('Fists');
hud.setObjective('Explore Solmar Bay — find a car and press E');
hud.setLocation('Downtown');

function saveNow() {
  return writeSave({
    money,
    x: drivenCar ? drivenCar.x : player.x,
    z: drivenCar ? drivenCar.z : player.z,
    time,
  });
}

// --- input ---
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Escape' && state === 'playing') { setState('paused'); return; }
  if (e.code === 'Escape' && state === 'paused') { setState('playing'); return; }
  if (state !== 'playing') return;
  if (e.code === 'KeyE') toggleCar();
  if (e.code === 'KeyF') player.punch();
  if (e.code === 'KeyM') audio.toggleMute();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag = { x: e.clientX, y: e.clientY };
  player.camYaw -= dx * 0.005;
  player.camPitch = Math.max(0.05, Math.min(1.1, player.camPitch + dy * 0.005));
});
canvas.addEventListener('pointerup', () => { drag = null; });

function setState(next) {
  state = next;
  hud.showMenu(state === 'menu');
  hud.showPause(state === 'paused');
  if (state === 'playing') audio.ensure();
}
document.getElementById('play-btn').addEventListener('click', () => setState('playing'));
document.getElementById('resume-btn').addEventListener('click', () => setState('playing'));
document.getElementById('restart-btn').addEventListener('click', () => {
  player.x = 0; player.z = 26; player.y = 0;
  if (drivenCar) { drivenCar.driven = false; drivenCar = null; }
  player.inCar = null;
  player.group.visible = true;
  setState('playing');
});

function toggleCar() {
  if (drivenCar) {
    player.exitCar();
    drivenCar.setHeadlight(false);
    drivenCar = null;
    saveNow();
    hud.setObjective('Explore Solmar Bay — find a car and press E');
    return;
  }
  const car = vehicles.nearestCar(player.x, player.z, 4);
  if (car) {
    player.enterCar(car);
    drivenCar = car;
    car.setHeadlight(engine.isNight);
    hud.setObjective('Drive — WASD to steer, Space to drift');
  }
}

// --- camera ---
const camPos = new THREE.Vector3(0, 8, -14);
let chaseYaw = 0;
function updateCamera(dt) {
  const cam = engine.camera;
  if (drivenCar) {
    // Chase cam: ease yaw toward the car's heading, lag the position.
    let dy = drivenCar.heading - chaseYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    chaseYaw += dy * Math.min(1, dt * 2.2);
    const dist = 7.0, height = 2.7;
    const tx = drivenCar.x - Math.sin(chaseYaw) * dist;
    const tz = drivenCar.z - Math.cos(chaseYaw) * dist;
    const k = 1 - Math.exp(-dt * 6);
    camPos.x += (tx - camPos.x) * k;
    camPos.y += (height - camPos.y) * k;
    camPos.z += (tz - camPos.z) * k;
    cam.position.copy(camPos);
    cam.lookAt(drivenCar.x + Math.sin(chaseYaw) * 8, 1.4, drivenCar.z + Math.cos(chaseYaw) * 8);
    const speedF = Math.min(1, Math.abs(drivenCar.speed) / 48);
    const targetFov = 60 + speedF * 14;
    if (Math.abs(cam.fov - targetFov) > 0.1) { cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix(); }
  } else {
    // Third-person orbit cam.
    const d = 7.5, cp = Math.cos(player.camPitch), sp = Math.sin(player.camPitch);
    const tx = player.x - Math.sin(player.camYaw) * d * cp;
    const tz = player.z - Math.cos(player.camYaw) * d * cp;
    const ty = 1.6 + sp * d;
    const k = 1 - Math.exp(-dt * 10);
    camPos.x += (tx - camPos.x) * k;
    camPos.y += (ty - camPos.y) * k;
    camPos.z += (tz - camPos.z) * k;
    cam.position.copy(camPos);
    cam.lookAt(player.x, 1.5, player.z);
    if (Math.abs(cam.fov - 60) > 0.1) { cam.fov = 60; cam.updateProjectionMatrix(); }
    chaseYaw = player.camYaw;
  }
}

function districtAt(x, z) {
  if (z > BEACH_Z) return 'Solmar Beach';
  const ns = z < -104 ? 'North ' : z > 104 ? 'South ' : '';
  const ew = x < -104 ? 'Old Harbor' : x < 0 ? 'Downtown' : x < 104 ? 'Marina' : 'Sunset Hills';
  return ns + ew;
}

// --- main loop ---
function update(dt) {
  if (state !== 'playing') return;
  simSeconds += dt;
  time += dt / 240; // 1 game hour per 4 real minutes
  engine.setTime(time);
  city.update(dt);
  const input = {
    f: keys.KeyW || keys.ArrowUp,
    b: keys.KeyS || keys.ArrowDown,
    l: keys.KeyA || keys.ArrowLeft,
    r: keys.KeyD || keys.ArrowRight,
    sprint: keys.ShiftLeft || keys.ShiftRight,
    jump: keys.Space && !drivenCar,
  };
  if (drivenCar) {
    const drive = {
      throttle: autoDrive ? 0.7 : (input.f ? 1 : input.b ? -1 : 0),
      steer: autoDrive ? 0 : (input.l ? -1 : input.r ? 1 : 0),
      handbrake: keys.Space,
    };
    vehicles.update(dt, drivenCar, drive);
  } else {
    player.update(dt, input, city);
  }
  // Interaction prompt.
  if (!drivenCar) {
    const near = vehicles.nearestCar(player.x, player.z, 4);
    hud.setPrompt(near ? `Press E to steal the ${near.model.name}` : '');
  } else {
    hud.setPrompt('');
  }
  // HUD.
  const kmh = drivenCar ? Math.abs(drivenCar.speed) * 3.6 : (player.moving ? (input.sprint ? 29 : 15) : 0);
  const gear = !drivenCar ? '—' : kmh < 40 ? 'G1' : kmh < 80 ? 'G2' : kmh < 120 ? 'G3' : kmh < 160 ? 'G4' : 'G5';
  hud.setSpeed(kmh, gear, drivenCar ? drivenCar.model.name : 'On foot');
  hud.setClock(time);
  hud.setLocation(districtAt(drivenCar ? drivenCar.x : player.x, drivenCar ? drivenCar.z : player.z));
  hud.drawMinimap(player, vehicles.cars, drivenCar);
  audio.setEngine(kmh, !!drivenCar);
  engine.followShadows(drivenCar ? drivenCar.x : player.x, drivenCar ? drivenCar.z : player.z);
  // Autosave every 10 s.
  saveTimer += dt;
  if (saveTimer > 10) { saveTimer = 0; saveNow(); }
}

function render(dt) {
  frames++;
  if (frames === 30) window.__shotReady = true;
  // Real elapsed time (not 1/60): on slow software renderers the camera
  // must still catch up, or it lags dozens of metres behind the car.
  updateCamera(Math.min(dt, 0.1));
}

engine.start(update, render);

// --- ?shot= staging for screenshots (deterministic scenes) ---
function stageShot() {
  if (!SHOT) return;
  setState('playing');
  if (SHOT === 'drive' || SHOT === 'night' || SHOT === 'beach') {
    // Put Dante in the nearest sports car, or the first car.
    const sports = vehicles.cars.find((c) => c.modelKey === 'sports') || vehicles.cars[0];
    if (SHOT === 'beach') {
      sports.x = -40; sports.z = BEACH_Z + 12; sports.heading = 0; // facing the sea (+z), camera behind sees car + beach + ocean
      engine.setTime(16);
      time = 16;
    } else if (SHOT === 'night') {
      sports.x = 0; sports.z = -52; sports.heading = 0;
      engine.setTime(21.5);
      time = 21.5;
    } else {
      sports.x = 0; sports.z = 0; sports.heading = 0;
      engine.setTime(17.5);
      time = 17.5;
    }
    sports.group.position.set(sports.x, 0, sports.z);
    sports.group.rotation.y = sports.heading;
    player.x = sports.x; player.z = sports.z;
    player.enterCar(sports);
    drivenCar = sports;
    sports.setHeadlight(engine.isNight);
    chaseYaw = sports.heading;
    autoDrive = SHOT === 'drive';
    if (SHOT === 'drive') sports.speed = 22;
    hud.setObjective('Drive — WASD to steer, Space to drift');
  } else if (SHOT === 'foot') {
    player.x = 8; player.z = 30;
    player.camYaw = Math.PI * 0.15;
    player.camPitch = 0.3;
    engine.setTime(17.5);
    time = 17.5;
    player.group.position.set(player.x, 0, player.z);
  }
  camPos.set(player.x, 8, player.z - 14);
}
stageShot();

// --- debug API for the CDP playtest ---
window.__solmar = {
  get state() { return state; },
  get simSeconds() { return simSeconds; },
  get money() { return money; },
  get time() { return time; },
  get player() { return { x: player.x, z: player.z, y: player.y, inCar: !!drivenCar, moving: player.moving }; },
  get car() {
    if (!drivenCar) return null;
    return { x: drivenCar.x, z: drivenCar.z, speed: drivenCar.speed, model: drivenCar.model.name };
  },
  get camera() {
    const p = engine.camera.position;
    return { x: p.x, y: p.y, z: p.z, fov: engine.camera.fov };
  },
  get cars() { return vehicles.cars.length; },
  nearestCarPos() {
    const c = vehicles.nearestCar(player.x, player.z, 500);
    return c ? { x: c.x, z: c.z, model: c.model.name } : null;
  },
  get buildings() { return city.buildingCount; },
  teleport(x, z) { if (drivenCar) { drivenCar.x = x; drivenCar.z = z; } else { player.x = x; player.z = z; player.group.position.set(x, 0, z); } },
  setTime(h) { time = h; engine.setTime(h); },
  enterNearestCar() { toggleCar(); return !!drivenCar; },
  exitCar() { if (drivenCar) toggleCar(); return !drivenCar; },
  setAutoDrive(b) { autoDrive = b; },
  saveNow() { return saveNow(); },
  readSave() { return localStorage.getItem('solmar-bay-save-v1'); },
};
