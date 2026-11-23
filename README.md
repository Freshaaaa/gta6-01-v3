# Solmar Bay 3D

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Freshaaaa/gta6-01-v3/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Freshaaaa/gta6-01-v3/reward.svg)](https://make.fun/c/gta6-01)

An open-world crime game in the browser — a complete, original GTA-style
experience built with vanilla JS + Three.js, no build step. Made for the
[make.fun GTA 6 bounty](https://make.fun/c/gta6-01).

## The game

Golden-hour Solmar Bay: a grid city with a beach resort, a green Comet
sports car, traffic and pedestrians, police who chase you, 8 missions,
combat, a dense HUD with a minimap, crew abilities, a radio, and a save
system — all in `game/`, playable offline from static files.

- **Drive**: WASD/arrows, Space handbrake, E enter/exit any car (steal
  parked cars — witnesses call the cops), Shift run on foot.
- **Wanted**: 0–5 stars. Police cruisers chase, foot cops bust you on
  foot, the BBPD helicopter circles at 3+ stars. Lose the heat and the
  stars decay, one per 3 seconds once every cop is far away.
- **Missions**: 8 jobs (STAGE 1/8 → 8/8) — Welcome to Solmar, First
  Wheels, Beach Run, Downtown Delivery, Night Shift, Van Job, Harbor
  Heist, The Big Score. Follow the gold beam.
- **Crew** (Z/X/C): Mara heals +40 HP, Rico gives a +10 m/s ram boost,
  Lena ghosts one wanted star. Each has a cooldown.
- **Weapons** (1–5): Fists, Pistol, SMG, GATOR ($1,900), RPG ($9,000).
  The locked ones can be bought in-game when you can afford them.
- **Extras**: taxi fares (+$150 a ride), a sun coin on the beach road
  (+$250), a 3-slot save on the title screen, a full-city map (Tab),
  and a procedural radio (Q cycles stations, M mutes).

## Play it

```sh
node serve.ts            # serves game/ on http://localhost:8080
# or
node serve.ts --port 8087
```

Open http://localhost:8080 (or :8087) in desktop Chrome and click PLAY.
No network request: every script, module and texture is a file under
`game/` (Three.js r160 is vendored as `game/vendor/three.module.min.js`).

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` + `screenshots/` to the output directory and
writes `dossier.json` with the vendored make.fun library.

## Screenshots

`screenshots/1-cover.jpg` is the cover (a police chase at 112 km/h),
then the title screen, the beach run, and the full-city map.

## License

MIT — see [LICENSE](LICENSE).
