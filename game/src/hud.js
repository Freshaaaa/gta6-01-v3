// Solmar Bay 3D — HUD: DOM readout (money, health, wanted, speed, clock,
// objective) + 2D canvas minimap + start/pause screens. Written fresh for
// the gta6-01 3D rebuild (branch v12-3d).
import { BEACH_Z, SEA_Z, PITCH, CITY_R } from './city.js';

export class HUD {
  constructor() {
    this.el = {};
    for (const id of ['money', 'stars', 'health-fill', 'weapon', 'speed', 'gear', 'car-name', 'clock', 'objective', 'prompt', 'location', 'menu', 'pause-menu', 'minimap', 'busted', 'wasted']) {
      this.el[id] = document.getElementById(id);
    }
    this.map = this.el.minimap.getContext('2d');
    this.money = 0;
  }

  setMoney(v) {
    this.money = v;
    this.el.money.textContent = '$' + Math.floor(v).toLocaleString('en-US');
  }
  setHealth(hp) { this.el['health-fill'].style.width = Math.max(0, Math.min(100, hp)) + '%'; }
  setWanted(n) {
    let s = '';
    for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
    this.el.stars.textContent = s;
    this.el.stars.classList.toggle('hot', n > 0);
  }
  setWeapon(name) { this.el.weapon.textContent = name; }
  setSpeed(kmh, gear, carName) {
    this.el.speed.textContent = Math.round(kmh);
    this.el.gear.textContent = gear;
    this.el['car-name'].textContent = carName;
  }
  setClock(hours) {
    const h = Math.floor(hours) % 24, m = Math.floor((hours % 1) * 60);
    this.el.clock.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  setObjective(text) { this.el.objective.textContent = text; }
  setLocation(text) { this.el.location.textContent = text; }
  setPrompt(text) {
    this.el.prompt.textContent = text;
    this.el.prompt.style.display = text ? 'block' : 'none';
  }
  showMenu(show) { this.el.menu.style.display = show ? 'flex' : 'none'; }
  showPause(show) { this.el['pause-menu'].style.display = show ? 'flex' : 'none'; }
  showBusted(show) { if (this.el.busted) this.el.busted.style.display = show ? 'flex' : 'none'; }
  showWasted(show) { if (this.el.wasted) this.el.wasted.style.display = show ? 'flex' : 'none'; }

  // Top-down minimap: roads, beach, sea, parked cars, player arrow, plus
  // extras: mission marker (yellow diamond), target car (purple), taxi
  // marker (green), sun coins (gold), police (red/blue dots), traffic (dots).
  drawMinimap(player, cars, drivenCar, extras = {}) {
    const g = this.map, S = 200, W = 620; // world -310..310 maps to 0..200
    const toMap = (x, z) => [((x + 310) / W) * S, ((z + 310) / W) * S];
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#101018';
    g.fillRect(0, 0, S, S);
    // Sea + sand (south edge).
    const [, beachY] = toMap(0, BEACH_Z);
    const [, seaY] = toMap(0, SEA_Z);
    g.fillStyle = '#0e5f74'; g.fillRect(0, seaY, S, S - seaY);
    g.fillStyle = '#d8c890'; g.fillRect(0, beachY, S, seaY - beachY);
    // Roads.
    g.strokeStyle = '#5a564e'; g.lineWidth = 4;
    for (let i = -CITY_R; i <= CITY_R; i++) {
      const [x0, y0] = toMap(i * PITCH, -310);
      const [x1, y1] = toMap(i * PITCH, 310);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      const [hx0, hy0] = toMap(-310, i * PITCH);
      const [hx1, hy1] = toMap(310, i * PITCH);
      g.beginPath(); g.moveTo(hx0, hy0); g.lineTo(hx1, hy1); g.stroke();
    }
    // Parked cars as pale dots.
    g.fillStyle = '#c8ccd4';
    for (const c of cars) {
      const [cx, cy] = toMap(c.x, c.z);
      g.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    }
    // Traffic cars as dimmer dots.
    if (extras.traffic) {
      g.fillStyle = '#8a94a8';
      for (const c of extras.traffic) {
        const [cx, cy] = toMap(c.x, c.z);
        g.fillRect(cx - 1.5, cy - 1.5, 3, 3);
      }
    }
    // Sun coins as gold dots.
    if (extras.coins) {
      g.fillStyle = '#ffd23e';
      for (const c of extras.coins) {
        const [cx, cy] = toMap(c.x, c.z);
        g.beginPath(); g.arc(cx, cy, 2.5, 0, Math.PI * 2); g.fill();
      }
    }
    // Mission / taxi marker as a yellow-green diamond.
    const drawDiamond = (mx, mz, color, size = 6) => {
      const [dx, dy] = toMap(mx, mz);
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(dx, dy - size); g.lineTo(dx + size, dy); g.lineTo(dx, dy + size); g.lineTo(dx - size, dy);
      g.closePath(); g.fill();
    };
    if (extras.marker) drawDiamond(extras.marker.x, extras.marker.z, '#ffd23e', 6);
    if (extras.taxi) drawDiamond(extras.taxi.x, extras.taxi.z, '#37e07a', 5);
    if (extras.target) drawDiamond(extras.target.x, extras.target.z, '#9a7aff', 5);
    // Police as red dots, foot cops as smaller red dots.
    if (extras.police) {
      g.fillStyle = '#ff4040';
      for (const pc of extras.police.cars || []) {
        const [cx, cy] = toMap(pc.x, pc.z);
        g.beginPath(); g.arc(cx, cy, 3, 0, Math.PI * 2); g.fill();
      }
      for (const cp of extras.police.cops || []) {
        const [cx, cy] = toMap(cp.x, cp.z);
        g.fillRect(cx - 1.5, cy - 1.5, 3, 3);
      }
    }
    // Player arrow (or driven car arrow).
    const px = drivenCar ? drivenCar.x : player.x;
    const pz = drivenCar ? drivenCar.z : player.z;
    const heading = drivenCar ? drivenCar.heading : player.yaw;
    const [ax, ay] = toMap(px, pz);
    g.save();
    g.translate(ax, ay);
    g.rotate(Math.PI - heading); // map north is -z; heading 0 = +z = down on map
    g.fillStyle = '#ffd23e';
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(-5, 5); g.closePath(); g.fill();
    g.restore();
    // North tick.
    g.fillStyle = '#ffffff'; g.font = 'bold 11px sans-serif';
    g.fillText('N', 6, 13);
  }
}
