// Solmar Bay: Heatwave — weapons. One factory for every shot in the game:
// the player, the goons and the police helicopter all fire through
// fireWeapon, so a bullet always carries the same fields and the same
// spread behaviour no matter who pulled the trigger. Each weapon also
// gets its own tracer colour (pistol gold, SMG amber, shotgun orange,
// rifle cyan) so the player can read who is shooting at a glance.

import { WEAPONS } from './config.js';

export { WEAPONS };

// Tracer colour per weapon id.
const TRACER = { pistol: '#f7dc6f', smg: '#ffb347', shotgun: '#ff9f43', rifle: '#7fe7ff' };

// Human-readable name for a weapon id; falls back to the id itself so the
// HUD never shows "undefined" for a bad id.
export function weaponLabel(id) {
  const def = WEAPONS[id];
  return def ? def.name : String(id);
}

// Spawn one trigger pull's worth of bullets at (x, y) heading `angle`.
// `from` is 'player' or 'enemy' (updateBullets decides what each may hit).
// `damageOverride` replaces the weapon's base damage for that shot — the
// helicopter's bursts and the goons' pistols both use it.
// Returns true when bullets were spawned, false for an unknown weapon.
export function fireWeapon(state, x, y, angle, weaponId, from, damageOverride) {
  const def = WEAPONS[weaponId];
  if (!def) return false;
  const rng = state.rng;
  // The shotgun is a slower, fatter cloud; pistol and SMG are fast tracers.
  const speed = weaponId === 'shotgun' ? 640 : 720;
  const damage = damageOverride !== undefined && damageOverride !== null
    ? damageOverride
    : def.damage;
  // Muzzle offset so a fresh bullet does not instantly collide with the
  // shooter's own feet or car.
  const mx = x + Math.cos(angle) * 16;
  const my = y + Math.sin(angle) * 16;
  for (let i = 0; i < def.pellets; i += 1) {
    // Triangular-ish spread: the sum of two uniform draws clusters near
    // the aim point instead of spraying evenly across the whole cone.
    const wobble = (rng() + rng() - 1) * def.spread;
    const a = angle + wobble;
    state.bullets.push({
      x: mx,
      y: my,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      from,
      life: 0.9,
      damage,
      color: TRACER[weaponId] || '#f7dc6f',
    });
  }
  return true;
}
