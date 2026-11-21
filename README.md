<!-- v18 3D core rebuild (branch v12-3d, recording 01a1fd4d). -->
<!-- Core only: 3D city + on-foot + driving + chase camera + HUD/minimap + saves.
     Traffic, pedestrians, police, missions and combat come next (systems builder). -->
[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Freshaaaa/gta6-01-v3/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Freshaaaa/gta6-01-v3/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solmar Bay 3D — 3D core rebuild

A true-3D open-world crime game for the [Make GTA 6 bounty on make.fun](https://make.fun/bounty/gta6-01) — a sun-soaked coastal city rendered in Three.js at golden hour, with a low third-person chase camera, arcade car physics, a dense HUD with a live minimap, and localStorage saves.

You are Dante "D" Reyes, a wheelman in Solmar Bay. Steal cars. Drive the coast. Take the Bay.

## Play

Serve `game/` with any static server — `python3 -m http.server 8082` inside the repo, then open http://localhost:8082/game/ — and play in desktop Chrome. No build step: Three.js r160 is vendored at `game/vendor/three.module.min.js`, so the game plays fully offline with zero network requests.

- **WASD / arrows** — walk (Shift to sprint), drive when in a car
- **Space** — jump on foot, handbrake (drift) in a car
- **E** — steal / exit the nearest car
- **F** — punch. **Drag mouse** — look around. **Esc** — pause. **M** — mute

## What's in the 3D core

- **Solmar Bay** — a seeded ~10×10-block procedural city: roads with lane markings and crosswalks, InstancedMesh buildings with lit windows, three landmark towers, palm trees, streetlights, neon signs, a beach with umbrellas and a boardwalk, and an animated teal ocean.
- **Golden-hour look** — gradient dusk sky dome, low warm sun with long shadows, fog for depth, and a day/night cycle (the neon street glows after dark).
- **Driving** — five car models (sedan, coupe, taxi, van, sports) with arcade bicycle-model physics, spinning/steering wheels, drift on the handbrake, building collision, and headlights at night. Parked cars all over the city are stealable with E.
- **On foot** — a low-poly third-person Dante with a walk cycle, sprint, jump, and punch; a chase camera with lag and speed-based FOV pull.
- **HUD + minimap** — money, health, wanted stars, speed + gear, car name, clock, district label, objective line, and a live 2D canvas minimap (roads, beach, cars, player arrow).
- **Saves** — money, position and time autosave to localStorage every 10 s and load on start.

## What's next

Traffic, pedestrians, police + wanted escalation, story missions, and combat are built on top of this core by the systems builder — the city, driving and camera in this commit are the foundation they plug into.

## Originality

Every line of the game is original code written for this competition — the city, the characters, the story and the art are all invented, and no assets from Rockstar or any other game are used. Three.js (MIT) is the only third-party code, vendored under `game/vendor/`.

## Tech notes

- Plain ES modules, no bundler: `game/index.html` maps `three` to the vendored build with an import map and loads `game/src/main.js`.
- Fixed 60 Hz simulation, decoupled rendering; seeded city generation (`?seed=N` reproduces a city).
- `?shot=drive|foot|beach|night` stages a scene for screenshots and sets `window.__shotReady`; `window.__solmar` exposes the debug API the playtest drives.
- `node main.ts` (or `MAKEFUN_OUTPUT_DIR=out node main.ts`) builds the hand-in in `/output` with `dossier.json`. main.ts also gates the hand-in: all four screenshots must exist and be under 256 KiB, and the 3D-core code must be present in the sources.

## License

MIT — see `LICENSE`.
