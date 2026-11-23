// Solmar Bay 3D — hud: every DOM panel the player sees. Top-left money +
// wanted stars + district; top-centre the mission banner, STAGE, next
// objective and timer; top-right the minimap and clock; bottom-left health
// and the crew boxes; bottom-centre the weapon slots; bottom-right speed,
// car name and gear; and the dialogue box above the car. The minimap is a
// 200x200 canvas (grid + blips); the map screen carries a 480x480 big map.
import { WEAPON_DEFS } from './weapons.js';
import { slotSummary, readSlot } from './save.js';

const DISTRICTS = [
  { name: 'MARINA', test: (x, z) => z > 150 },
  { name: 'DOWNTOWN', test: (x, z) => Math.abs(x) < 104 && Math.abs(z) < 104 },
  { name: 'NORTHSIDE', test: (x, z) => z < -150 },
  { name: 'WEST END', test: (x, z) => x < -104 },
  { name: 'EAST SIDE', test: (x, z) => x > 104 },
  { name: 'MIDTOWN', test: () => true },
];

export function createHud(G) {
  const el = (id) => document.getElementById(id);
  const hud = {
    moneyEl: el('money'),
    starsEl: el('stars'),
    districtEl: el('district'),
    bannerEl: el('mission-banner'),
    stageEl: el('stage'),
    objectiveEl: el('objective'),
    timerEl: el('mission-timer'),
    clockEl: el('clock'),
    healthFill: el('health-fill'),
    healthText: el('health-text'),
    crewEls: [el('crew-mara'), el('crew-rico'), el('crew-lena')],
    weaponEls: [el('slot-1'), el('slot-2'), el('slot-3'), el('slot-4'), el('slot-5')],
    speedEl: el('speed'),
    gearEl: el('gear'),
    carEl: el('car-name'),
    dialogEl: el('dialogue'),
    dialogText: el('dialogue-text'),
    promptEl: el('prompt'),
    minimap: el('minimap'),
    bigmap: el('bigmap'),
    flashEl: el('flash-message'),
    mapTime: 0,
    bannerT: 0,
    flashT: 0,

    setMoney(v) {
      this.moneyEl.textContent = '$' + Math.round(v).toLocaleString('en-US');
    },

    setWanted(n) {
      let stars = '';
      for (let i = 0; i < 5; i++) stars += i < n ? '★' : '☆';
      this.starsEl.textContent = stars;
      this.starsEl.style.color = n >= 3 ? '#ff5040' : '#ffd75e';
    },

    setDistrict() {
      const x = G.player.x;
      const z = G.player.z;
      for (const d of DISTRICTS) {
        if (d.test(x, z)) {
          this.districtEl.textContent = d.name;
          return;
        }
      }
    },

    setHealth(v) {
      const pct = Math.max(0, Math.min(100, v));
      this.healthFill.style.width = pct + '%';
      this.healthText.textContent = Math.round(pct);
      this.healthFill.style.background = pct > 50 ? '#58c96a' : pct > 25 ? '#e8b83a' : '#e84a3a';
    },

    setMission() {
      const m = G.mission;
      const def = G.missionSystem.defs[m.current];
      this.stageEl.textContent = 'STAGE ' + (m.current + 1) + '/8';
      this.bannerEl.textContent = def ? def.name.toUpperCase() : 'FREE ROAM';
    },

    setObjective(text) {
      this.objectiveEl.textContent = 'NEXT: ' + text;
    },

    setWeapon(text) {
      const w = G.weapons;
      this.weaponEls.forEach((slot, i) => {
        const def = WEAPON_DEFS[i];
        slot.classList.toggle('active', w.current === i);
        slot.classList.toggle('locked', !!def.locked);
        const name = slot.querySelector('.w-name');
        const sub = slot.querySelector('.w-sub');
        if (name) name.textContent = def.name;
        if (sub) {
          if (def.locked) {
            sub.textContent = 'LOCKED $' + def.price.toLocaleString('en-US');
          } else if (i === 0) {
            sub.textContent = '—';
          } else {
            sub.textContent = w.ammo[i] + '/' + w.reserve[i];
          }
        }
      });
      const cur = el('weapon-current');
      if (cur) cur.textContent = text;
    },

    setSpeed(kmh, gear, carName) {
      this.speedEl.textContent = String(Math.round(kmh));
      this.gearEl.textContent = gear;
      this.carEl.textContent = carName || 'On foot';
    },

    setClock() {
      const h = Math.floor(G.timeOfDay);
      const m = Math.floor((G.timeOfDay - h) * 60);
      this.clockEl.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    },

    setTimer(seconds) {
      const s = Math.max(0, Math.ceil(seconds));
      const m = Math.floor(s / 60);
      this.timerEl.textContent = String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    },

    showBanner(text) {
      this.bannerEl.textContent = text;
      this.bannerT = 4;
    },

    flashMessage(text) {
      this.flashEl.textContent = text;
      this.flashEl.style.opacity = '1';
      this.flashT = 2.5;
    },

    setDialog(speaker, line) {
      this.dialogText.textContent = speaker + ': ' + line;
      this.dialogEl.style.display = 'block';
    },

    hideDialog() {
      this.dialogEl.style.display = 'none';
    },

    setPrompt(text) {
      if (text) {
        this.promptEl.textContent = text;
        this.promptEl.style.display = 'block';
      } else {
        this.promptEl.style.display = 'none';
      }
    },

    // The minimap: dark ground, grey street grid, the player (green), the
    // police (blue), the mission marker (yellow) and the taxi (amber).
    drawMinimap() {
      const c = this.minimap;
      if (!c) return;
      const g = c.getContext('2d');
      const S = 200;
      const toMap = (x, z) => [((x + 280) / 560) * S, ((z + 280) / 560) * S];
      g.fillStyle = '#101418';
      g.fillRect(0, 0, S, S);
      g.strokeStyle = '#4a5058';
      g.lineWidth = 1;
      for (let s = -260; s <= 260; s += 52) {
        const [x1] = toMap(s, 0);
        g.beginPath(); g.moveTo(x1, 0); g.lineTo(x1, S); g.stroke();
        const [, z1] = toMap(0, s);
        g.beginPath(); g.moveTo(0, z1); g.lineTo(S, z1); g.stroke();
      }
      // Beach + ocean strip at the bottom (south).
      g.fillStyle = '#2a6a9a';
      const [, zb] = toMap(0, 280);
      g.fillRect(0, zb, S, S - zb);
      g.fillStyle = '#d8c898';
      const [, zs] = toMap(0, 260);
      g.fillRect(0, zs, S, zb - zs);
      // Mission marker.
      if (G.marker) {
        const [mx, mz] = toMap(G.marker.x, G.marker.z);
        g.fillStyle = '#ffd75e';
        g.beginPath(); g.arc(mx, mz, 4, 0, Math.PI * 2); g.fill();
      }
      // Police blips.
      g.fillStyle = '#3a7aff';
      for (const car of G.policeCars) {
        const [px, pz] = toMap(car.x, car.z);
        g.beginPath(); g.arc(px, pz, 3, 0, Math.PI * 2); g.fill();
      }
      // Taxi blip.
      if (G.taxiCar && G.taxiState !== 'idle') {
        const [tx, tz] = toMap(G.taxiCar.x, G.taxiCar.z);
        g.fillStyle = '#e8b83a';
        g.beginPath(); g.arc(tx, tz, 3, 0, Math.PI * 2); g.fill();
      }
      // Player blip (a green triangle pointing along the heading).
      const [px, pz] = toMap(G.player.x, G.player.z);
      g.fillStyle = '#58c96a';
      g.beginPath();
      g.moveTo(px + Math.sin(G.player.heading) * 6, pz + Math.cos(G.player.heading) * 6);
      g.lineTo(px + Math.sin(G.player.heading + 2.4) * 5, pz + Math.cos(G.player.heading + 2.4) * 5);
      g.lineTo(px + Math.sin(G.player.heading - 2.4) * 5, pz + Math.cos(G.player.heading - 2.4) * 5);
      g.closePath();
      g.fill();
      // A white ring so the blip reads on the dark map.
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.beginPath(); g.arc(px, pz, 7, 0, Math.PI * 2); g.stroke();
    },

    // The big map: the full city on a 480 canvas, with district labels
    // and the player's stats beside it.
    drawBigmap() {
      const c = this.bigmap;
      if (!c) return;
      const g = c.getContext('2d');
      const S = 480;
      const toMap = (x, z) => [((x + 280) / 560) * S, ((z + 280) / 560) * S];
      g.fillStyle = '#0e1216';
      g.fillRect(0, 0, S, S);
      g.strokeStyle = '#565e68';
      g.lineWidth = 1.5;
      for (let s = -260; s <= 260; s += 52) {
        const [x1] = toMap(s, 0);
        g.beginPath(); g.moveTo(x1, 0); g.lineTo(x1, S); g.stroke();
        const [, z1] = toMap(0, s);
        g.beginPath(); g.moveTo(0, z1); g.lineTo(S, z1); g.stroke();
      }
      // Ocean + sand at the south edge.
      g.fillStyle = '#2a6a9a';
      const [, zb] = toMap(0, 280);
      g.fillRect(0, zb, S, S - zb);
      g.fillStyle = '#d8c898';
      const [, zs] = toMap(0, 260);
      g.fillRect(0, zs, S, zb - zs);
      // Park block.
      g.fillStyle = '#3a6a3a';
      const [pkx, pkz] = toMap(56, 56);
      g.fillRect(pkx, pkz, 34, 34);
      // District labels.
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.font = 'bold 15px sans-serif';
      g.textAlign = 'center';
      const labels = [
        ['DOWNTOWN', 0, 0], ['MARINA', 0, 210], ['NORTHSIDE', 0, -210],
        ['WEST END', -210, 0], ['EAST SIDE', 210, 0],
      ];
      for (const [name, lx, lz] of labels) {
        const [x, z] = toMap(lx, lz);
        g.fillText(name, x, z);
      }
      // Mission marker + player.
      if (G.marker) {
        const [mx, mz] = toMap(G.marker.x, G.marker.z);
        g.fillStyle = '#ffd75e';
        g.beginPath(); g.arc(mx, mz, 6, 0, Math.PI * 2); g.fill();
      }
      const [px, pz] = toMap(G.player.x, G.player.z);
      g.fillStyle = '#58c96a';
      g.beginPath(); g.arc(px, pz, 6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff';
      g.beginPath(); g.arc(px, pz, 9, 0, Math.PI * 2); g.stroke();
    },

    // Fill the title screen's three save slots with their summaries.
    refreshSlots() {
      for (let i = 0; i < 3; i++) {
        const slot = el('save-slot-' + (i + 1));
        if (!slot) continue;
        const save = readSlot(i);
        slot.textContent = 'SLOT ' + (i + 1) + ' — ' + slotSummary(save);
        slot.classList.toggle('empty', !save);
      }
    },

    // Show/hide the title screen (both the overlay and the inner menu).
    showTitle(show) {
      const t = el('title-screen');
      const m = el('menu');
      if (t) t.style.display = show ? 'flex' : 'none';
      if (m) m.style.display = show ? 'flex' : 'none';
    },

    // Show/hide the map screen (and redraw the big map when it opens).
    showMap(show) {
      const m = el('map-screen');
      if (!m) return;
      m.style.display = show ? 'flex' : 'none';
      if (show) this.drawBigmap();
    },

    // Per-frame HUD refresh (cheap parts every frame, the minimap throttled).
    update(dt) {
      // Speed + gear from the car, or 0 on foot.
      const car = G.player.car;
      const kmh = car ? Math.abs(car.speed) * 3.6 : 0;
      const gear = !car ? '—' : kmh < 1 ? 'N' : 'G' + Math.min(5, 1 + Math.floor(kmh / 28));
      this.setSpeed(kmh, gear, car ? car.model : 'On foot');
      this.setDistrict();
      this.setClock();
      // Crew cooldowns.
      const crew = [['mara', G.crew.mara], ['rico', G.crew.rico], ['lena', G.crew.lena]];
      crew.forEach(([name, c], i) => {
        const box = this.crewEls[i];
        if (!box) return;
        const state = box.querySelector('.crew-state');
        if (!state) return;
        if (c.cd > 0) {
          state.textContent = Math.ceil(c.cd) + 's';
          box.classList.add('cooling');
        } else {
          state.textContent = 'READY';
          box.classList.remove('cooling');
        }
      });
      // Banner + flash fade.
      if (this.bannerT > 0) {
        this.bannerT -= dt;
        if (this.bannerT <= 0) this.setMission();
      }
      if (this.flashT > 0) {
        this.flashT -= dt;
        if (this.flashT <= 0) this.flashEl.style.opacity = '0';
      }
      // Minimap at ~10 Hz.
      this.mapTime += dt;
      if (this.mapTime > 0.1) {
        this.mapTime = 0;
        this.drawMinimap();
      }
    },
  };

  return hud;
}
