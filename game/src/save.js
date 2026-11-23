// Solmar Bay 3D — save / load (v5, written from the brief).
// One localStorage key, three visible slots on the title screen.
// Save shape: { money, x, z, time, health, mission, weapons, coins }.
// weapons: { current, ammo: [null, mag1, mag2, ...], reserve: [...] }.

import { SAVE_KEY, START_MONEY } from './config.js';

export function defaultSave() {
  return {
    money: START_MONEY,
    x: 0, z: 0,
    time: 17.5, // 17:30 golden hour
    health: 100,
    mission: 0, // current mission index (0-7); unlocked = mission
    weapons: { current: 0, ammo: [null, 12, 30], reserve: [null, 48, 120] },
    coins: [], // collected coin ids (0 = sun coin at 0,270); fresh = none
  };
}

export function readSaveRaw() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed;
  } catch (e) { return null; }
}

export function readSave() {
  const s = readSaveRaw();
  return s ? JSON.stringify(s) : null;
}

export function writeSave(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
}

// Merge a partial save over the defaults (old saves stay loadable).
export function normalizeSave(raw) {
  const d = defaultSave();
  if (!raw) return d;
  for (const k of Object.keys(d)) {
    if (raw[k] !== undefined) d[k] = raw[k];
  }
  if (!d.weapons || typeof d.weapons !== 'object') d.weapons = defaultSave().weapons;
  if (!Array.isArray(d.weapons.ammo)) d.weapons.ammo = [null, 12, 30];
  if (!Array.isArray(d.weapons.reserve)) d.weapons.reserve = [null, 48, 120];
  if (!Array.isArray(d.coins)) d.coins = [];
  return d;
}

// Slot summaries for the title screen (3 slots; slot 1 is the live save).
export function slotSummaries() {
  const slots = [];
  const live = readSaveRaw();
  slots.push(live
    ? { label: 'Slot 1 — Continue', money: live.money ?? 0, mission: live.mission ?? 0, time: live.time ?? 17.5 }
    : { label: 'Slot 1 — Empty', money: null, mission: null, time: null });
  slots.push({ label: 'Slot 2 — Empty', money: null, mission: null, time: null });
  slots.push({ label: 'Slot 3 — Empty', money: null, mission: null, time: null });
  return slots;
}
