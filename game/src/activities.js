// Solmar Bay: Heatwave — side activities. Everything outside the story
// missions lives here: taxi fares, street races, sun-coin collectibles,
// the docks chop shop, the Hideout weapon shop, and the money-van heist
// (an armored van that roams the city — crack it on foot for $500).
// Each function works directly on the shared `state` object that main.js
// owns; toasts are set with state.toast + state.toastTimer the same way
// main.js does it.
//
// Player shape (from entities.js): player.onFoot is true on foot,
// player.car is the car object (with .model) while driving, null otherwise.
// Peds have .x/.y and .state ('walk' | 'flee' | 'down').

import {
  CHOP_MODELS, CHOP_REWARD, COIN_REWARD, LANDMARKS, VAN_CRACK_SECONDS,
  VAN_HEAT, VAN_MAX_DELAY, VAN_MIN_DELAY, VAN_REWARD, WEAPONS,
} from './config.js';
import { districtAt, nearestRoad } from './city.js';
import {
  addWanted, burstCash, burstSparks, dist, makeCar,
} from './entities.js';
import { pick } from './rng.js';

function setToast(state, text, seconds) {
  state.toast = text;
  state.toastTimer = seconds || 3;
}

function playerInCar(state) {
  return state.player && !state.player.onFoot && !!state.player.car;
}

// ---------------------------------------------------------------- taxi ---

// Hail the nearest walking pedestrian as a fare. The ped waits where they
// stand (marked ped.taxi) until the player pulls up in a car. Returns true
// when a fare was started, false when nobody is close enough to hail.
export function startTaxiFare(state) {
  if (state.taxi) return false;
  let best = null;
  let bestDist = 500;
  for (const ped of state.peds) {
    if (ped.state !== 'walk' || ped.taxi) continue;
    const d = dist(state.player.x, state.player.y, ped.x, ped.y);
    if (d < bestDist) { bestDist = d; best = ped; }
  }
  if (!best) return false;

  // Destination: a landmark in a different district from where the player
  // is standing now, so the fare is always a real drive.
  const home = districtAt(state.player.x, state.player.y);
  const options = Object.values(LANDMARKS).filter((lm) => districtAt(lm.x, lm.y).name !== home.name);
  const dest = pick(state.rng, options.length ? options : Object.values(LANDMARKS));

  best.taxi = true;
  best.state = 'wait';
  state.taxi = {
    passenger: best, dest, timer: 90, fare: 150, pickedUp: false, waitLeft: 60,
  };
  setToast(state, `Fare waiting — pick them up and take them to ${dest.name}`, 3);
  return true;
}

export function updateTaxi(state, dt, audio) {
  const taxi = state.taxi;
  if (!taxi) return;
  const p = state.player;

  if (!taxi.pickedUp) {
    // The passenger only waits so long for a car to show up.
    if (playerInCar(state)) {
      // A car arrived: give the passenger a little more patience while the
      // player closes the last few metres.
      taxi.waitLeft = Math.max(taxi.waitLeft, 5);
    } else {
      taxi.waitLeft -= dt;
      if (taxi.waitLeft <= 0) {
        // Cancel quietly: the ped gives up and walks off.
        taxi.passenger.taxi = false;
        if (taxi.passenger.state === 'wait') taxi.passenger.state = 'walk';
        state.taxi = null;
        return;
      }
    }
    if (!state.peds.includes(taxi.passenger)) { state.taxi = null; return; }
    if (playerInCar(state) && dist(p.x, p.y, taxi.passenger.x, taxi.passenger.y) < 40) {
      const idx = state.peds.indexOf(taxi.passenger);
      if (idx >= 0) state.peds.splice(idx, 1);
      taxi.pickedUp = true;
      setToast(state, `Passenger aboard — take them to ${taxi.dest.name}`, 3);
      if (audio) audio.pickup();
    }
    return;
  }

  // The clock only runs once the passenger is aboard.
  taxi.timer -= dt;
  if (dist(p.x, p.y, taxi.dest.x, taxi.dest.y) < 90) {
    const tip = Math.max(0, Math.round(taxi.timer) * 2);
    const total = taxi.fare + tip;
    state.money += total;
    state.stats.taxiDone += 1;
    state.stats.faresEarned += total;
    setToast(state, `Fare complete +$${total} (tip $${tip})`, 3);
    if (audio) audio.cash();
    state.taxi = null;
    return;
  }
  if (taxi.timer <= 0) {
    setToast(state, 'Fare cancelled — too slow', 3);
    state.taxi = null;
  }
}

