// Solmar Bay — v17 property empire (business.js, NEW in v17).
//
// Owning a piece of the Bay, instead of only working jobs in it.
// Dante can walk up to three front businesses, buy the deed outright
// with cash on hand, and then collect rent from them forever. Each
// deed is a one-time purchase — there is no rent to pay, no loan to
// service, and no upkeep bill. The money just keeps arriving, a few
// dollars every second, for as long as the save file lives.
//
// The three deeds, cheapest first:
//
//   1. The Rusty Anchor Garage, down by the Old Harbor Docks.
//      $8,000, and it trickles $2 every second. Its mechanics never
//      sleep: while Dante owns the place, any car he is driving gets
//      patched up at 2 hit points per second, up to the car's full
//      health. A banged-up getaway car heals itself on the drive
//      home, which is worth more than the rent on a long night.
//
//   2. Club Neon Tide, on the corner by the Grand Casino.
//      $15,000, and it trickles $3.50 every second. The club is the
//      Strip's loudest room, and owning the loudest room buys
//      goodwill: every thirty seconds the door staff's word of mouth
//      lifts Dante's standing in The Strip by one point, up to the
//      100-point ceiling. It is the only way in the game to raise
//      standing without finishing a job.
//
//   3. The Saltwater Warehouse, out on the Marina Pier.
//      $25,000, and it trickles $5 every second. The warehouse is
//      the big earner because it also pays a dividend: once a minute
//      of owning it, the import manifests clear and a $500 bonus
//      lands in Dante's pocket on top of the rent, with a toast so
//      he notices it. Three deeds together pay $10.50 a second plus
//      the warehouse bonus — the closest thing to retirement the Bay
//      offers.
//
// How the pieces fit together:
//
//   * The coordinator calls updateBusiness(state, dt) once per frame
//     from the main loop. That is the only place rent is ever paid,
//     so income can never double-count or run while paused.
//   * The coordinator calls tryBuyBusiness(state) when the player
//     presses E, and businessPrompt(state) when it builds the prompt
//     line at the bottom of the screen. Buying only works on foot,
//     standing within 14 metres of a deed Dante does not own yet.
//   * The coordinator calls renderBusinessPanel(state) once per
//     frame. It writes into the #business-panel element in
//     index.html and skips the write entirely when nothing changed.
//   * The feed call on a purchase (pushFeed) puts the deed in the
//     in-game phone, the same way a taxi fare or a race win lands
//     there.
//
// Saved state (the coordinator persists this with the rest of the
// save; load restores it verbatim, and updateBusiness repairs any
// missing field, so an old save that never had a business block
// simply starts with an empty portfolio):
//
//   state.business = {
//     owned:          string[],  // property ids Dante holds deeds for
//     earned:         number,    // total rent + dividends ever collected
//     lastDividend:   number,    // seconds banked toward the next $500
//     nightclubTimer: number,    // seconds banked toward the next +1
//   }
//
// Balance notes for the curious: at $10.50 a second the full set of
// three deeds returns its $48,000 combined price after about 76
// minutes of play, sooner with warehouse dividends counted. That is
// deliberately slow — the deeds are a late-game reward for a player
// who has already finished the big story jobs, not a shortcut around
// them. A player who buys the garage first gets the cheapest repair
// shop in the game; a player who saves for the warehouse gets the
// fastest money in the game. Either road is honest.

import { pushFeed } from './activities.js';
import { dist2 } from './rng.js';
import { standingLabel } from './config.js';

// ---------------------------------------------------------------------
// Tuning: every number the system uses lives here, in one place, so
// a balance pass touches this block and nothing else.
// ---------------------------------------------------------------------

// How close Dante has to stand to a deed's front door to buy it.
const BUY_RADIUS_METRES = 14;

// The garage's mechanics, in hit points repaired per second.
const GARAGE_REPAIR_PER_SECOND = 2;

// How often the nightclub's goodwill ticks, and how much it is worth.
const NIGHTCLUB_TICK_SECONDS = 30;
const NIGHTCLUB_STANDING_PER_TICK = 1;
const NIGHTCLUB_DISTRICT = 'The Strip';
const STANDING_CEILING = 100;

// How often the warehouse clears a dividend, and how big it is.
const WAREHOUSE_DIVIDEND_SECONDS = 60;
const WAREHOUSE_DIVIDEND_AMOUNT = 500;

