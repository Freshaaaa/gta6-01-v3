// Solmar Bay 3D — shared constants, tuning and the city layout table.
// A 540 m square coastal city on a regular street grid (roads every 60 m),
// eight named districts and ten landmarks the missions and side jobs use.
// Units are metres, seconds and m/s throughout; forward = (sin yaw, 0, cos yaw).

export const WORLD_SIZE = 540;           // world is WORLD_SIZE x WORLD_SIZE metres
export const ROAD_WIDTH = 14;
export const ROAD_GAP = 60;              // distance between road centre lines
export const ROAD_FIRST = 30;            // centre line of the first road
export const ROAD_COUNT = 9;             // roads at 30, 90, ... 510
export const LANE_OFFSET = 3.5;          // lane centre offset from road centre

export const STEP = 1 / 60;              // fixed simulation step (seconds)
export const SAVE_KEY = 'solmarbay3d.save.v1';

// Player tuning
export const PLAYER_WALK_SPEED = 3.2;
export const PLAYER_RUN_SPEED = 5.8;
export const PLAYER_MAX_HEALTH = 100;
export const PLAYER_RADIUS = 0.45;

// Car tuning (arcade bicycle model). Per-model multipliers live in CAR_MODELS.
export const CAR_ACCEL = 9.5;            // m/s^2 at full throttle
export const CAR_BRAKE = 16;
export const CAR_REVERSE_ACCEL = 6;
export const CAR_MAX_SPEED = 42;         // m/s base (~150 km/h)
export const CAR_MAX_REVERSE = 9;
export const CAR_TURN_RATE = 2.6;        // rad/s at full lock, scaled by speed
export const CAR_DRAG = 0.35;

// Wanted system
export const WANTED_HEAT_PER_STAR = 25;  // heat 0..150 maps to 0..6 stars
export const WANTED_MAX = 6;
export const HELI_MIN_STARS = 3;         // the police helicopter joins at 3 stars

// Clock: the game day starts at 17:30 (golden-hour dusk); one game hour
// lasts 60 real seconds, so a full day/night cycle is 24 minutes.
export const CLOCK_START_MINUTES = 17 * 60 + 30;
export const SECONDS_PER_GAME_HOUR = 60;

// Collectibles: 20 sun-coins hidden around the city.
export const COIN_COUNT = 20;
export const COIN_REWARD = 75;

// Districts, used for building palettes, ground tint and the minimap
// labels. Eight of them, in a 4 x 2 layout over the city.
export const DISTRICTS = [
  { name: 'Old Harbor', x0: 0, y0: 0, x1: 135, y1: 270, palette: ['#b98a5e', '#a5714f', '#c49a6b', '#8f6a52'], ground: '#a8b078' },
  { name: 'Downtown', x0: 135, y0: 0, x1: 270, y1: 270, palette: ['#7d8aa0', '#6b7a90', '#8b98ac', '#5d6b7f'], ground: '#9aa78a' },
  { name: 'Coral Row', x0: 270, y0: 0, x1: 405, y1: 270, palette: ['#e07856', '#d96a4a', '#e88a68', '#c75a40'], ground: '#a3ad7c' },
  { name: 'North Beach', x0: 405, y0: 0, x1: 540, y1: 270, palette: ['#e8d9a8', '#dcc98f', '#f0e2b6', '#c9b47e'], ground: '#b5b98a' },
  { name: 'Marina', x0: 0, y0: 270, x1: 135, y1: 540, palette: ['#7fb3c8', '#6a9db5', '#93c4d6', '#5a8ba3'], ground: '#9db384' },
  { name: 'Palm Court', x0: 135, y0: 270, x1: 270, y1: 540, palette: ['#d9a08c', '#c98f7a', '#e8b39e', '#b57a68'], ground: '#a8b078' },
  { name: 'Sunset Hills', x0: 270, y0: 270, x1: 405, y1: 540, palette: ['#c98f7a', '#b57a68', '#d9a08c', '#a56a5c'], ground: '#a3ad7c' },
  { name: 'The Strip', x0: 405, y0: 270, x1: 540, y1: 540, palette: ['#8e6fb8', '#7a5ea6', '#a385cc', '#6b4f94'], ground: '#9aa78a' },
];

