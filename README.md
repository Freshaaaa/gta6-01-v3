[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Freshaaaa/gta6-01-v2/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Freshaaaa/gta6-01-v2/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solmar Bay: Heatwave

An original open-world crime game for the [Make GTA 6 bounty on make.fun](https://make.fun/bounty/gta6-01) — a sun-soaked coastal city to explore on foot and by car, with traffic and pedestrians, a wanted level and police (cars, foot patrols and a helicopter) who respond to it, 10 story missions, side jobs, money-van heists, rain and storms, combat, a HUD with a live minimap, a start screen and saving.

You are Dante "D" Reyes, a wheelman fresh out of the Old Harbor docks. Rosa at the diner, Vince Corso who runs the Sunset Hills crew, and the rival Saltwater crew that wants them both gone. Steal cars. Outrun the law. Take the Bay.

## Play

Serve `game/` with any static server — `node serve.ts` then open http://localhost:8080 — and play in desktop Chrome. No build step, no network: every file the game loads lives under `game/`.

- **WASD / arrows** — walk, run (Shift), drive when in a car
- **E** — steal a car, talk, pick up, crack the vault, start a taxi fare, crack a money van
- **Mouse** — aim. **Click** — shoot. **F** — punch. **Q / 1 / 2 / 3 / 4** — switch weapon
- **R** — change radio station. **P** — pause. **M** — mute. **H** — help

## What's in the city

- **8 districts** across a 3.6 km coastal city: Old Harbor, Downtown, Marina, Sunset Hills, North Beach, Palm Court, Coral Row and the Strip — each with its own palette, buildings and landmarks (Rosa's Diner, the Hideout, the Docks, the Bank of Solmar, Marina Pier, Solmar Plaza, the Grand Casino, City Hall, the Lighthouse and the Stadium).
- **10 story missions** plus repeatable side work: taxi fares, street races, courier runs, money-van heists, a chop shop for stolen sports cars, and 20 hidden sun-coins to collect.
- **Wanted 0–5 stars**: foot patrols, interceptor cars that ram and cut you off, and a police helicopter from 3 stars that keeps the heat on you.
- **4 weapons** (pistol, SMG, shotgun, rifle) with a weapon shop at the Hideout, health/ammo/cash pickups, and a turf ledger that tracks the districts you have taken.
- **Day & night and weather**: golden-hour sun, long shadows, lit windows, neon signs on the Strip, street lamps and car headlights after dark, rain and storms that make the roads slick, lightning, and a live clock.
- **Radio**: four synthesized stations (Coastal Groove, Night Drive, Latin Heat, Bay FM) plus engine hum, sirens, rain and gunshots — all synthesized with the Web Audio API, no audio files.
- **New rides**: the Aurora supercar, the fastest car in the Bay, and the armored Money Van that roams the city with $500 inside.

## Originality

Everything here is invented for this game: the city, its districts and landmarks, the characters, the vehicles, the story, the art and the music. Nothing is taken from Rockstar Games' Grand Theft Auto series or any other commercial game.

## Repo layout

- `game/index.html` + `game/src/` — the game (plain ES modules, no libraries).
- `screenshots/` — 4 screenshots taken from the running game (police chase, helicopter at night, on foot, the money-van heist in the rain).
- `main.ts` — hands the game in (copies `game/` + `screenshots/` to `/output`, writes `dossier.json`).
- `serve.ts` — a tiny static server for local play.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.
