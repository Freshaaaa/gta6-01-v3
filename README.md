[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Freshaaaa/gta6-01-v3/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Freshaaaa/gta6-01-v3/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solmar Bay 3D — Crowded Streets v12

A full-3D open-world crime game for the [Make GTA 6 bounty on make.fun](https://make.fun/bounty/gta6-01) — a Vice City-inspired bay rendered in Three.js, with a low third-person chase camera, arcade car physics, lane-graph traffic, a 6-star wanted system with a police helicopter, a golden-hour city, 10 story missions, side jobs, money-van heists, rain and storms, combat, and a dense GTA-style HUD: mission panel, police-response list, weapon slots, car condition, location label and a rotating minimap with GPS.

You are Dante "D" Reyes, a wheelman fresh out of the Old Harbor docks — and Mara is your getaway-driver partner, riding shotgun, calling the turns, and keeping the cops off your bumper. Rosa at the diner, Vince Corso who runs the Sunset Hills crew, and the rival Saltwater crew that wants them both gone. Steal cars. Outrun the law. Take the Bay.

## Play

Serve `game/` with any static server — `node serve.ts` then open http://localhost:8080 — and play in desktop Chrome. No build step: Three.js r160 loads from a pinned CDN (three@0.160.0); every other file the game loads lives under `game/`.

- **WASD / arrows** — walk, run (Shift), drive when in a car
- **Space** — handbrake (drift)
- **E** — get in/out of a car, talk, pick up, crack the vault (hold), start a taxi fare or street race, sell to the chop shop, respray, buy at the weapon shop, crack a money van (hold)
- **Mouse** — aim. **Click** — shoot. **F** — punch. **1–4** — switch weapon
- **R / Q** — next / previous radio station (it keeps playing on foot, through the phone)
- **C** — phone (social feed + contacts). **G** — garage menu. **P** — pause. **M** — mute

## What's new in v12 (chase cam + dense HUD + golden hour)

- **Low chase camera** — the driving camera now sits close behind and just above the player's car, looking forward down the road, so the car is large in frame and the street, traffic and police ahead are visible. The on-foot camera stays a close third-person view. The camera snaps onto the chase framing for staged screenshots instead of drifting in from the high title view.
- **Golden-hour lighting** — the sky at dusk is warm orange-pink with long shadows; all four screenshot scenes are set at golden hour (17:15–17:45). Night and rain are still in the game as weather, just not what the screenshots lead with.
- **Crowded streets** — screenshot scenes add traffic on the player's own road plus more pedestrians on the sidewalks, and the chase scenes run the pursuit simulation forward so the cruisers close in from their spawn and the helicopter is actually in frame against the sky.
- **Dense HUD** — a mission panel (mission name, stage, giver + reward, next step, timer), a police-response list (named Solmar PD units with role — RAMMING / PURSUIT / FLANKING / SPOTLIGHT / RESPONDING — and distance in metres, plus AIR-1 when the helicopter is up), weapon slots with ammo and locked state, the car's name and condition % next to the speed, a location label (district + nearest landmark), a WANTED label over the stars, and a larger cash readout.
- **Late-mission screenshots** — the four shots now show real mid/late-story moments instead of free roam and the first mission: Getaway Driver's timed checkpoints (m3), Turf War on foot at the Marina Pier (m4, 2/5 down), the Heatwave escape with 4 stars (m8), and the King of the Bay finale checkpoints with the helicopter up (m10) — with the money, weapons and heat a player would honestly have earned by that point in the story.

## What's in the city

- **8 districts** across a 540 m coastal city: Old Harbor, Downtown, Marina, Sunset Hills, North Beach, Palm Court, Coral Row and the Strip — each with its own palette, buildings and landmarks (Rosa's Diner, the Hideout, the Docks, the Bank of Solmar, Marina Pier, Solmar Plaza, the Grand Casino, City Hall, the Lighthouse and the Stadium), a pier, a lighthouse with a rotating beam, and a beach.
- **3D driving**: third-person chase camera with lag, speed-based FOV pull (60→78) and screen shake; arcade bicycle-model handling with drift, slick roads in the rain, and skid marks; cars built from merged low-poly geometry with instanced wheels.
- **10 story missions** plus repeatable side work: taxi fares, street races, courier runs, money-van heists, a chop shop for stolen sports cars, and 20 hidden sun-coins to collect.
- **Wanted 0–6 stars**: interceptors that pursue with lead-time steering, fan out, rubber-band and re-leash; foot cops who arrest a slow player; and a police helicopter from 3 stars that shadows you, sweeps a searchlight, and fires in bursts at 4 stars. Losing the cops is line-of-sight: break sight, stay out of the search circle, and the heat drains — or respray at the Hideout.
- **4 weapons** (pistol, SMG, shotgun, rifle) with a weapon shop at the Hideout, plus outfits that drop a star of heat.
- **Safehouse / garage**: heal and autosave at the Hideout, store up to 3 cars, upgrade engines and armor, repaint.
- **Day & night and weather**: a 24-minute day/night cycle starting at golden-hour dusk, long shadows, lit windows, neon signs on the Strip, street lamps and a lighthouse beam after dark, rain and storms that make the roads slick, lightning, and a live clock.
- **Radio**: four synthesized stations (Coastal Groove, Night Drive, Latin Heat, Bay FM) with named DJs and tracks, plus engine hum, sirens, helicopter rotors and gunshots — all synthesized with the Web Audio API, no audio files.
- **New rides**: the Aurora supercar, the fastest car in the Bay, and the armored Money Van that roams the city with $500 inside.

## Originality

Every line of the game is original code written for this competition — the city, the characters, the story, the music and the art are all invented, and no assets from Rockstar or any other game are used. Three.js (MIT) is the only third-party code, loaded from a pinned CDN (three@0.160.0).

## Tech notes

- Plain ES modules, no bundler: `game/index.html` maps `three` to a pinned CDN (three@0.160.0) with an import map and loads `game/src/main.js`, which imports Three.js from `'three'`.
- Fixed 60 Hz simulation, decoupled rendering; seeded city generation (`?seed=N` reproduces a city).
- `?shot=start|drive|chase|foot|heli` stages a scene for screenshots and sets `window.__shotReady`; `window.__solmar` exposes the debug API the playtest drives. The chase/heli shots run the pursuit simulation forward with the player car frozen, so the cruisers and helicopter are in frame, then snap the camera onto the chase framing.
- `node serve.ts --port 8080` serves `game/` locally; `node main.ts` (or `MAKEFUN_OUTPUT_DIR=out node main.ts`) builds the hand-in in `/output` with `dossier.json`. main.ts also gates the hand-in: all four screenshots must exist and be under 256 KiB, and the chase-cam / dense-HUD code must be present in the sources.

## License

MIT — see `LICENSE`.