// Rent is banked in whole dollars on the display, but the live money
// counter keeps fractions so a $3.50-a-second deed still pays exactly
// $3.50 a second instead of rounding down to $3 every other tick.
const DISPLAY_DECIMALS = 1;

// ---------------------------------------------------------------------
// The deeds themselves. Each entry is a complete description of one
// property: where it is, what it costs, what it pays, and what owning
// it does besides paying. The coordinator never hard-codes a property
// anywhere else — everything below reads from this table.
// ---------------------------------------------------------------------

export const PROPERTIES = [
  {
    id: 'garage',
    name: 'The Rusty Anchor Garage',
    shortName: 'Rusty Anchor Garage',
    landmark: 'docks',
    district: 'Old Harbor',
    x: 30,
    z: 45,
    cost: 8000,
    incomePerSec: 2,
    effect: 'Repairs your car +2 hp/s while you drive',
    tagline: 'Salt air, oil stains, and the best mechanics on the docks.',
    blurb:
      'A corrugated-iron workshop at the end of the Old Harbor Docks, ' +
      'where the fishing boats come in and the getaway cars go out. ' +
      'The previous owner left the lifts, the welders, and a crew that ' +
      'knows every dent in the Bay by heart. Buy the deed and the crew ' +
      'works for you: any car Dante drives gets patched up on the road, ' +
      'two hit points every second, until it is as good as new.',
    perk: 'garage-repair',
    perkDetail:
      'While owned, the car Dante is driving regains 2 hp per second, ' +
      'up to its maximum health. No button to press, no fee to pay.',
  },
  {
    id: 'nightclub',
    name: 'Club Neon Tide',
    shortName: 'Club Neon Tide',
    landmark: 'casino',
    district: 'The Strip',
    x: 450,
    z: 330,
    cost: 15000,
    incomePerSec: 3.5,
    effect: 'Raises your standing in The Strip +1 every 30 seconds',
    tagline: 'The loudest room on the Strip, and now it is yours.',
    blurb:
      'A three-floor club two doors down from the Grand Casino, all ' +
      'neon and bass and velvet rope. The door staff know every fixer, ' +
      'every dealer, and every cop on the Strip by first name — and ' +
      'once Dante owns the room, they drop his name the right way. ' +
      'Every half minute the goodwill ticks up one point in The Strip, ' +
      'until the whole district calls him a friend.',
    perk: 'strip-standing',
    perkDetail:
      'While owned, Dante gains +1 standing in The Strip every 30 ' +
      'seconds, capped at 100. Standing is otherwise earned only by ' +
      'finishing jobs, so the club is the patient way to win a district.',
  },
  {
    id: 'warehouse',
    name: 'The Saltwater Warehouse',
    shortName: 'Saltwater Warehouse',
    landmark: 'pier',
    district: 'Marina',
    x: 90,
    z: 495,
    cost: 25000,
    incomePerSec: 5,
    effect: 'Pays a $500 dividend every 60 seconds on top of rent',
    tagline: 'Crates, manifests, and the fattest rent in the Bay.',
    blurb:
      'A cavernous warehouse at the far end of the Marina Pier, where ' +
      'the import manifests are stamped and the crates nobody asks ' +
      'about are stored. It is the most expensive deed in the Bay and ' +
      'the best-paying: five dollars a second in rent, plus a $500 ' +
      'dividend every minute as the manifests clear. Own all three ' +
      'deeds and the warehouse is the engine of the empire.',
    perk: 'weekly-dividend',
    perkDetail:
      'While owned, a $500 dividend lands every 60 seconds, in addition ' +
      'to the $5-per-second rent. A toast announces each dividend.',
  },
];

// ---------------------------------------------------------------------
// Small lookups over the table above. Nothing here touches the DOM or
// the save; these are pure questions about the deed list.
// ---------------------------------------------------------------------

/** The deed with this id, or undefined when no deed has it. */
export function propertyById(id) {
  for (const prop of PROPERTIES) {
    if (prop.id === id) return prop;
  }
  return undefined;
}

/** True when the deed is already in Dante's portfolio. */
export function ownsProperty(state, id) {
  const biz = state.business;
  if (!biz || !Array.isArray(biz.owned)) return false;
  return biz.owned.indexOf(id) !== -1;
}

