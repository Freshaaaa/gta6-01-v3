// Solmar Bay 3D — the DOM HUD. All the flat UI lives in index.html and
// this module updates it from the game state, only touching the DOM when
// a value actually changed. The minimap canvas itself is drawn by the
// board (render3d.js); this module owns everything around it: health,
// cash, wanted stars, clock, radio ticker, objective line, speed,
// prompts, toasts, dialogue boxes, the phone, the garage menu and the
// title / pause / wasted / busted screens.

import { DISTRICTS, LANDMARKS, WEAPON_ORDER, WEAPONS } from './config.js';
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
      // Dense-HUD panels (v12): mission panel, police-response list,
      // location label, weapon slots, car condition, wanted label.
      'mission-panel', 'mp-mission', 'mp-stage', 'mp-obj', 'mp-next', 'mp-timer',
      'police-panel', 'pp-head', 'pp-rows',
      'location-name', 'location-sub', 'wanted-label',
      'weapon-slots', 'car-cond', 'car-cond-fill', 'car-cond-num',
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
    this.show(this.el['wanted-label'], stars > 0);
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
    // Mission panel (top left): mission name + giver/reward, stage,
    // next step and timer. Free roam shows the Hideout prompt instead.
    const m = state.mission;
    if (m) {
      this.set('mp-mission', `MISSION ${state.missionIndex + 1} · ${m.title.toUpperCase()}`);
      this.set('mp-stage', `STAGE ${state.stepIndex + 1}/${m.steps.length}`);
      this.set('mp-obj', `${m.giver} · Reward $${m.reward.toLocaleString('en-US')}`);
      const next = m.steps[state.stepIndex + 1];
      this.set('mp-next', next ? `NEXT  ${next.label}` : 'NEXT  Finish the job');
      const st = state.stepState || {};
      const cur = m.steps[state.stepIndex];
      this.set('mp-timer', cur && cur.type === 'timed' && st.timeLeft != null
        ? `⏱ ${Math.floor(st.timeLeft / 60)}:${String(Math.ceil(st.timeLeft % 60)).padStart(2, '0')} left`
        : '');
    } else {
      this.set('mp-mission', 'FREE ROAM');
      this.set('mp-stage', '');
      this.set('mp-obj', 'Visit the Hideout for work');
      this.set('mp-next', '');
      this.set('mp-timer', '');
    }
    // Police-response list (top left, under the mission panel): the
    // pursuing cruisers by callsign, nearest first, with a role from
    // their distance, plus the helicopter as AIR-1 when it is up.
    const cops = (state.cars || [])
      .filter((c) => c.police && c.state !== 'wreck' && c.state !== 'burning')
      .map((c) => ({ car: c, d: Math.hypot(c.x - p.x, c.z - p.z) }))
      .sort((a, b) => a.d - b.d);
    const heliOn = !!(state.heli && state.heli.active);
    const showPolice = stars > 0 && (cops.length > 0 || heliOn);
    this.show(this.el['police-panel'], showPolice);
    if (showPolice) {
      const total = cops.length + (heliOn ? 1 : 0);
      this.set('pp-head', `🚨 POLICE RESPONSE · ${total} UNIT${total === 1 ? '' : 'S'}`);
      const rows = [];
      if (heliOn) {
        rows.push('<div class="pp-row"><span class="pp-name">AIR-1</span><span class="pp-role flk">SPOTLIGHT</span><span class="pp-dist">—</span></div>');
      }
      for (const { car, d } of cops.slice(0, 5)) {
        const role = d < 15 ? ['RAMMING', 'ram'] : d < 40 ? ['PURSUIT', 'pur'] : d < 100 ? ['FLANKING', 'flk'] : ['RESPONDING', 'resp'];
        rows.push(`<div class="pp-row"><span class="pp-name">${car.callsign || 'SPD'}</span><span class="pp-role ${role[1]}">${role[0]}</span><span class="pp-dist">${Math.round(d)} m</span></div>`);
      }
      if (cops.length > 5) rows.push(`<div class="pp-row"><span class="pp-name">+${cops.length - 5} more units</span><span></span><span></span></div>`);
      const html = rows.join('');
      if (this.last['pp-rows'] !== html) {
        this.last['pp-rows'] = html;
        const el = this.el['pp-rows'];
        if (el) el.innerHTML = html;
      }
    }
    // Location label (above the minimap): district + nearest landmark.
    let district = DISTRICTS[0];
    for (const dd of DISTRICTS) {
      if (p.x >= dd.x0 && p.x < dd.x1 && p.z >= dd.y0 && p.z < dd.y1) { district = dd; break; }
    }
    let nearName = '';
    let nearD = Infinity;
    for (const key of Object.keys(LANDMARKS)) {
      const lm = LANDMARKS[key];
      const dd = Math.hypot(lm.x - p.x, lm.z - p.z);
      if (dd < nearD) { nearD = dd; nearName = lm.name; }
    }
    this.set('location-name', district.name.toUpperCase());
    this.set('location-sub', nearD < 90 ? `near ${nearName}` : 'Solmar Bay');
    // Speed.
    if (!p.onFoot && p.car) {
      const kmh = Math.round(Math.abs(p.car.vF) * 3.6);
      this.set('speed', String(kmh));
      this.set('speed-label', `${p.car.model.name} · km/h`);
    } else {
      this.set('speed', '');
      this.set('speed-label', p.onFoot ? 'On foot' : '');
    }
    // Car condition (bottom right, under the speed): the current car's
    // health as a percentage with a bar, like the top entries show.
    const carCondEl = this.el['car-cond'];
    if (!p.onFoot && p.car) {
      this.show(carCondEl, true);
      const pct = Math.max(0, Math.round((p.car.hp / p.car.maxHp) * 100));
      this.set('car-cond-num', `${pct}%`);
      const fill = this.el['car-cond-fill'];
      if (fill) {
        const w = `${pct}%`;
        if (fill.style.width !== w) fill.style.width = w;
        const col = pct > 50 ? '#2ecc71' : pct > 25 ? '#f39c12' : '#e74c3c';
        if (fill.style.background !== col) fill.style.background = col;
      }
    } else {
      this.show(carCondEl, false);
    }
    // Weapon slots (bottom right, above the speed): every weapon with
    // its key, ammo and locked state; the current one highlighted.
    const slotsHtml = WEAPON_ORDER.map((key, i) => {
      const owned = p.weaponsOwned.includes(key);
      const cur = p.weapon === key;
      const ammo = !owned ? '—' : (p.ammo[key] === Infinity ? '∞' : String(p.ammo[key] ?? 0));
      return `<div class="wslot${cur ? ' cur' : ''}${owned ? '' : ' locked'}"><div class="ws-key">${i + 1}</div><div class="ws-name">${WEAPONS[key].name.toUpperCase()}</div><div class="ws-ammo">${ammo}</div></div>`;
    }).join('');
    if (this.last['weapon-slots'] !== slotsHtml) {
      this.last['weapon-slots'] = slotsHtml;
      const el = this.el['weapon-slots'];
      if (el) el.innerHTML = slotsHtml;
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
