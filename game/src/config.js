// Solmar Bay 3D — shared constants (v5 luxury rebuild, written from the brief).
// Everything the modules agree on lives here: world layout, colours, tuning,
// missions, crew, weapons, HUD text. No imports: every module reads this.

export const PITCH = 52; // street spacing (grid pitch)
export const STREETS = [-156, -104, -52, 0, 52, 104, 156]; // street centre lines
export const ROAD_HALF = 8; // half road width (asphalt)
export const WALK_HALF = 13; // sidewalk outer edge
export const CITY_EDGE = 182; // city blocks end here (north edge)
export const BEACH_START = 182; // sand begins
export const BEACH_END = 258; // sand ends, ocean begins
export const OCEAN_END = 460; // ocean plane edge
export const SAFEHOUSE = { x: 26, z: 26 }; // respawn + m1 marker
export const SUN_COIN = { x: 0, z: 270 }; // sun coin pickup (+$250)
export const START_MONEY = 0; // fresh profile money
export const SAVE_KEY = 'solmar-bay-save-v1';

// Golden-hour sun (v5: richer, warmer). The sun hangs low near the
// horizon, so its light rakes across the road and the facades facing
// the chase camera instead of hitting them head-on — at exposure 1.35
// the cover read only ~91 (dark). Exposure 1.65, together with the
// stronger hemisphere + ambient fill in main.js, lifts the cover to
// ~118-122 without blowing out the beach.
export const SUN = {
  color: 0xffb45e, // warm orange sun
  intensity: 2.8,
  exposure: 1.65,
  position: [-140, 90, 260], // low near the horizon, west-ish
};
export const SKY = {
  horizon: '#ff9a3d', // deep warm orange at the horizon
  mid: '#e86a8a', // soft magenta mid band
  top: '#4a5a8a', // dusky blue at the top
};
export const ASPHALT = 0x9a938a; // light grey-brown asphalt (NOT dark)
// Beach sand: a deep warm tan, with a lighter tone near the water for
// the two-tone gradient. The pale sand (0xd8c898) washed out under the
// brighter v5 lighting — the beach shot hit luminance ~167, almost
// white. These deeper tones bring it back to the ~140s, warmer and
// textured, so the sand reads as sand instead of glare.
export const SAND = 0xb89a68;
export const SAND_LIGHT = 0xcbb489; // lighter sand near the water.
export const OCEAN = 0x2e7fa8; // rich lighter blue ocean
export const FOAM = 0xf4fbff; // white foam line

// Building facade palette (v5: 5+ colours, never one beige wall).
export const FACADES = [
  0xd8c8a8, // warm beige
  0xc8c8c8, // light gray
  0xa87858, // warm brown
  0xe8e4d8, // off-white
  0x8a98a8, // muted blue-gray
  0x9a5a48, // brick red-brown
  0xb8a888, // sandy tan
];
export const ROOF_COLORS = [0x6a5a48, 0x5a5a5a, 0x7a6a58, 0x4a4a52];
export const AWNING_COLORS = [0xc03028, 0x189090, 0x28386a, 0xc9a227, 0x8a2a6a]; // red teal navy gold magenta
export const NEON_COLORS = [0xff2a9a, 0x28d8e8, 0xffc828, 0xff6a28]; // magenta cyan warm yellow orange

// The Comet (hero car) — bright green, premium trim.
export const COMET = {
  body: 0x2ec82e, // bright green
  glass: 0x9ab8cc, // light blue-grey windshield (reflective)
  chrome: 0xe8ecf0, // chrome trim
  tire: 0x2a2a2e,
  hub: 0xdfe3e8,
  hubGlow: 0x555a60,
  tail: 0xff2a1a, // red/orange emissive taillights
  head: 0xfff2c8, // warm headlights
};

// Traffic palette (AI cars).
export const TRAFFIC_COLORS = [
  { name: 'Coupe', color: 0xd82828 }, // red coupe
  { name: 'Sport', color: 0x189098 }, // teal sports
  { name: 'Van', color: 0x9a9a9a }, // grey van
  { name: 'Sedan', color: 0x28408a }, // navy sedan
  { name: 'Hatch', color: 0xe8a028 }, // amber hatch
  { name: 'Taxi', color: 0xf8c828 }, // yellow taxi
];
export const POLICE = {
  body: 0xe9edf2, // police white
  cheat: 0x1e5fd6, // blue cheatline
  lightRed: 0xff2020,
  lightBlue: 0x2060ff,
};

// BBPD police helicopter (fix 1/19: staged-only spotlight, ~12 m up, 48 m ahead).
export const HELI = {
  body: 0xe9edf2, // police white
  stripe: 0x1e5fd6, // blue cheatline
  beacon: 0xff2020, // red beacon
  spot: 0xfff2c8, // searchlight colour
  ahead: 48, // metres ahead of the player
  height: 12, // metres up
};