/** The deeds Dante owns, in the order they appear in the table. */
export function ownedProperties(state) {
  const biz = state.business;
  if (!biz || !Array.isArray(biz.owned)) return [];
  const held = [];
  for (const prop of PROPERTIES) {
    if (biz.owned.indexOf(prop.id) !== -1) held.push(prop);
  }
  return held;
}

/** The deeds Dante does not own yet, in table order. */
export function unownedProperties(state) {
  const biz = state.business;
  const held = biz && Array.isArray(biz.owned) ? biz.owned : [];
  const open = [];
  for (const prop of PROPERTIES) {
    if (held.indexOf(prop.id) === -1) open.push(prop);
  }
  return open;
}

/** Combined rent of everything Dante owns, dollars per second. */
export function totalIncomePerSec(state) {
  let total = 0;
  for (const prop of ownedProperties(state)) total += prop.incomePerSec;
  return total;
}

/** How many deeds Dante holds (0–3). */
export function ownedCount(state) {
  const biz = state.business;
  if (!biz || !Array.isArray(biz.owned)) return 0;
  return biz.owned.length;
}

/** True once Dante holds every deed in the Bay. */
export function ownsEverything(state) {
  return ownedCount(state) >= PROPERTIES.length;
}

// ---------------------------------------------------------------------
// Formatting helpers. Money is shown with thousands separators and no
// cents, the way the HUD shows it everywhere else; income rates keep
// one decimal so $3.50 a second reads as $3.5/s and not $4/s.
// ---------------------------------------------------------------------

function formatMoney(amount) {
  const whole = Math.floor(amount);
  return '$' + whole.toLocaleString('en-US');
}

function formatRate(rate) {
  return '$' + rate.toFixed(DISPLAY_DECIMALS) + '/s';
}

// ---------------------------------------------------------------------
// State setup. The business block is created lazily the first time any
// business function runs, and repaired field by field when a save
// from before v17 is loaded without it. Every other function in this
// file can therefore assume state.business exists and is well formed.
// ---------------------------------------------------------------------

export function ensureBusiness(state) {
  if (!state.business || typeof state.business !== 'object') {
    state.business = { owned: [], earned: 0, lastDividend: 0, nightclubTimer: 0 };
    return state.business;
  }
  const biz = state.business;
  if (!Array.isArray(biz.owned)) biz.owned = [];
  if (typeof biz.earned !== 'number' || !Number.isFinite(biz.earned)) biz.earned = 0;
  if (typeof biz.lastDividend !== 'number' || !Number.isFinite(biz.lastDividend)) biz.lastDividend = 0;
  if (typeof biz.nightclubTimer !== 'number' || !Number.isFinite(biz.nightclubTimer)) biz.nightclubTimer = 0;
  return biz;
}

// ---------------------------------------------------------------------
// Per-frame update. The main loop calls this once per step with the
// frame's delta time in seconds. Everything in here is real: rent
// moves money, the garage moves hit points, the club moves standing,
// and the warehouse moves a dividend. No effect here is cosmetic.
// ---------------------------------------------------------------------

export function updateBusiness(state, dt) {
  const biz = ensureBusiness(state);
  if (!biz.owned.length) return;
  if (!(dt > 0)) return;

  // Rent first: every owned deed pays its rate for this frame, and
  // the lifetime earnings counter tracks the same amount so the
  // panel's "total earned" is never a guess.
  let rentThisFrame = 0;
  for (const prop of ownedProperties(state)) {
    rentThisFrame += prop.incomePerSec * dt;
  }
  if (rentThisFrame > 0) {
    state.player.money += rentThisFrame;
    biz.earned += rentThisFrame;
  }

  // Then the three perks, each guarded by its own deed.
  if (ownsProperty(state, 'garage')) repairOwnedCar(state, dt);
  if (ownsProperty(state, 'nightclub')) raiseStripStanding(state, dt);
  if (ownsProperty(state, 'warehouse')) payWarehouseDividend(state, biz, dt);
}

// The garage perk: the mechanics patch the car Dante is driving right
// now, two hit points a second, up to the car's maximum health. It
// only runs while he is actually in a car — on foot there is nothing
// to repair — and it stops exactly at full health, never overhealing.
function repairOwnedCar(state, dt) {
  const car = state.player.car;
  if (!car) return;
  if (state.player.onFoot) return;
  const ceiling = car.maxHp;
  if (typeof ceiling !== 'number' || !Number.isFinite(ceiling)) return;
  if (typeof car.hp !== 'number' || !Number.isFinite(car.hp)) return;
  if (car.hp >= ceiling) return;
  car.hp = Math.min(ceiling, car.hp + GARAGE_REPAIR_PER_SECOND * dt);
}

