# Solmar Bay 3D — Make GTA 6

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Freshaaaa/gta6-01-v3/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Freshaaaa/gta6-01-v3/reward.svg)](https://make.fun/bounty/gta6-01)

An open-world crime game in the spirit of GTA 6, built for the
[make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01): a golden-hour
3D city you explore on foot and by car, with traffic and pedestrians, a
wanted level and police who respond (cars, foot cops and a BBPD
helicopter), 8 missions, a crew with abilities, weapons, a taxi job, a
sun coin, a HUD with a minimap, a title screen, a map screen and saves.

## Play

Serve `game/` with any static server and open `game/index.html` in desktop
Chrome (or run `node serve.ts` and open http://localhost:8087/).

- **WASD** walk / drive, **Shift** sprint, **Space** handbrake
- **E** steal / enter a car, **F** punch, **mouse click** shoot
- **1–5** weapons (Fists, Pistol, SMG, GATOR $1,900, RPG $9,000)
- **Z / X / C** crew abilities: Mara heals, Rico boosts, Lena drops a star
- **Q** radio, **M** mute, **N** map, **R** reload

## What is in it

- A grid city at golden hour: six facade colours, lit windows, rooftop
  kit, storefront awnings, a sunset sky with a sun disc and clouds, lane
  markings and crosswalks, real palm trees, a park, a beach and a wide
  ocean.
- The Comet: a bright-green sports car with four visible wheels, spoiler,
  bumper, taillights, mirrors and a rear window.
- Police that chase (cars at 30 m/s, foot cops that grab you in 0.6 s),
  a wanted level that decays 3 s a star once you are clear, and the BBPD
  helicopter with a staged spotlight.
- 8 missions (STAGE 8/8), a taxi job, a sun coin, 3 save slots.

## Tech

Vanilla JS + Three.js r160 (vendored as `game/vendor/three.module.min.js`),
no build step, no network requests. `main.ts` (Node 22) copies `game/` and
`screenshots/` to `/output` and writes `/output/dossier.json`.
