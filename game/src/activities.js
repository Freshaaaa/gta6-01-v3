// Solmar Bay 3D — side activities. Everything outside the story
// missions lives here: taxi fares, street races, sun-coin collectibles
// (see entities.js), the docks chop shop, the Hideout weapon shop,
// the money-van heist (an armored van that roams the city — crack it on
// foot for $800), the safehouse/garage (store and upgrade cars, save and
// heal), respray and outfit shops, and the in-game phone's social feed.
// Each function works directly on the shared `state` object that main.js
// owns; toasts are set with state.toast + state.toastTimer the same way
// main.js does it.

import {
  ARMOUR_AMOUNT, ARMOUR_PRICE, CHOP_MODELS, CHOP_REWARD, GARAGE_ARMOR_PRICE, GARAGE_ENGINE_PRICE,
  GARAGE_MAX_CARS, GARAGE_PAINT_PRICE, LANDMARKS, OUTFIT_PRICE, PAINT_COLORS, PLAYER_MAX_ARMOUR,
  RESPRAY_PRICE, VAN_CRACK_SECONDS, VAN_FIRST_DELAY, VAN_HEAT, VAN_MAX_DELAY,
  VAN_MIN_DELAY, VAN_REWARD, WEAPON_ORDER, WEAPON_UNLOCK_MISSION, WEAPONS,
} from './config.js';
import { addWantedHeat, spawnCar } from './entities.js';
import { dist2, pick, rand } from './rng.js';
import { lanePoint, nearestLane } from './city.js';
import { sfxCash, sfxPickup } from './audio.js';

export function pushFeed(state, user, text) {
  state.feed.unshift({ user, text, time: state.clockMinutes });
  if (state.feed.length > 12) state.feed.length = 12;
}

// ---- taxi ----

export function tryStartTaxi(state) {
  const p = state.player;
  if (!p.car || !p.car.taxi) return false;
  if (state.taxi.active || state.race.active) return false;
  const dest = pick(state.rng, Object.values(LANDMARKS));
  state.taxi = {
    active: true, stage: 'pickup', fare: 0, dest,
    passengerAt: { x: p.x + rand(state.rng, -60, 60), z: p.z + rand(state.rng, -60, 60) },
    timer: 90,
  };
  state.toast = 'Taxi fare: pick up the passenger (gold marker)';
  state.toastTimer = 3;
  return true;
}

export function updateTaxi(state, dt) {
  const t = state.taxi;
  if (!t.active) return;
  const p = state.player;
  t.timer -= dt;
  if (t.timer <= 0) {
    state.taxi = { active: false };
    state.toast = 'Fare cancelled — too slow.';
    state.toastTimer = 3;
    state.marker.active = false;
    return;
  }
  if (t.stage === 'pickup') {
    state.marker = { active: true, x: t.passengerAt.x, z: t.passengerAt.z, radius: 6, color: '#ffd700' };
    if (p.car && dist2(p.x, p.z, t.passengerAt.x, t.passengerAt.z) < 36) {
      t.stage = 'dropoff';
      t.timer = 120;
      const d = Math.hypot(t.dest.x - p.x, t.dest.z - p.z);
      t.fare = Math.round(40 + d * 0.35);
      state.toast = `Passenger aboard — take them to ${t.dest.name} ($${t.fare})`;
      state.toastTimer = 3;
    }
  } else {
    state.marker = { active: true, x: t.dest.x, z: t.dest.z, radius: 8, color: '#ffd700' };
    if (p.car && dist2(p.x, p.z, t.dest.x, t.dest.z) < 64) {
      p.money += t.fare;
      sfxCash();
      state.toast = `Fare complete! +$${t.fare}`;
      state.toastTimer = 3;
      state.taxi = { active: false };
      state.marker.active = false;
      pushFeed(state, 'Solmar Nights', `Somebody just tipped a cabbie $${t.fare}. The Bay runs on tips.`);
    }
  }
  if (!p.car) {
    state.taxi = { active: false };
    state.marker.active = false;
    state.toast = 'Fare cancelled — you left the cab.';
    state.toastTimer = 3;
  }
}

// ---- street race ----

export function tryStartRace(state) {
  const p = state.player;
  if (!p.car || state.race.active || state.taxi.active) return false;
  const pts = [
    { x: 150, z: 90 }, { x: 330, z: 210 }, { x: 210, z: 390 }, { x: 390, z: 450 },
  ];
  state.race = {
    active: true, checkpoints: pts.map((c) => ({ ...c, radius: 8, hit: false })),
    next: 0, timer: 120, prize: 500,
  };
  state.toast = 'Street race! Hit all 4 checkpoints — $500';
  state.toastTimer = 3;
  return true;
}