// The nightclub perk: the door staff's word of mouth lifts Dante's
// standing in The Strip by one point every thirty seconds, up to the
// 100-point ceiling. The timer banks real seconds and can hand out
// more than one point after a long frame or a pause, so no goodwill
// is ever lost to a hiccup in the frame rate.
function raiseStripStanding(state, dt) {
  const biz = ensureBusiness(state);
  biz.nightclubTimer += dt;
  if (biz.nightclubTimer < NIGHTCLUB_TICK_SECONDS) return;
  const ticks = Math.floor(biz.nightclubTimer / NIGHTCLUB_TICK_SECONDS);
  biz.nightclubTimer -= ticks * NIGHTCLUB_TICK_SECONDS;
  if (!state.standing || typeof state.standing !== 'object') state.standing = {};
  const now = state.standing[NIGHTCLUB_DISTRICT];
  const current = typeof now === 'number' && Number.isFinite(now) ? now : 50;
  const raised = Math.min(STANDING_CEILING, current + ticks * NIGHTCLUB_STANDING_PER_TICK);
  if (raised === current) return;
  state.standing[NIGHTCLUB_DISTRICT] = raised;
  state.toast = `Club Neon Tide: The Strip loves you a little more (${standingLabel(raised)} ${raised})`;
  state.toastTimer = 3;
}

// The warehouse perk: once a minute of owning the warehouse, the
// import manifests clear and a $500 dividend lands on top of the
// rent. The timer banks seconds the same way the nightclub's does,
// so a long frame pays the dividend it owes instead of skipping it.
function payWarehouseDividend(state, biz, dt) {
  biz.lastDividend += dt;
  if (biz.lastDividend < WAREHOUSE_DIVIDEND_SECONDS) return;
  const payouts = Math.floor(biz.lastDividend / WAREHOUSE_DIVIDEND_SECONDS);
  biz.lastDividend -= payouts * WAREHOUSE_DIVIDEND_SECONDS;
  const bonus = payouts * WAREHOUSE_DIVIDEND_AMOUNT;
  state.player.money += bonus;
  biz.earned += bonus;
  state.toast = `Saltwater Warehouse dividend: +${formatMoney(bonus)}`;
  state.toastTimer = 3;
  pushFeed(state, 'Solmar Nights', `The Saltwater Warehouse just paid out ${formatMoney(bonus)} in dividends. Somebody owns the pier now.`);
}

// ---------------------------------------------------------------------
// Buying. The coordinator wires this to the E key. It only fires on
// foot, standing by the front door of a deed Dante does not own yet.
// Every outcome returns true when a deed was in reach — even the
// "you cannot afford it" toast — so the caller knows the keypress was
// consumed and should not fall through to the van crack, the shop,
// or any other E action. When no deed is in reach it returns false
// and the caller is free to try the next E action.
// ---------------------------------------------------------------------

/** The unowned deed nearest to Dante, within buying range — else null. */
export function nearestBuyableProperty(state) {
  const p = state.player;
  if (!p || p.onFoot === false) return null;
  const reach = BUY_RADIUS_METRES * BUY_RADIUS_METRES;
  let best = null;
  let bestDist = Infinity;
  for (const prop of unownedProperties(state)) {
    const d = dist2(p.x, p.z, prop.x, prop.z);
    if (d < reach && d < bestDist) {
      best = prop;
      bestDist = d;
    }
  }
  return best;
}

export function tryBuyBusiness(state) {
  const biz = ensureBusiness(state);
  const p = state.player;
  if (!p.onFoot) return false;

  const prop = nearestBuyableProperty(state);
  if (!prop) return false;

  // Short of cash: say exactly how much is missing, and consume the
  // keypress — the player asked about this deed, so the answer is
  // the price, not silence and not some other E action.
  if (p.money < prop.cost) {
    const shortfall = prop.cost - p.money;
    state.toast = `${prop.name} costs ${formatMoney(prop.cost)} — you are ${formatMoney(shortfall)} short.`;
    state.toastTimer = 3;
    return true;
  }

  // The purchase itself: real money out, a real deed in, and the
  // rent starts on the very next frame.
  p.money -= prop.cost;
  biz.owned.push(prop.id);
  state.toast = `You bought ${prop.name}! ${formatRate(prop.incomePerSec)} in rent, forever.`;
  state.toastTimer = 4;
  pushFeed(state, 'Solmar Nights', `Dante just bought ${prop.name} for ${formatMoney(prop.cost)}. The Bay has a new landlord.`);
  if (ownsEverything(state)) {
    state.toast = `Property empire complete! All three deeds are yours — ${formatRate(totalIncomePerSec(state))} in rent.`;
    state.toastTimer = 5;
    pushFeed(state, 'Solmar Nights', 'Dante owns the garage, the club, AND the warehouse. Somebody check the deed office — the whole Bay just changed hands.');
  }
  return true;
}