// Landmarks the story and the side jobs use. x/z are world coordinates
// (metres), all on or beside a road so they are always reachable.
export const LANDMARKS = {
  diner:     { name: "Rosa's Diner", x: 90,  z: 90,  label: 'DINER' },
  hideout:   { name: 'The Hideout',  x: 450, z: 450, label: 'HIDEOUT' },
  docks:     { name: 'Old Harbor Docks', x: 30, z: 45, label: 'DOCKS' },
  bank:      { name: 'Bank of Solmar', x: 390, z: 90, label: 'BANK' },
  pier:      { name: 'Marina Pier',  x: 90,  z: 495, label: 'PIER' },
  plaza:     { name: 'Solmar Plaza', x: 270, z: 270, label: 'PLAZA' },
  casino:    { name: 'Grand Casino', x: 450, z: 330, label: 'CASINO' },
  cityhall:  { name: 'Solmar City Hall', x: 210, z: 150, label: 'CITY HALL' },
  lighthouse:{ name: 'The Lighthouse', x: 30, z: 510, label: 'LIGHTHOUSE' },
  stadium:   { name: 'Solmar Stadium', x: 450, z: 150, label: 'STADIUM' },
};

// Traffic car models (all invented for this game). accel/maxSpeed/turn are
// multipliers on the base tuning; hp is the car's health; len/wid are metres.
export const CAR_MODELS = [
  { name: 'Pinto',   color: '#c0392b', accel: 1.0,  maxSpeed: 0.95, turn: 1.0,  hp: 140, len: 4.2, wid: 1.9 },
  { name: 'Comet',   color: '#2980b9', accel: 1.0,  maxSpeed: 1.0,  turn: 1.0,  hp: 140, len: 4.3, wid: 1.9 },
  { name: 'Vela',    color: '#f1c40f', accel: 1.05, maxSpeed: 1.05, turn: 1.05, hp: 130, len: 4.3, wid: 1.9 },
  { name: 'Bruto',   color: '#7f8c8d', accel: 0.9,  maxSpeed: 0.9,  turn: 0.9,  hp: 170, len: 4.6, wid: 2.0 },
  { name: 'Lumen',   color: '#ecf0f1', accel: 1.0,  maxSpeed: 1.0,  turn: 1.0,  hp: 140, len: 4.3, wid: 1.9 },
  { name: 'Falco',   color: '#16a085', accel: 1.1,  maxSpeed: 1.1,  turn: 1.1,  hp: 130, len: 4.4, wid: 1.9 },
  { name: 'Dune',    color: '#e67e22', accel: 1.0,  maxSpeed: 0.95, turn: 1.0,  hp: 150, len: 4.5, wid: 2.0 },
  { name: 'Onyx',    color: '#2c3e50', accel: 1.05, maxSpeed: 1.08, turn: 1.0,  hp: 140, len: 4.4, wid: 1.9 },
  { name: 'Coral',   color: '#e74c3c', accel: 1.0,  maxSpeed: 1.0,  turn: 1.05, hp: 140, len: 4.3, wid: 1.9 },
  { name: 'Mistral', color: '#9b59b6', accel: 1.0,  maxSpeed: 1.02, turn: 1.0,  hp: 140, len: 4.3, wid: 1.9 },
  { name: 'Strada',  color: '#ff2e63', accel: 1.35, maxSpeed: 1.3,  turn: 1.2,  hp: 110, len: 4.4, wid: 2.0 },
  { name: 'Cab',     color: '#f5b301', accel: 0.95, maxSpeed: 0.95, turn: 1.0,  hp: 150, len: 4.4, wid: 1.9, taxi: true },
  { name: 'Hauler',  color: '#5d6d7e', accel: 0.75, maxSpeed: 0.8,  turn: 0.8,  hp: 220, len: 5.6, wid: 2.2 },
  { name: 'Viento',  color: '#1abc9c', accel: 1.15, maxSpeed: 1.15, turn: 1.15, hp: 120, len: 4.4, wid: 1.9 },
  // Aurora — the fastest car in the Bay, rare and worth stealing: a
  // low pink supercar with a rear spoiler. Chop-shop bait.
  { name: 'Aurora',  color: '#e84393', accel: 1.4, maxSpeed: 1.35, turn: 1.25, hp: 100, len: 4.4, wid: 2.0, spoiler: true },
];

// The chop shop only pays for fast cars.
export const CHOP_MODELS = ['Strada', 'Viento', 'Falco', 'Vela', 'Aurora'];
export const CHOP_REWARD = 350;

// Weather: clear, rain and storm cycle on a timer (main.js rolls the
// change). Rain makes the roads slick — longer braking, easier drift —
// and storms throw lightning. The HUD clock line shows the current sky.
export const WEATHER_CLEAR = 'clear';
export const WEATHER_RAIN = 'rain';
export const WEATHER_STORM = 'storm';
export const WEATHER_MIN_SECONDS = 150;
export const WEATHER_MAX_SECONDS = 300;

