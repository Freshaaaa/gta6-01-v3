// Solmar Bay 3D — save: localStorage save slots and the progressed-save format.
// Slot 1 is the live slot the game reads on boot and writes with saveNow().
// The other two slots exist so the title screen can show three save slots
// with real progress. Everything is plain JSON; nothing leaves the browser.
const SAVE_KEY = 'solmar-bay-save-v1';
const SAVE_KEY_2 = 'solmar-bay-save-v2';
const SAVE_KEY_3 = 'solmar-bay-save-v3';
const SLOT_KEYS = [SAVE_KEY, SAVE_KEY_2, SAVE_KEY_3];

// Build the save object the game writes. money, position, clock, health,
// the highest mission unlocked, the weapon loadout and the collected coins.
export function makeSave(state) {
  return {
    money: Math.round(state.money),
    x: Math.round(state.player.x * 10) / 10,
    z: Math.round(state.player.z * 10) / 10,
    time: Math.round(state.timeOfDay * 100) / 100,
    health: Math.round(state.player.health),
    mission: state.mission.unlocked,
    weapons: {
      current: state.weapons.current,
      ammo: state.weapons.ammo.slice(),
      reserve: state.weapons.reserve.slice(),
    },
    coins: state.coinsCollected.slice(),
  };
}

// Parse a stored save. Returns null when the slot is empty or corrupt, so a
// bad slot never blocks the boot — the game just starts fresh.
export function parseSave(raw) {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    if (typeof s !== 'object' || s === null) return null;
    if (typeof s.money !== 'number') return null;
    return s;
  } catch {
    return null;
  }
}

// Read slot 1 as a JSON string (the playtest asserts the string holds "money").
export function readSaveString() {
  try {
    return window.localStorage.getItem(SAVE_KEY) || '';
  } catch {
    return '';
  }
}

// Write slot 1 now. Returns true when the write landed.
export function writeSave(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(makeSave(state)));
    return true;
  } catch {
    return false;
  }
}

// Read a slot (0, 1 or 2) as a parsed object, or null when it is empty.
export function readSlot(index) {
  const key = SLOT_KEYS[index] || SAVE_KEY;
  try {
    return parseSave(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

// Copy the live slot into another slot (the title screen's Load Game path).
export function copySlot(fromIndex, toIndex) {
  const from = SLOT_KEYS[fromIndex] || SAVE_KEY;
  const to = SLOT_KEYS[toIndex] || SAVE_KEY;
  try {
    const raw = window.localStorage.getItem(from);
    if (!raw) return false;
    window.localStorage.setItem(to, raw);
    return true;
  } catch {
    return false;
  }
}

// Apply a parsed save onto the live state. Only fields the save actually
// carries are applied, so an old or partial save can never corrupt a run.
export function applySave(state, save) {
  if (!save) return;
  if (typeof save.money === 'number') state.money = save.money;
  if (typeof save.x === 'number') state.player.x = save.x;
  if (typeof save.z === 'number') state.player.z = save.z;
  if (typeof save.time === 'number') state.timeOfDay = save.time;
  if (typeof save.health === 'number') state.player.health = save.health;
  if (typeof save.mission === 'number') state.mission.unlocked = save.mission;
  if (save.weapons && typeof save.weapons === 'object') {
    if (typeof save.weapons.current === 'number') state.weapons.current = save.weapons.current;
    if (Array.isArray(save.weapons.ammo)) state.weapons.ammo = save.weapons.ammo.slice();
    if (Array.isArray(save.weapons.reserve)) state.weapons.reserve = save.weapons.reserve.slice();
  }
  if (Array.isArray(save.coins)) state.coinsCollected = save.coins.slice();
}

// A short human line for a save slot on the title screen ("$7,122 — M7 — 17:30").
export function slotSummary(save) {
  if (!save) return 'Empty slot';
  const money = typeof save.money === 'number' ? save.money : 0;
  const mission = typeof save.mission === 'number' ? save.mission : 0;
  const h = Math.floor(save.time || 0);
  const m = Math.floor(((save.time || 0) - h) * 60);
  const clock = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  return '$' + money.toLocaleString('en-US') + ' — M' + mission + ' — ' + clock;
}