// ---------------------------------------------------------------- races ---

// Start a street race: four checkpoints forming a loop of roughly 1200 px
// around the player, each corner snapped onto a road intersection. The
// player must be in a car to make the timer fair — main.js only offers the
// race while driving. Returns true when the race was started.
export function startRace(state) {
  if (state.race) return false;
  const px = state.player.x;
  const py = state.player.y;
  const half = 600;
  const corners = [
    [px - half, py - half], [px + half, py - half],
    [px + half, py + half], [px - half, py + half],
  ];
  const checkpoints = corners.map(([cx, cy]) => ({
    x: Math.max(200, Math.min(3400, nearestRoad(cx))),
    y: Math.max(200, Math.min(3400, nearestRoad(cy))),
  }));
  state.race = { checkpoints, index: 0, timeLeft: 120 };
  setToast(state, 'RACE! Hit all 4 checkpoints — 120s', 3);
  return true;
}

export function updateRace(state, dt, audio) {
  const race = state.race;
  if (!race) return;
  race.timeLeft -= dt;
  const next = race.checkpoints[race.index];
  if (next && dist(state.player.x, state.player.y, next.x, next.y) < 90) {
    race.index += 1;
    if (audio) audio.pickup();
    if (race.index >= race.checkpoints.length) {
      state.money += 250;
      state.stats.racesWon += 1;
      setToast(state, 'RACE WON +$250', 4);
      if (audio) audio.missionDone();
      state.race = null;
      return;
    }
    setToast(state, `CHECKPOINT ${race.index}/4`, 1.5);
  }
  if (race.timeLeft <= 0) {
    setToast(state, 'Race over — too slow', 3);
    state.race = null;
  }
}

// --------------------------------------------------------- collectibles ---

// Sun-coins: walk over one to collect it. Coin order is deterministic from
// the seed, so on save-load main.js marks the first N coins taken by
// coinsCollected count.
export function checkCollectibles(state, audio) {
  const p = state.player;
  for (const coin of state.city.coins) {
    if (coin.taken) continue;
    if (dist(p.x, p.y, coin.x, coin.y) < 28) {
      coin.taken = true;
      state.coinsCollected += 1;
      state.money += COIN_REWARD;
      setToast(state, `SUN-COIN ${state.coinsCollected}/20  +$${COIN_REWARD}`, 2);
      if (audio) audio.pickup();
    }
  }
}

// ------------------------------------------------------------ chop shop ---

// The docks chop shop only pays for fast cars (CHOP_MODELS).
export function chopShopPrompt(state) {
  if (!playerInCar(state)) return null;
  const car = state.player.car;
  if (!CHOP_MODELS.includes(car.model)) return null;
  if (dist(state.player.x, state.player.y, LANDMARKS.docks.x, LANDMARKS.docks.y) > 110) return null;
  return `Press E to sell the ${car.model} ($${CHOP_REWARD})`;
}

export function tryChopShop(state, audio) {
  if (!chopShopPrompt(state)) return false;
  const car = state.player.car;
  const idx = state.cars.indexOf(car);
  if (idx >= 0) state.cars.splice(idx, 1);
  // Step out beside where the car was.
  state.player.car = null;
  state.player.onFoot = true;
  state.player.x = car.x + 44;
  state.player.y = car.y;
  state.player.speed = 0;
  state.money += CHOP_REWARD;
  state.chopWanted = pick(state.rng, CHOP_MODELS);
  setToast(state, `Sold the ${car.model} for $${CHOP_REWARD}`, 3);
  if (audio) audio.cash();
  return true;
}

// ------------------------------------------------------------ money van ---