export function updateRace(state, dt) {
  const r = state.race;
  if (!r.active) return;
  const p = state.player;
  r.timer -= dt;
  if (r.timer <= 0) {
    state.race = { active: false };
    state.checkpoints = [];
    state.toast = 'Race over — too slow.';
    state.toastTimer = 3;
    return;
  }
  state.checkpoints = r.checkpoints;
  const cp = r.checkpoints[r.next];
  if (cp && p.car && dist2(p.x, p.z, cp.x, cp.z) < cp.radius * cp.radius) {
    cp.hit = true;
    r.next++;
    sfxPickup();
    if (r.next >= r.checkpoints.length) {
      p.money += r.prize;
      sfxCash();
      state.toast = `Race won! +$${r.prize}`;
      state.toastTimer = 3;
      pushFeed(state, 'Solmar Nights', 'Somebody just won the midnight street race. The whole Strip saw it.');
      state.race = { active: false };
      state.checkpoints = [];
      return;
    }
    state.toast = `Checkpoint ${r.next}/${r.checkpoints.length}`;
    state.toastTimer = 1.5;
  }
  if (!p.car) {
    state.race = { active: false };
    state.checkpoints = [];
    state.toast = 'Race over — you left the car.';
    state.toastTimer = 3;
  }
}

// ---- money van ----

export function updateVan(state, dt) {
  const p = state.player;
  state.vanTimer = (state.vanTimer || VAN_FIRST_DELAY) - dt;
  if (!state.van.active && state.vanTimer <= 0) {
    // Spawn the van on a lane near the player.
    const near = nearestLane(state.city, p.x + rand(state.rng, -100, 100), p.z + rand(state.rng, -100, 100));
    const pt = lanePoint(state.city, near.lane, near.t);
    const van = spawnCar(state, { name: 'Hauler', color: '#3d5a3d', accel: 0.8, maxSpeed: 0.85, turn: 0.8, hp: 260, len: 5.6, wid: 2.2 }, pt.x, pt.z, 0, { state: 'traffic' });
    van.lane = near.lane;
    van.laneT = near.t;
    van.cruise = 9;
    van.isVan = true;
    state.van = { active: true, car: van, crack: 0 };
    state.toast = 'Money van spotted — crack it on foot (hold E) for $500';
    state.toastTimer = 4;
  }
  if (!state.van.active) return;
  const van = state.van.car;
  if (!van || van.state === 'wreck' || van.state === 'burning' || van.removed) {
    state.van = { active: false, car: null, crack: 0 };
    state.vanTimer = rand(state.rng, VAN_MIN_DELAY, VAN_MAX_DELAY);
    return;
  }
  // Van drives its lane like traffic; the crack happens on foot.
  if (p.onFoot && dist2(p.x, p.z, van.x, van.z) < 36) {
    state.vanPrompt = true;
    if (state.input && state.input.interact) {
      state.van.crack += dt;
      if (state.van.crack >= VAN_CRACK_SECONDS) {
        p.money += VAN_REWARD;
        state.vansRobbed++;
        addWantedHeat(state, VAN_HEAT);
        sfxCash();
        state.toast = `Van cracked! +$${VAN_REWARD} — and 3 stars of heat`;
        state.toastTimer = 3;
        pushFeed(state, 'Solmar PD', 'ALERT: armored van robbed in broad daylight. Suspect on foot.');
        state.van = { active: false, car: null, crack: 0 };
        state.vanTimer = rand(state.rng, VAN_MIN_DELAY, VAN_MAX_DELAY);
        // The van's driver flees; the van stays as traffic.
        van.state = 'traffic';
        van.isVan = false;
      }
    }
  } else {
    state.vanPrompt = false;
    state.van.crack = 0;
  }
}

// ---- chop shop ----

export function tryChop(state) {
  const p = state.player;
  if (!p.car) return false;
  if (!CHOP_MODELS.includes(p.car.model.name)) {
    state.toast = 'The chop shop only wants fast cars (Strada, Viento, Falco, Vela, Aurora).';
    state.toastTimer = 3;
    return false;
  }
  const reward = CHOP_REWARD + Math.floor(p.car.hp / 10);
  const modelName = p.car.model.name;
  p.money += reward;
  sfxCash();
  state.toast = `Chop shop paid $${reward} for the ${modelName}.`;
  state.toastTimer = 3;
  p.car.removed = true;
  state.cars = state.cars.filter((c) => c !== p.car);
  p.car = null;
  p.onFoot = true;
  pushFeed(state, 'Solmar Nights', `A ${modelName} just vanished into the docks chop shop. No questions asked.`);
  return true;
}

