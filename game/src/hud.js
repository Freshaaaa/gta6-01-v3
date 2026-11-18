// Solmar Bay 3D — the DOM HUD. All the flat UI lives in index.html and
// this module updates it from the game state, only touching the DOM when
// a value actually changed. The minimap canvas itself is drawn by the
// board (render3d.js); this module owns everything around it: health,
// cash, wanted stars, clock, radio ticker, objective line, speed,
// prompts, toasts, dialogue boxes, the phone, the garage menu and the
// title / pause / wasted / busted screens.

import { WEAPON_ORDER, WEAPONS } from './config.js';
import { objectiveText } from './missions.js';
import { stationDj, stationName, trackName } from './audio.js';

function fmtClock(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function weatherLabel(w) {
  return w === 'storm' ? '⛈ Storm' : w === 'rain' ? '🌧 Rain' : '☀️ Clear';
}

export class Hud {
  constructor(doc) {
    this.d = doc;
    this.el = {};
    const ids = [
      'hud', 'health-fill', 'health-num', 'cash', 'stars', 'clock', 'weather',
      'radio', 'objective', 'speed', 'speed-label', 'toast', 'prompt', 'dialogue',
      'dialogue-name', 'dialogue-text', 'phone', 'phone-feed', 'phone-contacts',
      'garage', 'garage-list', 'menu', 'menu-title', 'menu-sub', 'menu-hint',
      'mission-banner', 'mission-banner-title', 'mission-banner-sub',
      'wanted-flash', 'weapon', 'ammo',
    ];
    for (const id of ids) this.el[id] = doc.getElementById(id);
    this.last = {};
  }

  set(id, value) {
    if (this.last[id] === value) return;
    this.last[id] = value;
    const el = this.el[id];
    if (el) el.textContent = value;
  }

  show(el, on) {
    if (!el) return;
    const want = on ? 'block' : 'none';
    if (el.style.display !== want) el.style.display = want;
  }

  update(state, dt) {
    const p = state.player;
    const d = this.d;
    // Health.
    const hp = Math.max(0, Math.round(p.health));
    this.set('health-num', String(hp));
    const fill = this.el['health-fill'];
    if (fill) {
      const w = `${hp}%`;
      if (fill.style.width !== w) fill.style.width = w;
      const col = hp > 50 ? '#2ecc71' : hp > 25 ? '#f39c12' : '#e74c3c';
      if (fill.style.background !== col) fill.style.background = col;
    }
    // Cash / stars / clock / weather.
    this.set('cash', `$${Math.floor(p.money).toLocaleString('en-US')}`);
    const stars = state.wantedStars || 0;
    const starStr = '★'.repeat(stars) + '☆'.repeat(6 - stars);
    this.set('stars', starStr);
    const starsEl = this.el.stars;
    if (starsEl) {
      const cls = stars > 0 && state.wantedState === 'escaping' ? 'stars flashing' : 'stars';
      if (starsEl.className !== cls) starsEl.className = cls;
      starsEl.style.color = stars > 0 ? '#ffd700' : 'rgba(255,255,255,0.35)';
    }
    this.set('clock', fmtClock(state.clockMinutes));
    this.set('weather', weatherLabel(state.weather));
    // Radio ticker.
    this.set('radio', `♪ ${stationName()} — ${trackName()} · ${stationDj()}`);
    // Objective.
    this.set('objective', objectiveText(state.mission, state.stepIndex, state.stepState));
    // Speed.
    if (!p.onFoot && p.car) {
      const kmh = Math.round(Math.abs(p.car.vF) * 3.6);
      this.set('speed', String(kmh));
      this.set('speed-label', `${p.car.model.name} · km/h`);
    } else {
      this.set('speed', '');
      this.set('speed-label', p.onFoot ? 'On foot' : '');
    }
    // Weapon + ammo.
    const w = WEAPONS[p.weapon];
    this.set('weapon', w ? w.name : '');
    const ammo = p.ammo[p.weapon];
    this.set('ammo', ammo === Infinity ? '∞' : String(ammo ?? 0));
    // Toast.
    const toastEl = this.el.toast;
    if (toastEl) {
      if (state.toastTimer > 0 && state.toast) {
        if (toastEl.textContent !== state.toast) toastEl.textContent = state.toast;
        toastEl.style.opacity = '1';
      } else {
        toastEl.style.opacity = '0';
      }
    }
    // Prompt (context action line).
    this.set('prompt', state.prompt || '');
    // Dialogue.
    const dlg = state.dialogue;
    if (dlg && dlg.length > 0) {
      this.show(this.el.dialogue, true);
      const line = dlg[state.dialogueIndex] || '';
      const name = line.split(':')[0] || '';
      this.set('dialogue-name', name);
      this.set('dialogue-text', line);
    } else {
      this.show(this.el.dialogue, false);
    }
    // Wanted flash overlay when busted is near.
    const flashEl = this.el['wanted-flash'];
    if (flashEl) {
      const near = p.bustedTimer > 0.5;
      flashEl.style.opacity = near ? String(0.25 + 0.2 * Math.sin(performance.now() / 120)) : '0';
    }
    // Mission banner.
    const banner = this.el['mission-banner'];
    if (banner) {
      if (state.bannerTimer > 0 && state.bannerTitle) {
        banner.style.opacity = '1';
        this.set('mission-banner-title', state.bannerTitle);
        this.set('mission-banner-sub', state.bannerSub || '');
      } else {
        banner.style.opacity = '0';
      }
    }
  }

  renderPhone(state) {
    const phone = this.el.phone;
    if (!phone) return;
    this.show(phone, !!state.phoneOpen);
    if (!state.phoneOpen) return;
    const feed = this.el['phone-feed'];
    if (feed) {
      const html = state.feed.map((f) => `<div class="feed-post"><b>${f.user}</b><span>${f.text}</span></div>`).join('');
      if (feed.innerHTML !== html) feed.innerHTML = html;
    }
    const contacts = this.el['phone-contacts'];
    if (contacts) {
      const html = state.contacts.map((c) => `<div class="contact"><b>${c.name}</b><span>${c.note}</span></div>`).join('');
      if (contacts.innerHTML !== html) contacts.innerHTML = html;
    }
  }

  renderGarage(state) {
    const g = this.el.garage;
    if (!g) return;
    this.show(g, !!state.garageOpen);
    if (!state.garageOpen) return;
    const list = this.el['garage-list'];
    if (!list) return;
    const rows = [];
    rows.push('<div class="garage-row garage-head"><span>Car</span><span>Engine</span><span>Armor</span><span></span></div>');
    state.garage.forEach((car, i) => {
      rows.push(
        `<div class="garage-row"><span style="color:${car.color}">■ ${car.model}</span>` +
        `<span>Eng ${car.engine || 0}/2</span><span>Arm ${car.armor || 0}/2</span>` +
        `<span>[${i + 1}] take out</span></div>`,
      );
    });
    rows.push('<div class="garage-hint">0 store current car · 1–3 take out · 4 engine $400 · 5 armor $300 · 6 paint $150 · G close</div>');
    const html = rows.join('');
    if (list.innerHTML !== html) list.innerHTML = html;
  }

  showMenu(kind, title, sub, hint) {
    const menu = this.el.menu;
    if (!menu) return;
    this.show(menu, true);
    this.set('menu-title', title);
    this.set('menu-sub', sub);
    this.set('menu-hint', hint);
    menu.dataset.kind = kind;
  }

  hideMenu() {
    this.show(this.el.menu, false);
  }
}
