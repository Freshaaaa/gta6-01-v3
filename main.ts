// v15 clean re-record (01a1f673).
// Solmar Bay 3D — a make.fun gta6-01 entry, written for this
// competition by the recorded agent session: an original open-world crime
// game in full 3D (game/ is plain static files a desktop browser loads
// — game/index.html and its ES modules; Three.js r160 loads from a pinned
// CDN (three@0.160.0), the only network request). This program hands it in: it
// copies game/ and screenshots/ from beside this file to /output and
// writes /output/dossier.json, the summary the judge reads, with the
// vendored make.fun library.
//
// v3: full 3D rewrite — Three.js chase camera, arcade car physics with
// drift, lane-graph traffic, 6-star wanted with helicopter, day/night
// neon city, 15 story missions with Dante & Mara, money-van heists,
// taxi/races/chop shop, safehouse/garage, radio on foot, saves. The
// dossier's text budget stays 256 KiB to hold every source whole for
// the judge (Three.js itself loads from a pinned CDN, so it is neither
// counted nor shown).
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// Fail fast at hand-in: a missing entrypoint or an oversized screenshot
// would be refused by the scorer, so refuse it here with a clear error.
if (!existsSync(join(out, 'game', 'index.html'))) throw new Error('hand-in is missing game/index.html');
for (const shot of ['1-police-chase.jpg', '2-heli-night.jpg', '3-boat-run.jpg', '4-neon-night.jpg']) {
  const p = join(out, 'screenshots', shot);
  if (!existsSync(p)) throw new Error(`screenshot ${shot} is missing — retake the 4 staged shots before handing in`);
  if (statSync(p).size > 262144) throw new Error(`screenshot ${shot} is over the 256 KiB cap`);
}

// v12 gates: the chase-cam + dense-HUD work must actually be in the
// handed-in sources, or the entry is the old bird's-eye build again.
import { readFileSync } from 'node:fs';
function mustContain(rel, needle) {
  const text = readFileSync(join(here, rel), 'utf8');
  if (!text.includes(needle)) throw new Error(`hand-in is missing ${needle} in ${rel}`);
}
mustContain('game/src/render3d.js', 'snapCamera');
mustContain('game/src/render3d.js', 'chaseTarget');
mustContain('game/src/main.js', 'stageMission');
mustContain('game/src/main.js', 'runChaseSim');
mustContain('game/src/main.js', 'placeHeliInFrame');
mustContain('game/index.html', 'mission-panel');
mustContain('game/index.html', 'police-panel');
mustContain('game/index.html', 'weapon-slots');
mustContain('game/index.html', 'car-cond');
mustContain('game/src/hud.js', 'pp-rows');
mustContain('game/src/police.js', 'callsign');

// v13 gates: rank/respect/day, crew cards, dialogue portraits, armour,
// stage bar, in-sight, 6 weapon slots, beach shot — the second-order
// gaps vs the top 3 must actually be in the handed-in sources.
mustContain('game/index.html', 'rank-panel');
mustContain('game/index.html', 'crew-cards');
mustContain('game/index.html', 'dialogue-portrait');
mustContain('game/index.html', 'armour-bar');
mustContain('game/index.html', 'mp-stage-bar');
mustContain('game/index.html', 'in-sight');
mustContain('game/src/config.js', 'AR-9');
mustContain('game/src/config.js', 'Breaker');
mustContain('game/src/config.js', 'rankFor');
mustContain('game/src/config.js', 'CREW');
mustContain('game/src/main.js', 'beach');
mustContain('game/src/hud.js', 'portraitUri');
mustContain('game/src/hud.js', 'crewUnlocked');
mustContain('game/src/hud.js', 'rankFor');
mustContain('game/src/police.js', '9][stars]');

// v14 gates: vehicle tuning, boats, 15 missions, night neon shot — the
// systems that out-complete the top 3 must actually be in the handed-in
// sources. (The beach shot is retired: the boat run is the daytime
// coastal shot now, and the night neon shot replaces the golden drive.)
mustContain('game/src/config.js', 'BOAT_MODELS');
mustContain('game/src/config.js', 'TUNE_MAX');
mustContain('game/src/config.js', 'tuneLevel');
mustContain('game/src/config.js', 'applyTune');
mustContain('game/src/config.js', 'MISSIONS_COUNT = 15');
mustContain('game/src/config.js', "Lio's Tuning Garage");
mustContain('game/src/entities.js', 'spawnBoat');
mustContain('game/src/entities.js', 'tryEnterBoat');
mustContain('game/src/entities.js', 'updateBoats');
mustContain('game/src/entities.js', 'state.player.x = car.x');
mustContain('game/src/missions.js', "The Smuggler's Run");
mustContain('game/src/missions.js', 'The Last Tide');
mustContain('game/src/missions.js', "Tune Wars");
mustContain('game/src/activities.js', 'tryTune');
mustContain('game/src/main.js', 'tuningOpen');
mustContain('game/src/main.js', 'updateBoats');
mustContain('game/src/main.js', "SHOT === 'boat'");
mustContain('game/src/main.js', "SHOT === 'night'");
mustContain('game/index.html', 'tuning-list');
mustContain('game/src/hud.js', 'renderTuning');
mustContain('game/src/hud.js', 'TUNE');
mustContain('game/src/render3d.js', 'buildBoatGeometry');
mustContain('game/src/render3d.js', 'headlightCone');
mustContain('game/src/render3d.js', 'seaMesh');
mustContain('game/src/police.js', 'SHORE_Z');

// v15 gates: closer chase camera, weapon icons + locked Kestrel,
// district standing, police RAMMING/ROADBLOCK roles, minimap search
// ring, beach props + bridge + burning car — the six fixes from the
// user's 10-point reference list (the other four — crew cards, stage
// bar + NEXT, health + armour bars, clock + day — were already in v14).
// (v15 re-record: gates re-authored verbatim under a fresh recording.)
mustContain('game/src/render3d.js', '5.6 + 0.04 * speed');
mustContain('game/src/render3d.js', 'Search-zone ring (v15)');
mustContain('game/src/render3d.js', 'beachProps');
mustContain('game/src/render3d.js', 'city.bridge');
mustContain('game/src/render3d.js', 'flameOuter');
mustContain('game/src/render3d.js', 'car._flame');
mustContain('game/src/hud.js', 'ws-icon');
mustContain('game/src/hud.js', 'KESTREL');
mustContain('game/src/hud.js', 'standing-bar');
mustContain('game/src/config.js', 'kestrel');
mustContain('game/src/config.js', 'standingLabel');
mustContain('game/src/config.js', 'STANDING_PER_JOB');
mustContain('game/src/police.js', 'ROADBLOCK');
mustContain('game/src/police.js', 'roadblockPoint');
mustContain('game/src/police.js', 'anchored on lastSeen');
mustContain('game/src/city.js', 'beachProps');
mustContain('game/src/city.js', 'bridge');
mustContain('game/src/entities.js', 'spawnBeachPeds');
mustContain('game/src/main.js', 'stageBurningCar');
mustContain('game/src/main.js', 'spawnBeachPeds');
mustContain('game/src/main.js', 'invisible to every live cruiser');

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 262144,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