// Crew abilities (Z / X / C).
export const CREW = [
  { key: 'KeyZ', name: 'MARA', role: 'Medic', desc: '+40 HP', cooldown: 30, heal: 40 },
  { key: 'KeyX', name: 'RICO', role: 'Ram', desc: '+10 m/s boost', cooldown: 20, boost: 10 },
  { key: 'KeyC', name: 'LENA', role: 'Ghost', desc: '-1 wanted star', cooldown: 45, stars: 1 },
];

// Weapons (1-5). GATOR + RPG are locked with prices.
export const WEAPONS = [
  { name: 'Fists', key: 'Digit1', locked: false, price: 0, mag: null, reserve: null, damage: 34, range: 2.4 },
  { name: 'Pistol', key: 'Digit2', locked: false, price: 0, mag: 12, reserve: 48, damage: 34, range: 60 },
  { name: 'SMG', key: 'Digit3', locked: false, price: 0, mag: 30, reserve: 120, damage: 18, range: 45 },
  { name: 'GATOR', key: 'Digit4', locked: true, price: 1900, mag: 25, reserve: 100, damage: 45, range: 70 },
  { name: 'RPG', key: 'Digit5', locked: true, price: 9000, mag: 1, reserve: 5, damage: 200, range: 90 },
];

// Missions (8). payout + marker positions. m0 marker = safehouse.
export const MISSIONS = [
  { name: 'Welcome to Solmar', payout: 500, brief: 'Head to the safehouse', marker: { x: 26, z: 26 } },
  { name: 'First Wheels', payout: 800, brief: 'Steal a car, deliver it to the docks', marker: { x: -104, z: 104 } },
  { name: 'Beach Run', payout: 1200, brief: 'Race the beachfront to the pier', marker: { x: -130, z: 220 } },
  { name: 'Downtown Delivery', payout: 1500, brief: 'Deliver the package uptown', marker: { x: 104, z: -104 } },
  { name: 'Night Shift', payout: 2000, brief: 'Collect the drop at the marina', marker: { x: -156, z: -52 } },
  { name: 'Van Job', payout: 5000, brief: 'Ram the van, grab the cash, lose the heat', marker: { x: 0, z: 104 } },
  { name: 'Harbor Heist', payout: 3500, brief: 'Hit the harbor warehouse', marker: { x: -104, z: -156 } },
  { name: 'The Big Score', payout: 7500, brief: 'The final job: the hotel vault', marker: { x: 52, z: -156 } },
];

// Tuning (proven for SwiftShader sim rate — do not raise the engine cap).
export const ENGINE = {
  dtCap: 0.2, // fixed timestep cap
  fixedDt: 1 / 60, // fixed sim step
  maxSubsteps: 12, // max substeps per frame
  wantedDecayPerStar: 3, // seconds per wanted star
  bustTime: 0.6, // foot-cop grab time (seconds)
  copSpeed: 4.6, // foot cop run speed m/s
  policeTopSpeed: 30, // police car top speed m/s
  playerTopSpeed: 38, // Comet top speed m/s
  trafficSpeed: 11, // traffic cruise m/s
  chaseDist: 5.5, // chase camera distance
  chaseLateral: 1.0, // chase camera lateral offset
  decayRadius: 45, // wanted only decays when every cop is beyond this
};

// Districts (for the HUD district label + map).
export const DISTRICTS = [
  { name: 'MARINA', x0: -182, z0: 104, x1: 182, z1: 260 },
  { name: 'DOWNTOWN', x0: -52, z0: -52, x1: 52, z1: 104 },
  { name: 'DOCKS', x0: -182, z0: -182, x1: -52, z1: 104 },
  { name: 'UPTOWN', x0: -182, z0: -182, x1: 182, z1: -52 },
  { name: 'BEACHSIDE', x0: 52, z0: -52, x1: 182, z1: 104 },
];

// Radio stations (Q cycles, M mutes).
export const RADIO = [
  { name: 'Solmar FM', bpm: 112, scale: [0, 3, 5, 7, 10] },
  { name: 'Vice Classics', bpm: 100, scale: [0, 2, 4, 7, 9] },
  { name: 'Neon Nights', bpm: 126, scale: [0, 2, 3, 7, 8] },
  { name: 'Bay Beats', bpm: 96, scale: [0, 5, 7, 10, 12] },
  { name: 'Sunset Soul', bpm: 88, scale: [0, 3, 5, 8, 10] },
];

export const GOLD = '#c9a227'; // HUD gold accent
export const DIALOGUE = [
  { who: 'Mara', text: 'Dante, the heat is on. Lose them before the chopper pins you.' },
  { who: 'Dante', text: 'Relax. The Comet eats cops for breakfast.' },
  { who: 'Mara', text: 'Just keep it under 200 and we walk away rich.' },
  { who: 'Lena', text: 'I can ghost one star, but only once. Make it count.' },
  { who: 'Rico', text: 'Ram them, Dante. Ram them all.' },
];