// ---- weapon shop (Hideout) ----

export function shopCycle(state) {
  // Cycles SMG -> shotgun -> rifle -> AR-9 -> Breaker -> body armour ->
  // ammo; each E press buys the next. The late weapons are gated by
  // story progress (AR-9 after Getaway Driver, Breaker after Heatwave),
  // so a slot that shows LOCKED in the HUD is honestly locked.
  const order = ['smg', 'shotgun', 'rifle', 'ar9', 'breaker'];
  const idx = state.shopCycle % 7;
  const p = state.player;
  if (idx < 5) {
    const key = order[idx];
    const w = WEAPONS[key];
    const unlockAt = WEAPON_UNLOCK_MISSION[key] || 0;
    if (p.weaponsOwned.includes(key)) {
      state.toast = `You already own the ${w.name}.`;
    } else if (state.missionIndex < unlockAt && !state.storyDone) {
      const job = unlockAt === 3 ? 'Getaway Driver' : 'Heatwave';
      state.toast = `The ${w.name} unlocks after the ${job} job.`;
    } else if (p.money < w.price) {
      state.toast = `The ${w.name} costs $${w.price} — you have $${p.money}.`;
    } else {
      p.money -= w.price;
      p.weaponsOwned.push(key);
      p.ammo[key] = 60;
      p.weapon = key;
      sfxCash();
      state.toast = `Bought the ${w.name}! Press ${idx + 2} to use it.`;
    }
  } else if (idx === 5) {
    // Body armour: $300 for +50 armour (caps at 100).
    if ((p.armour || 0) >= PLAYER_MAX_ARMOUR) {
      state.toast = 'Your armour is already full.';
    } else if (p.money < ARMOUR_PRICE) {
      state.toast = `Body armour costs $${ARMOUR_PRICE} — you have $${p.money}.`;
    } else {
      p.money -= ARMOUR_PRICE;
      p.armour = Math.min(PLAYER_MAX_ARMOUR, (p.armour || 0) + ARMOUR_AMOUNT);
      sfxCash();
      state.toast = `Body armour +${ARMOUR_AMOUNT}.`;
    }
  } else {
    // Ammo + outfit: $50 for 60 rounds of the current weapon, or an outfit.
    const w = WEAPONS[p.weapon];
    if (p.weapon === 'pistol') {
      state.toast = 'The pistol never runs dry. Buy a real gun first.';
    } else if (p.money < 50) {
      state.toast = 'Ammo costs $50 — you are short.';
    } else {
      p.money -= 50;
      p.ammo[p.weapon] = (p.ammo[p.weapon] || 0) + 60;
      sfxCash();
      state.toast = `+60 ${w.name} rounds.`;
    }
  }
  state.shopCycle++;
}

export function tryOutfit(state) {
  const p = state.player;
  if (p.money < OUTFIT_PRICE) {
    state.toast = `A fresh outfit costs $${OUTFIT_PRICE}.`;
    state.toastTimer = 2.5;
    return false;
  }
  p.money -= OUTFIT_PRICE;
  state.wantedHeat = Math.max(0, state.wantedHeat - 25);
  state.wantedStars = Math.min(6, Math.floor(state.wantedHeat / 25));
  sfxCash();
  state.toast = 'New outfit — one star of heat, gone.';
  state.toastTimer = 2.5;
  return true;
}

// ---- respray ----

export function tryRespray(state) {
  const p = state.player;
  if (!p.car || state.wantedStars === 0) return false;
  if (p.money < RESPRAY_PRICE) {
    state.toast = `A respray costs $${RESPRAY_PRICE}.`;
    state.toastTimer = 2.5;
    return false;
  }
  p.money -= RESPRAY_PRICE;
  p.car.color = pick(state.rng, PAINT_COLORS);
  // Rebuild the car's look: swap the model colour by re-creating the mesh.
  if (state.board) {
    const old = p.car.model;
    p.car.model = { ...old, color: p.car.color };
    state.board.removeCarMesh(p.car);
  }
  state.wantedHeat = 0;
  state.wantedStars = 0;
  state.wantedState = 'none';
  for (const car of state.cars) {
    if (car.police) car.removed = true;
  }
  state.cars = state.cars.filter((c) => !c.removed);
  if (state.heli) state.heli.active = false;
  sfxCash();
  state.toast = 'Fresh paint — the cops lost you.';
  state.toastTimer = 3;
  pushFeed(state, 'Solmar PD', 'Suspect vehicle lost after a respray. Again. We need better cameras.');
  return true;
}

