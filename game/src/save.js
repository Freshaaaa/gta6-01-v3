// Solmar Bay 3D — save / load through localStorage. Saves the player's
// cash, reputation, collectibles, weapons, health, ammo, wanted heat,
// position, mission progress, garage, money-van heists and the clock, so
// a session can be continued from the title screen. Nothing leaves the
// browser. Version 1 is for the 3D game only (2D saves are not loaded).

import { SAVE_KEY } from './config.js';

export function saveGame(state) {
  try {
    const p = state.player;
    const data = {
      version: 1,
      money: Math.floor(p.money),
      rep: p.rep,
      health: p.health,
      armour: p.armour || 0,
      weaponsOwned: p.weaponsOwned,
      weapon: p.weapon,
      ammo: p.ammo,
      wantedHeat: state.wantedHeat,
      x: p.x,
      z: p.z,
      yaw: p.yaw,
      clockMinutes: state.clockMinutes,
      day: state.day || 1,
      missionIndex: state.missionIndex,
      stepIndex: state.stepIndex,
      storyDone: state.storyDone,
      courierIndex: state.courierIndex,
      coinsCollected: state.coinsCollected,
      coinsTaken: state.city.coins.map((c) => c.taken),
      garage: state.garage,
      vansRobbed: state.vansRobbed,
      feed: state.feed.slice(0, 6),
      shopCycle: state.shopCycle,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) { /* ignore */ }
}
