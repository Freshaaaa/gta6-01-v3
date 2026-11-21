// Solmar Bay 3D — save: tiny localStorage save/load (money, position, time).
// Written fresh for the gta6-01 3D rebuild (branch v12-3d).
const KEY = 'solmar-bay-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (typeof d.money !== 'number') return null;
    return d;
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
}