// ---- safehouse / garage ----

export function safehouseTick(state, dt) {
  const p = state.player;
  const h = LANDMARKS.hideout;
  const near = dist2(p.x, p.z, h.x, h.z) < 14 * 14;
  if (!near) {
    state.safehouseTimer = 0;
    state.safehouseDone = false;
    return;
  }
  state.safehouseTimer = (state.safehouseTimer || 0) + dt;
  if (state.safehouseTimer > 2) {
    // Heal + autosave, once per visit (timer resets on leaving).
    if (!state.safehouseDone) {
      state.safehouseDone = true;
      p.health = 100;
      state.toast = 'Safehouse — healed and saved.';
      state.toastTimer = 2.5;
      if (state.saveFn) state.saveFn();
    }
  }
}

export function storeCarInGarage(state) {
  const p = state.player;
  if (!p.car) return false;
  if (state.garage.length >= GARAGE_MAX_CARS) {
    state.toast = `The garage holds ${GARAGE_MAX_CARS} cars.`;
    state.toastTimer = 2.5;
    return false;
  }
  if (p.car.police || p.car.isVan) {
    state.toast = 'That one stays outside.';
    state.toastTimer = 2.5;
    return false;
  }
  state.garage.push({
    model: p.car.model.name, color: p.car.color, hp: p.car.hp,
    engine: p.car.engine || 0, armor: p.car.armor || 0,
  });
  p.car.removed = true;
  state.cars = state.cars.filter((c) => c !== p.car);
  p.car = null;
  p.onFoot = true;
  state.toast = 'Car stored in the garage (G to manage).';
  state.toastTimer = 2.5;
  return true;
}

export function takeOutGarageCar(state, idx) {
  const p = state.player;
  if (p.car) return false;
  const spec = state.garage[idx];
  if (!spec) return false;
  const h = LANDMARKS.hideout;
  const car = spawnCar(state, spec.model, h.x + 6, h.z + 6, Math.PI / 2, { state: 'player', color: spec.color });
  car.hp = spec.hp;
  car.engine = spec.engine || 0;
  car.armor = spec.armor || 0;
  car.model = { ...car.model, maxSpeed: car.model.maxSpeed * (1 + car.engine * 0.08), accel: car.model.accel * (1 + car.engine * 0.05) };
  car.maxHp = car.model.hp + car.armor * 60;
  car.hp = Math.min(spec.hp, car.maxHp);
  state.garage.splice(idx, 1);
  p.onFoot = false;
  p.car = car;
  state.toast = `Took the ${spec.model} out of the garage.`;
  state.toastTimer = 2.5;
  return true;
}

export function upgradeGarageCar(state, idx, kind) {
  const p = state.player;
  const spec = state.garage[idx];
  if (!spec) return false;
  if (kind === 'engine') {
    if (spec.engine >= 2) { state.toast = 'Engine is maxed.'; state.toastTimer = 2; return false; }
    if (p.money < GARAGE_ENGINE_PRICE) { state.toast = `Engine upgrade costs $${GARAGE_ENGINE_PRICE}.`; state.toastTimer = 2; return false; }
    p.money -= GARAGE_ENGINE_PRICE;
    spec.engine++;
    state.toast = `Engine upgraded (level ${spec.engine}).`;
  } else if (kind === 'armor') {
    if (spec.armor >= 2) { state.toast = 'Armor is maxed.'; state.toastTimer = 2; return false; }
    if (p.money < GARAGE_ARMOR_PRICE) { state.toast = `Armor costs $${GARAGE_ARMOR_PRICE}.`; state.toastTimer = 2; return false; }
    p.money -= GARAGE_ARMOR_PRICE;
    spec.armor++;
    state.toast = `Armor upgraded (level ${spec.armor}).`;
  } else if (kind === 'paint') {
    if (p.money < GARAGE_PAINT_PRICE) { state.toast = `A repaint costs $${GARAGE_PAINT_PRICE}.`; state.toastTimer = 2; return false; }
    p.money -= GARAGE_PAINT_PRICE;
    spec.color = pick(state.rng, PAINT_COLORS);
    state.toast = 'Repainted.';
  }
  state.toastTimer = 2.5;
  sfxCash();
  return true;
}