// ---------------------------------------------------------------------
// The prompt line. The coordinator asks this every frame while it
// builds the bottom-of-screen prompt; an empty string means "no
// business prompt right now" and the caller moves on to the next
// prompt source. The price is in the prompt so the player can decide
// before pressing E, not after.
// ---------------------------------------------------------------------

export function businessPrompt(state) {
  const p = state.player;
  if (!p || !p.onFoot) return '';
  const prop = nearestBuyableProperty(state);
  if (!prop) return '';
  return `E — Buy ${prop.name} (${formatMoney(prop.cost)})`;
}

// ---------------------------------------------------------------------
// The empire panel. The coordinator adds a <div id="business-panel">
// to index.html; this function fills it once per frame. The element
// is looked up once and cached in a module-level variable, the last
// HTML string is cached too, and the DOM is only written when the
// string actually changes — the same cheap-update discipline the HUD
// uses, so a panel that never changes costs nothing per frame.
// ---------------------------------------------------------------------

let businessPanelEl = null;
let businessPanelLastHtml = null;

export function renderBusinessPanel(state) {
  if (typeof document === 'undefined') return;
  if (!businessPanelEl) {
    businessPanelEl = document.getElementById('business-panel');
  }
  if (!businessPanelEl) return;

  const biz = ensureBusiness(state);
  const held = ownedProperties(state);
  const income = totalIncomePerSec(state);

  // One row per deed in the Bay: owned deeds show their name and
  // rent rate in gold; deeds still for sale show their name and
  // price in grey, so the panel doubles as a shopping list.
  const rows = [];
  for (const prop of PROPERTIES) {
    const owned = biz.owned.indexOf(prop.id) !== -1;
    if (owned) {
      rows.push(
        `<div class="biz-row biz-owned"><span class="biz-name">${prop.shortName}</span>` +
        `<span class="biz-rate">${formatRate(prop.incomePerSec)}</span></div>` +
        `<div class="biz-effect">${prop.effect}</div>`
      );
    } else {
      rows.push(
        `<div class="biz-row biz-forsale"><span class="biz-name">${prop.shortName}</span>` +
        `<span class="biz-price">${formatMoney(prop.cost)}</span></div>` +
        `<div class="biz-effect">${prop.effect}</div>`
      );
    }
  }

  const stripStanding = state.standing && typeof state.standing[NIGHTCLUB_DISTRICT] === 'number'
    ? state.standing[NIGHTCLUB_DISTRICT]
    : 50;
  const stripLine = ownsProperty(state, 'nightclub')
    ? `<div class="biz-standing">The Strip: ${stripStanding} (${standingLabel(stripStanding)})</div>`
    : '';

  const html =
    `<div class="biz-title">PROPERTY EMPIRE ${held.length}/${PROPERTIES.length}</div>` +
    rows.join('') +
    `<div class="biz-total">Rent: ${formatRate(income)} &nbsp;·&nbsp; Earned: ${formatMoney(biz.earned)}</div>` +
    stripLine;

  if (html === businessPanelLastHtml) return;
  businessPanelLastHtml = html;
  businessPanelEl.innerHTML = html;
}

// ---------------------------------------------------------------------
// A plain summary for the debug overlay and for save/load checks: how
// many deeds, which ones, what they pay together, and what they have
// paid so far. Nothing here writes to the DOM or mutates state.
// ---------------------------------------------------------------------

export function businessSummary(state) {
  const biz = ensureBusiness(state);
  return {
    owned: biz.owned.slice(),
    ownedCount: biz.owned.length,
    totalProperties: PROPERTIES.length,
    incomePerSec: totalIncomePerSec(state),
    earned: biz.earned,
    complete: ownsEverything(state),
  };
}
