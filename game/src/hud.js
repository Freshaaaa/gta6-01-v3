// Solmar Bay 3D — HUD updates (v5, from the brief).
// The HUD is DOM (game/index.html). This module writes values into it:
// money, health, wanted stars, speed, gear, mission objective, dialogue,
// prompt, crew cooldowns, weapon slots, big-map markers and the minimap
// canvas (200x200). The minimap draws the road grid + player + marker +
// traffic dots.

import { clamp } from './util.js';

export class HUD {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.minimap = this.el('minimap');
    this.mm = this.minimap ? this.minimap.getContext('2d') : null;
    this.bigmap = this.el('bigmap');
    this.bm = this.bigmap ? this.bigmap.getContext('2d') : null;
    this.last = {}; // dedupe writes
  }

  setText(id, text) {
    if (this.last[id] === text) return;
    this.last[id] = text;
    const e = this.el(id);
    if (e) e.textContent = text;
  }

  setHTML(id, html) {
    if (this.last[id] === html) return;
    this.last[id] = html;
    const e = this.el(id);
    if (e) e.innerHTML = html;
  }

  // Overlays + panels show as flex (the playtest asserts computed 'flex'
  // for menu / title / map / wasted / busted), hidden as none.
  show(id, on) {
    const e = this.el(id);
    if (e) e.style.display = on ? 'flex' : 'none';
  }

  // Wanted stars: 5 star slots, filled = gold.
  setWanted(n) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
      html += `<span class="star${i <= n ? ' on' : ''}">★</span>`;
    }
    this.setHTML('wanted', html);
  }

  setMoney(m) { this.setText('money', '$' + Math.floor(m).toLocaleString('en-US')); }
  setHealth(h) {
    this.setText('health', '♥ ' + Math.max(0, Math.round(h)));
    const bar = this.el('health-bar');
    if (bar) bar.style.width = clamp(h, 0, 100) + '%';
  }
  setSpeed(kmh) { this.setText('speed', String(Math.round(kmh))); }
  setGear(g) { this.setText('gear', g); }
  setObjective(t) { this.setText('objective', t); }
  setMission(t) { this.setText('mission', t); }
  setPrompt(t) {
    this.setText('prompt', t);
    this.show('prompt', !!t);
  }
  setDialogue(name, text) {
    if (!text) { this.show('dialogue', false); return; }
    this.setText('dialogue-name', name);
    this.setText('dialogue-text', text);
    this.show('dialogue', true);
  }
  setTime(t) {
    const h = Math.floor(t) % 24;
    const m = Math.floor((t % 1) * 60);
    this.setText('clock', String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'));
  }
  setAmmo(current, mag, reserve) {
    const names = { 1: 'Fists', 2: 'Pistol', 3: 'SMG', 4: 'GATOR', 5: 'RPG' };
    const owned = { 1: true, 2: true, 3: true, 4: false, 5: false };
    // Owned flags are updated by main via setWeaponState.
    let html = '';
    for (const [slot, name] of Object.entries(names)) {
      const s = Number(slot);
      const active = s === current;
      const locked = !this.owned || !this.owned[s];
      html += `<div class="slot${active ? ' active' : ''}${locked ? ' locked' : ''}">${s} ${name}${locked ? ' 🔒' : ''}${active && s > 1 ? ' ' + mag + '/' + reserve : ''}</div>`;
    }
    this.setHTML('weapons', html);
  }
  setWeaponState(owned) { this.owned = owned; }
  setCrew(cooldowns) {
    // cooldowns: { mara: s, rico: s, lena: s }
    const defs = [
      ['mara', 'Z', 'Mara', '+40 HP'],
      ['rico', 'X', 'Rico', '+10 m/s'],
      ['lena', 'C', 'Lena', '−1 ★'],
    ];
    let html = '';
    for (const [key, k, name, eff] of defs) {
      const cd = cooldowns[key] || 0;
      html += `<div class="crew${cd > 0 ? ' cooling' : ''}"><b>${k}</b> ${name} <span>${eff}</span>${cd > 0 ? ` <span class="cd">${Math.ceil(cd)}s</span>` : ''}</div>`;
    }
    this.setHTML('crew', html);
  }
  setDistrict(name) { this.setText('district', name); }
  setStage(current, total) { this.setText('stage', `STAGE ${current}/${total}`); }
  setTimer(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    this.setText('timer', `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`);
  }
  setCarName(name) { this.setText('car-name', name); }
  // Top-centre mission banner (name + objective line).
  setBanner(title, sub) {
    this.setText('banner-title', title);
    this.setText('banner-sub', sub);
  }

  // --- minimap (200x200) ----------------------------------------------------
  drawMinimap(player, marker, traffic, police, peds, coin) {
    const ctx = this.mm;
    if (!ctx) return;
    const S = 200, HALF = 220; // world half-extent shown
    const toMap = (x, z) => [(x / HALF) * (S / 2) + S / 2, (z / HALF) * (S / 2) + S / 2];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#101418';
    ctx.fillRect(0, 0, S, S);
    // Roads (grid lines).
    ctx.strokeStyle = '#4a5058';
    ctx.lineWidth = 3;
    for (const s of [-150, -100, -50, 0, 50, 100, 150]) {
      const [ax] = toMap(s, 0);
      ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(ax, S); ctx.stroke();
      const [, az] = toMap(0, s);
      ctx.beginPath(); ctx.moveTo(0, az); ctx.lineTo(S, az); ctx.stroke();
    }
    // Beach (south strip).
    ctx.fillStyle = '#d8c898';
    const [, beachY] = toMap(0, 205);
    ctx.fillRect(0, beachY, S, S - beachY);
    // Ocean (bottom edge).
    ctx.fillStyle = '#1e6a8a';
    ctx.fillRect(0, S - 8, S, 8);
    // Sun coin.
    if (coin && !coin.taken) {
      const [cx, cy] = toMap(coin.x, coin.z);
      ctx.fillStyle = '#ffd828';
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
    }
    // Mission marker.
    if (marker) {
      const [mx, my] = toMap(marker.x, marker.z);
      ctx.fillStyle = '#ffd828';
      ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // Traffic dots.
    ctx.fillStyle = '#9aa0a8';
    for (const c of traffic) {
      const [cx, cy] = toMap(c.x, c.z);
      ctx.fillRect(cx - 1, cy - 1, 2, 2);
    }
    // Police dots (red/blue).
    ctx.fillStyle = '#ff4040';
    for (const p of police) {
      const [cx, cy] = toMap(p.x, p.z);
      ctx.fillRect(cx - 2, cy - 2, 4, 4);
    }
    // Player arrow (gold).
    const [px, py] = toMap(player.x, player.z);
    ctx.fillStyle = '#ffd828';
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- big map (480x480, shown on Tab) ---------------------------------------
  drawBigMap(player, marker, missionName, money) {
    const ctx = this.bm;
    if (!ctx) return;
    const S = 480, HALF = 220;
    const toMap = (x, z) => [(x / HALF) * (S / 2) + S / 2, (z / HALF) * (S / 2) + S / 2];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#0e1216';
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = '#4a5058';
    ctx.lineWidth = 5;
    for (const s of [-150, -100, -50, 0, 50, 100, 150]) {
      const [ax] = toMap(s, 0);
      ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(ax, S); ctx.stroke();
      const [, az] = toMap(0, s);
      ctx.beginPath(); ctx.moveTo(0, az); ctx.lineTo(S, az); ctx.stroke();
    }
    ctx.fillStyle = '#d8c898';
    const [, beachY] = toMap(0, 205);
    ctx.fillRect(0, beachY, S, S - beachY);
    ctx.fillStyle = '#1e6a8a';
    ctx.fillRect(0, S - 20, S, 20);
    ctx.fillStyle = '#ffd828';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('SOLMAR BAY', 16, 30);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(missionName || '', 16, 54);
    ctx.fillText('$' + Math.floor(money || 0).toLocaleString('en-US'), 16, 74);
    if (marker) {
      const [mx, my] = toMap(marker.x, marker.z);
      ctx.fillStyle = '#ffd828';
      ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
    }
    const [px, py] = toMap(player.x, player.z);
    ctx.fillStyle = '#ffd828';
    ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
  }
}