// The money van: an armored van (kind 'van', 400 hp, never drives) that
// appears on a timer. Crack it on foot — hold E beside it for 3 s — for
// $500 and 3 stars of heat. Blowing it up with bullets pays nothing.
// `near` pins the spawn for the playtest; in the game it parks just ahead
// of the player.
export function startVan(state, near) {
  if (state.van) return false;
  const px = near ? near.x : state.player.x + 120;
  const py = near ? near.y : state.player.y;
  const car = makeCar(px, py, 0, 'van', state.rng);
  state.cars.push(car);
  state.van = { car, crackLeft: VAN_CRACK_SECONDS };
  setToast(state, 'MONEY VAN spotted — crack it on foot (hold E) for $500', 4);
  return true;
}

export function updateVan(state, dt, audio) {
  // The van is wrecked (bullets): the heist is off, no payout.
  if (state.van && !state.cars.includes(state.van.car)) {
    state.van = null;
    state.vanCracking = false;
    setToast(state, 'The money van went up in smoke — no payout', 3);
  }
  if (!state.van) {
    state.vanTimer -= dt;
    if (state.vanTimer <= 0) {
      state.vanTimer = VAN_MIN_DELAY + state.rng() * (VAN_MAX_DELAY - VAN_MIN_DELAY);
      startVan(state);
    }
    return;
  }
  const van = state.van;
  const p = state.player;
  const near = p.onFoot && dist(p.x, p.y, van.car.x, van.car.y) < 70;
  if (near && state.holdingE) {
    van.crackLeft -= dt;
    state.vanCracking = true;
    if (Math.random() < 0.3) burstSparks(state, van.car.x, van.car.y);
    if (van.crackLeft <= 0) {
      const idx = state.cars.indexOf(van.car);
      if (idx >= 0) state.cars.splice(idx, 1);
      state.van = null;
      state.vanCracking = false;
      state.money += VAN_REWARD;
      state.stats.vansRobbed += 1;
      addWanted(state, VAN_HEAT);
      burstCash(state, p.x, p.y);
      setToast(state, `MONEY VAN CRACKED +$${VAN_REWARD} — the cops are coming`, 4);
      if (audio) audio.cash();
      state.vanTimer = VAN_MIN_DELAY + state.rng() * (VAN_MAX_DELAY - VAN_MIN_DELAY);
    }
  } else {
    // Step away (or let go of E) and the crack resets.
    van.crackLeft = VAN_CRACK_SECONDS;
    state.vanCracking = false;
  }
}

// The E prompt while the player stands beside the van on foot.
export function vanPrompt(state) {
  if (!state.van || !state.player.onFoot) return null;
  if (dist(state.player.x, state.player.y, state.van.car.x, state.van.car.y) > 70) return null;
  return state.vanCracking
    ? `Cracking the van… ${Math.ceil(state.van.crackLeft)}s — keep holding E`
    : 'Hold E to crack the money van ($500)';
}

// ---------------------------------------------------------- weapon shop ---

// The Hideout shop: SMG first, then shotgun, then the rifle, then ammo top-ups.
function nextShopItem(state) {
  if (!state.weaponsOwned.smg) return { key: 'smg', label: 'SMG', price: WEAPONS.smg.price };
  if (!state.weaponsOwned.shotgun) return { key: 'shotgun', label: 'Shotgun', price: WEAPONS.shotgun.price };
  if (!state.weaponsOwned.rifle) return { key: 'rifle', label: 'Rifle', price: WEAPONS.rifle.price };
  return { key: 'ammo', label: 'ammo +48', price: 50 };
}

function shopInRange(state) {
  return state.player
    && state.player.onFoot
    && dist(state.player.x, state.player.y, LANDMARKS.hideout.x, LANDMARKS.hideout.y) < 100;
}

export function shopPrompt(state) {
  if (!shopInRange(state)) return null;
  const item = nextShopItem(state);
  return `Press E — buy ${item.label} ($${item.price})`;
}

export function tryBuyWeapon(state, audio) {
  if (!shopInRange(state)) return false;
  const item = nextShopItem(state);
  if (state.money < item.price) {
    setToast(state, 'Not enough cash', 2);
    return false;
  }
  state.money -= item.price;
  if (item.key === 'ammo') {
    state.ammo += 48;
    setToast(state, 'Bought ammo +48', 2);
  } else {
    state.weaponsOwned[item.key] = true;
    state.weapon = item.key;
    setToast(state, `Bought the ${item.label} — equipped`, 3);
  }
  if (audio) audio.cash();
  return true;
}
