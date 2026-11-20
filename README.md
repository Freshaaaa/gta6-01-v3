<!-- v16 clean re-record (01a1f6c1-0eeb-7191-b67c-e5c3196775d3). -->
<!-- v16: new "What's new in v16" section; story money corrected to
     $109,200 and sun coins to $75 (both were stale v13/v14 figures);
     tech note updated for the m15 finale night shot and the beach-drive
     chase shot. -->
[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Freshaaaa/gta6-01-v3/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Freshaaaa/gta6-01-v3/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solmar Bay 3D — Crowded Streets v16

A full-3D open-world crime game for the [Make GTA 6 bounty on make.fun](https://make.fun/bounty/gta6-01) — a Vice City-inspired bay rendered in Three.js, with a low third-person chase camera, arcade car physics, lane-graph traffic, a 6-star wanted system with a police helicopter, a golden-hour city and a sunny beach drive, 15 story missions, vehicle tuning, drivable boats, side jobs, money-van heists, rain and storms, combat, a three-person crew with real abilities, and a dense GTA-style HUD: mission panel with a stage bar, police-response list with real RAMMING and ROADBLOCK roles, rank and respect, district standing, weapon slots with icons and a locked Kestrel, armour, car condition, gear and grip, location label and a rotating minimap with a pulsing search-zone ring and GPS.

You are Dante "D" Reyes, a wheelman fresh out of the Old Harbor docks — and Mara is your getaway-driver partner, riding shotgun, calling the turns, and keeping the cops off your bumper. Rosa at the diner, Vince Corso who runs the Sunset Hills crew, and the rival Saltwater crew that wants them both gone. Steal cars. Outrun the law. Take the Bay.

## Play

Serve `game/` with any static server — `node serve.ts` then open http://localhost:8080 — and play in desktop Chrome. No build step: Three.js r160 loads from a pinned CDN (three@0.160.0); every other file the game loads lives under `game/`.

- **WASD / arrows** — walk, run (Shift), drive when in a car, sail when in a boat
- **Space** — handbrake (drift)
- **E** — get in/out of a car, talk, pick up, crack the vault (hold), start a taxi fare or street race, sell to the chop shop, respray, buy at the weapon shop, crack a money van (hold), board a boat at the pier, open the tuning garage at Lio's
- **Mouse** — aim. **Click** — shoot. **F** — punch. **1–6** — switch weapon
- **R / Q** — next / previous radio station (it keeps playing on foot, through the phone)
- **C** — phone (social feed + contacts). **G** — garage menu. **P** — pause. **M** — mute

## What's new in v16 (round minimap, gear + grip HUD, m15 finale, beach drive, radio ticker, deeper golden hour)

- **Round minimap + dashed search rings** — the minimap was already circular in the canvas clip; now both search rings on it are dashed red lines (the chasing ring around the player and the escaping circle on the last-seen spot), so they read as a search boundary instead of a solid wall. The ring still pulses while the player is seen or chased.
- **Gear + grip in the HUD** — under the speed, the car line now shows the gear (G1–G5 from real speed: under 40 km/h is G1, 160+ is G5) and the grip % of the surface under the wheels (100% on road, 75% off-road, 55% on sand, 40% on water), next to the car-condition % that was already there (real hp/maxHp — collisions and Lio's repairs move it). Sand genuinely grips less: acceleration drops and the car slides wider on the beach.
- **The night shot is the m15 finale** — the fourth screenshot now stages the last mission, The Last Tide, at its real final step (STAGE 6/6) with a ★ FINAL tag in the mission panel: 21:45 on The Strip in the tuned Strada, 5 stars, 8 cruisers plus the helicopter, and $88,100 — the money a player would honestly hold by then (mission rewards through m14 plus side income, minus the $800 spent tuning the Strada). The finale's 9th police unit is the helicopter, AIR-1 on the dispatch board.
- **Bigger late-game money** — the fleet-arc rewards grew (m11 $8,000, m12 $12,000, m13 $18,000, m14 $19,000, m15 $25,000), so story money now grows to $109,200. Every screenshot's money is still the sum of real rewards and side jobs — never a faked number.
- **A beach drive** — the chase shot is now the car driving on the sand itself at golden hour (17:30), past umbrellas and beachgoers, with the sea behind it — the terrain system knows the sand (z 512–526) and the car really drives there.
- **Radio station + frequency in the HUD** — the ticker under the speed now names the station playing, with its frequency: "♪ Coastal Groove 99.1 — track · DJ". R/Q still switch stations.
- **Deeper golden hour** — tone-mapping exposure up (1.12), the sun sits lower so shadows stretch longer, and the dusk sky is a deeper orange. The flame cone on a burning car, the ROADBLOCK and the red search ring still read in the new light, and every screenshot stays under the 256 KiB cap.

## What's new in v15 (closer camera, weapon icons, standing, roadblocks, search ring, denser scenes)
<!-- v15 re-record: this section re-authored verbatim under a fresh recording -->

- **Bigger car in frame, lower camera** — the chase camera moved from 7.5 m back / 3.1 m up to 5.6 m back / 2.5 m up, and the speed FOV pull is gentler (60→72 instead of 60→78), so the player's car or boat dominates the frame like the top entries' — without clipping through buildings (the camera push-out still applies).
- **Weapon slot icons + a locked Kestrel** — every weapon slot now shows a distinct SVG silhouette (pistol, SMG, shotgun, rifle, AR-9, Breaker) with its ammo count, plus a seventh greyed slot: the Kestrel, a locked prototype rifle that is not for sale yet — display only, never in the shop, never selectable.
- **District standing** — the HUD shows a standing bar under the location label ("NEUTRAL 58"): each district starts at 50 and rises by 4 for every mission or courier job finished there (caps at 100), with tiers HOSTILE / COLD / NEUTRAL / FRIENDLY / ALLY. It saves and loads with the game.
- **RAMMING + ROADBLOCK police** — the dispatch board now shows the cops' real behaviour: a cruiser right on the player's bumper drives straight into them (RAMMING), and at 4+ stars two cruisers break off and park across the road ahead (ROADBLOCK), re-tracking every 3 s while the player is seen and releasing when the player breaks sight. The block is anchored on the cops' last-seen position, not the live player — a live-tracking block would park on top of a hiding player and pin them forever. The boat shot now brings 6 cruisers to the shore (was 3).
- **Minimap search-zone ring** — while the player is IN SIGHT or being chased, a red pulsing ring follows them on the minimap (the escaping circle on the last-seen spot is still there when the player is hiding).
- **Denser, more dramatic scenes** — 96 pedestrians city-wide (was 64) and 40 scene peds per shot (was 24), 36 parked cars and 20 traffic cars (was 24/14), 10 traffic cars per shot (was 6); the beach has 14 umbrellas + towels and beachgoers on the sand; a road bridge crosses the water channel at x=360 (boats pass under it); and the night shot has a burning car 35 m ahead on The Strip with a flickering orange flame cone and a live smoke column (the flame is unlit material, so it reads at night — dark smoke alone was invisible).

## What's new in v14 (tuning, boats, 15 missions, night neon)

- **Vehicle tuning — real, not a label** — Lio's Tuning Garage on Palm Court (E in a car there) sells four upgrades for the car you're driving: engine (+8% top speed, +5% accel per level, $400), armour plating (+60 max HP per level, $300), racing wheels (+5% turn per level, $200) and respray ($150). Every purchase spends real money and recomputes the car's stats from its base model, so a tuned car genuinely drives faster and turns sharper — and the HUD shows it next to the speed ("Aurora · TUNE 2"). The Hideout garage stores the tune with the car and can upgrade wheels too.
- **Drivable boats** — the sea is no longer scenery. A Dinghy is moored at the Marina Pier and a fast Speedboat by the Lighthouse; walk to the waterline, press E, and sail the coast with real boat physics (throttle, steering, wake spray, the water band clamping the boat to the sea). The police cruisers can't follow you onto the water — they hold the shoreline and watch, while the helicopter still follows. Boats show on the minimap as cyan dots.
- **15 story missions** — the fleet arc (m11–m15) continues after the King of the Bay finale: Tuned Up (tune a car, prove it on the street), Harbor Lights (first sea run in the Dinghy), The Smuggler's Run (grab the crate, run the whole coast with the cops on the shore), Tune Wars (steal a Strada, tune it to TUNE 2, beat the rival), and The Last Tide (chase Tide down the coast in the Speedboat, finish it on the pier). Story money grows to $109,200; rank S (King of the Bay) is reachable at 150 rep.
- **A night neon shot** — one of the four screenshots is now 21:45 on The Strip: neon signs and lamps glowing, the tuned Aurora's headlights throwing a beam and a pool of light on the road, 4 stars with the helicopter up. The boat run replaces the beach drive as the daytime coastal shot.
- **The player rides their vehicle** — fixed the bug where the car moved but the player position never followed it: the chase camera, mission `goto` steps and police pursuit now all track the driven car (and boat).

## What's new in v13 (rank, crew, portraits, beach, bigger money)

- **Bigger, honest money** — mission rewards grow through the story (m1 $300 → m10 $8,000) and side income pays more (courier $250, sun coins $75, money van $800, chop shop $600), so a player reaching the late missions honestly holds ~$18,000–$25,000 — the money in the screenshots is the sum of the rewards and side jobs a player would really have earned by that mission, never a faked number.
- **Rank, respect and day** — the HUD shows a rank (ROOKIE → HUSTLER → FIXER → SHOT CALLER → KING OF THE BAY) with an RP bar, computed from real reputation (+10 per mission, +2 per goon), and a DAY counter that ticks as the story and the clock advance.
- **A crew with real abilities** — Mara (Driver, always with you) makes your car faster and sharper; Lio (Mechanic, joins after Getaway Driver) slowly repairs your car; Kiki (Lookout, joins after Static) puts every police unit on the minimap and on the dispatch list, with a COP NEAR warning. The HUD shows the three crew cards, locked ones greyed until their job unlocks them.
- **Dialogue portraits** — every speaker gets a distinct SVG face next to their line (Mara, Vince, Rosa, Dante).
- **More police** — a 4-star chase now brings 6 cruisers plus the helicopter, a full 6-star manhunt brings 9, and the dispatch list names them all.
- **A sunny beach drive** — one of the four shots is now bright daytime (15:00) down the beach road past the sand, the sea, the pier and the lighthouse, like the top entries' beach scenes.
- **Armour, stage bar, IN SIGHT** — a body-armour bar next to health (armour absorbs damage first; buy it at the Hideout shop), a segmented stage-progress bar in the mission panel, and an IN SIGHT / SEARCHING badge that shows the real line-of-sight state.
- **Six weapons** — the AR-9 (unlocks after Getaway Driver) and the Breaker (unlocks after Heatwave) join the pistol, SMG, shotgun, rifle at the Hideout shop; unowned ones show LOCKED in the six weapon slots.

## What's new in v12 (chase cam + dense HUD + golden hour)

- **Low chase camera** — the driving camera now sits close behind and just above the player's car, looking forward down the road, so the car is large in frame and the street, traffic and police ahead are visible. The on-foot camera stays a close third-person view. The camera snaps onto the chase framing for staged screenshots instead of drifting in from the high title view.
- **Golden-hour lighting** — the sky at dusk is warm orange-pink with long shadows; all four screenshot scenes are set at golden hour (17:15–17:45). Night and rain are still in the game as weather, just not what the screenshots lead with.
- **Crowded streets** — screenshot scenes add traffic on the player's own road plus more pedestrians on the sidewalks, and the chase scenes run the pursuit simulation forward so the cruisers close in from their spawn and the helicopter is actually in frame against the sky.
- **Dense HUD** — a mission panel (mission name, stage, giver + reward, next step, timer), a police-response list (named Solmar PD units with role — RAMMING / PURSUIT / FLANKING / SPOTLIGHT / RESPONDING — and distance in metres, plus AIR-1 when the helicopter is up), weapon slots with ammo and locked state, the car's name and condition % next to the speed, a location label (district + nearest landmark), a WANTED label over the stars, and a larger cash readout.
- **Late-mission screenshots** — the four shots now show real mid/late-story moments instead of free roam and the first mission: Getaway Driver's timed checkpoints (m3, $1,650), the Stadium Brawl ledger run down the beach road in bright daylight (m9, $22,900), the Heatwave escape with 4 stars and 6 cruisers (m8, $17,900), and the King of the Bay finale checkpoints with the helicopter up (m10, $24,900) — with the money, weapons, armour, rank and heat a player would honestly have earned by that point in the story.

## What's in the city

- **8 districts** across a 540 m coastal city: Old Harbor, Downtown, Marina, Sunset Hills, North Beach, Palm Court, Coral Row and the Strip — each with its own palette, buildings and landmarks (Rosa's Diner, the Hideout, the Docks, the Bank of Solmar, Marina Pier, Solmar Plaza, the Grand Casino, City Hall, the Lighthouse and the Stadium), a pier, a lighthouse with a rotating beam, and a beach.
- **3D driving**: third-person chase camera with lag, speed-based FOV pull (60→78) and screen shake; arcade bicycle-model handling with drift, slick roads in the rain, and skid marks; cars built from merged low-poly geometry with instanced wheels.
- **15 story missions** plus repeatable side work: taxi fares, street races, courier runs, money-van heists, a chop shop for stolen sports cars, and 20 hidden sun-coins to collect.
- **Wanted 0–6 stars**: interceptors that pursue with lead-time steering, fan out, rubber-band and re-leash; foot cops who arrest a slow player; and a police helicopter from 3 stars that shadows you, sweeps a searchlight, and fires in bursts at 4 stars. Losing the cops is line-of-sight: break sight, stay out of the search circle, and the heat drains — or respray at the Hideout.
- **4 weapons** (pistol, SMG, shotgun, rifle) with a weapon shop at the Hideout, plus outfits that drop a star of heat — and two late-game guns (AR-9, Breaker) plus body armour in v13.
- **Safehouse / garage**: heal and autosave at the Hideout, store up to 3 cars, upgrade engines, armor and wheels, repaint.
- **Tuning garage**: Lio's shop on Palm Court upgrades the car you're driving (engine, armour, wheels, paint) — the tune level shows in the HUD.
- **Boats**: a Dinghy at the Marina Pier and a Speedboat by the Lighthouse, drivable on the south sea strip with wake spray; the police hold the shore while you're afloat.
- **Day & night and weather**: a 24-minute day/night cycle starting at golden-hour dusk, long shadows, lit windows, neon signs on the Strip, street lamps and a lighthouse beam after dark, rain and storms that make the roads slick, lightning, and a live clock.
- **Radio**: four synthesized stations (Coastal Groove, Night Drive, Latin Heat, Bay FM) with named DJs and tracks, plus engine hum, sirens, helicopter rotors and gunshots — all synthesized with the Web Audio API, no audio files.
- **New rides**: the Aurora supercar, the fastest car in the Bay, and the armored Money Van that roams the city with $800 inside.

## Originality

Every line of the game is original code written for this competition — the city, the characters, the story, the music and the art are all invented, and no assets from Rockstar or any other game are used. Three.js (MIT) is the only third-party code, loaded from a pinned CDN (three@0.160.0).

## Tech notes

- Plain ES modules, no bundler: `game/index.html` maps `three` to a pinned CDN (three@0.160.0) with an import map and loads `game/src/main.js`, which imports Three.js from `'three'`.
- Fixed 60 Hz simulation, decoupled rendering; seeded city generation (`?seed=N` reproduces a city).
- `?shot=start|drive|chase|beach|heli|boat|night` stages a scene for screenshots and sets `window.__shotReady`; `window.__solmar` exposes the debug API the playtest drives. The chase/heli shots run the pursuit simulation forward with the player car frozen, so the cruisers and helicopter are in frame, then snap the camera onto the chase framing. The boat shot stages the Dinghy on the water with the cruisers holding the shore; the night shot is now the m15 finale — The Last Tide, step 6/6, in the tuned Strada on The Strip at 21:45 with headlights on, 5 stars and 8 cruisers plus the helicopter. The chase shot is the golden-hour beach drive: the car on the sand at z 518 with beachgoers and umbrellas in frame.
- `node serve.ts --port 8080` serves `game/` locally; `node main.ts` (or `MAKEFUN_OUTPUT_DIR=out node main.ts`) builds the hand-in in `/output` with `dossier.json`. main.ts also gates the hand-in: all four screenshots must exist and be under 256 KiB, and the chase-cam / dense-HUD code must be present in the sources.

## License

MIT — see `LICENSE`.