// The money van: a repeatable heist. An armored van roams the city; crack
// it on foot (hold E, 3 s) for $500 — and 3 stars of heat.
export const VAN_REWARD = 500;
export const VAN_HEAT = 75;
export const VAN_CRACK_SECONDS = 3;
export const VAN_FIRST_DELAY = 90;
export const VAN_MIN_DELAY = 150;
export const VAN_MAX_DELAY = 240;

// Weapons. damage is per bullet (shotgun fires `pellets`); rate is the
// seconds between shots; price is what the Hideout shop charges.
export const WEAPONS = {
  pistol:  { name: 'Pistol',  damage: 25, rate: 0.18, spread: 0.02, pellets: 1, price: 0,    ammoPerShot: 1 },
  smg:     { name: 'SMG',     damage: 14, rate: 0.07, spread: 0.09, pellets: 1, price: 600,  ammoPerShot: 1 },
  shotgun: { name: 'Shotgun', damage: 16, rate: 0.70, spread: 0.30, pellets: 5, price: 900,  ammoPerShot: 2 },
  // Rifle — the Hideout's top shelf: long reach, tight spread, fast
  // tracers. Sold after the shotgun; key 4.
  rifle:   { name: 'Rifle',   damage: 20, rate: 0.09, spread: 0.03, pellets: 1, price: 1500, ammoPerShot: 1 },
};
export const WEAPON_ORDER = ['pistol', 'smg', 'shotgun', 'rifle'];

// Radio stations: the patterns live in audio.js; these are the names and
// tempos the HUD shows.
export const RADIO_STATIONS = [
  { name: 'Coastal Groove', dj: 'DJ Marina', bpm: 96,  genre: 'chillwave' },
  { name: 'Night Drive',    dj: 'DJ Luna',   bpm: 112, genre: 'synthwave' },
  { name: 'Latin Heat',     dj: 'La Gata',   bpm: 124, genre: 'reggaeton' },
  { name: 'Bay FM',         dj: 'Big Ray',   bpm: 140, genre: 'talk + hits' },
];
export const RADIO_TRACKS = [
  ['Sunset Over Solmar', 'Palm Trees at Midnight', 'Neon Tide'],
  ['Chrome Hearts', 'Midnight Overpass', 'Vice Lights'],
  ['Fuego en la Bahia', 'Salsa del Sol', 'Baila Conmigo'],
  ['The Bay Today', 'Traffic & Tides', 'Solmar Nights'],
];

// In-game phone / social feed (parody posts, invented characters).
export const FEED_SEEDS = [
  { user: 'Vince Corso', text: 'The Bay is ours tonight. Nobody moves without the crew knowing.' },
  { user: 'Solmar PD', text: 'REMINDER: street racing is illegal. Your car will be impounded. Again.' },
  { user: "Rosa's Diner", text: 'The Dante special is back. Extra hot, gone in sixty seconds.' },
  { user: 'Solmar Nights', text: 'Ocean Drive is LIT tonight. Neon, bass, and a pink Aurora that does NOT belong to you.' },
  { user: 'Bay Watch', text: 'Somebody stole the lighthouse again. No, not the building. The LIGHT.' },
];
export const PHONE_CONTACTS = [
  { name: 'Rosa', note: "Rosa's Diner — jobs & gossip" },
  { name: 'Vince Corso', note: 'The crew — the big jobs' },
  { name: 'Mara', note: 'Getaway driver — your partner' },
];

// Garage / safehouse economy.
export const RESPRAY_PRICE = 200;
export const OUTFIT_PRICE = 100;
export const GARAGE_MAX_CARS = 3;
export const GARAGE_ENGINE_PRICE = 400;
export const GARAGE_ARMOR_PRICE = 300;
export const GARAGE_PAINT_PRICE = 150;
export const PAINT_COLORS = ['#e84393', '#ff2e63', '#f1c40f', '#1abc9c', '#2980b9', '#9b59b6', '#ecf0f1', '#2c3e50', '#e67e22', '#16a085'];

export const PED_SHIRTS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#fd79a8', '#00cec9', '#fdcb6e'];
export const PED_PANTS = ['#2c3e50', '#34495e', '#7f8c8d', '#5d4037', '#37474f', '#6c5ce7'];
export const PED_SKINS = ['#e8b98a', '#c98d5f', '#8d5524', '#f1c27d', '#d9a066'];
export const NEON_COLORS = ['#ff2e63', '#00cec9', '#f1c40f', '#e84393', '#00e676', '#ff6b81'];
