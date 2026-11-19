// Solmar Bay 3D — the story. Ten missions for Dante "D" Reyes, a
// wheelman fresh out of the Old Harbor docks, and Mara, his getaway-driver
// partner — the duo at the heart of the game, Lucia-and-Jason style, in
// our own invented cast. Rosa runs the diner and knows everybody's
// business; Vince Corso runs the Sunset Hills crew; the rival Saltwater
// crew want the whole Bay for themselves. Each mission is a list of
// steps; main.js starts a step and watches for its completion. After the
// finale, the repeatable courier job keeps the city paying.
//
// Step types (the only ones main.js understands):
//   goto       — reach the marker (x, z, radius); inCar: true means drive there
//   talk       — press E at the marker to hear the lines, then continue
//   steal      — get into any car (stand by it, press E)
//   stealModel — get into a car of a specific model (model, label)
//   pickup     — press E at the marker to grab the item (heat: wanted heat added)
//   kill       — defeat `count` goons spawned at `spawn` (they come to you)
//   timed      — drive through every checkpoint before the timer runs out
//                (seconds, checkpoints: [{x, z}], heat: wanted heat added)
//   hold       — stand in the marker zone and hold E for `seconds`
//                (heat: wanted heat added while the grab is on)
//   deliver    — reach the marker while carrying the goods
//   escape     — completes when the player has 0 wanted stars AND is inside
//                the marker radius (lose the cops, then get to safety)

import { LANDMARKS } from './config.js';
import { pick } from './rng.js';

export const MISSIONS = [
  {
    id: 'm1',
    title: 'First Wheels',
    giver: "Rosa — Rosa's Diner",
    reward: 300,
    briefing: [
      "ROSA: Dante Reyes! Back in Solmar Bay and already flat broke, I see.",
      "ROSA: The diner needs wheels and the lunch crowd took every parking spot. Borrow a car — nobody round here locks theirs.",
      "ROSA: Bring it back to the lot and I'll put you on the payroll.",
    ],
    steps: [
      { type: 'goto', x: LANDMARKS.diner.x, z: LANDMARKS.diner.z, radius: 14, label: "Go to Rosa's Diner" },
      {
        type: 'talk', x: LANDMARKS.diner.x, z: LANDMARKS.diner.z, radius: 15, label: 'Talk to Rosa (E)',
        lines: ["ROSA: Cars parked all along the plaza, sweetheart. Take one before the owner finishes dessert."],
      },
      { type: 'steal', label: 'Steal a car (stand by it, press E)' },
      { type: 'goto', x: LANDMARKS.diner.x, z: LANDMARKS.diner.z, radius: 14, inCar: true, label: 'Drive the car back to the diner' },
    ],
    complete: [
      "ROSA: Smooth. $300, and you didn't even scratch the paint.",
      "MARA: Not bad, Reyes. Next time I drive, you shoot. That's the deal.",
      "VINCE (phone): Rosa says you can drive. Come see me at the Hideout — I've got real work.",
    ],
  },
  {
    id: 'm2',
    title: 'The Pickup',
    giver: 'Vince Corso',
    reward: 800,
    briefing: [
      'VINCE: A crate came in on the night boat. Mine, not the Saltwaters\', and they know it.',
      'VINCE: Pick it up at the Old Harbor Docks and bring it to the Hideout. Cops see you carrying it, they ask questions.',
    ],
    steps: [
      { type: 'goto', x: LANDMARKS.docks.x, z: LANDMARKS.docks.z, radius: 14, label: 'Go to the Old Harbor Docks' },
      { type: 'pickup', x: LANDMARKS.docks.x, z: LANDMARKS.docks.z, radius: 10, label: 'Grab the crate (E)', heat: 30 },
      { type: 'deliver', x: LANDMARKS.hideout.x, z: LANDMARKS.hideout.z, radius: 14, label: 'Deliver the crate to the Hideout' },
    ],
    complete: [
      "VINCE: The crate's safe. $800. You're earning a name, Dante.",
      'VINCE: The Saltwaters won\'t forget this. Keep your eyes on the pier.',
    ],
  },
  {
    id: 'm3',
    title: 'Getaway Driver',
    giver: 'Vince Corso',
    reward: 1200,
    briefing: [
      'VINCE: My crew hit a warehouse in Downtown and the whole precinct is rolling in. They need a wheelman — you.',
      'MARA: I\'ll ride shotgun and call the turns. You just don\'t hit anything I wouldn\'t hit.',
      'VINCE: Thread the checkpoints through Downtown, then shake the heat at the Hideout. Do not stop for anything.',
    ],
    steps: [
      {
        type: 'timed', label: 'Hit all 3 checkpoints before time runs out', seconds: 150,
        checkpoints: [
          { x: 210, z: 90 }, { x: 270, z: 210 }, { x: 150, z: 210 },
        ], heat: 50,
      },
      { type: 'deliver', x: LANDMARKS.hideout.x, z: LANDMARKS.hideout.z, radius: 14, label: 'Lose the cops — reach the Hideout' },
    ],
    complete: [
      "VINCE: Beautiful driving. The crew's free and the cops are chasing ghosts.",
      "MARA: Told you. Best wheelman in the Bay — and I was the one reading the map.",
      'VINCE: $1,200. And a warning — the Saltwaters are massing at the Marina Pier.',
    ],
  },
  {
    id: 'm4',
    title: 'Turf War',
    giver: 'Vince Corso',
    reward: 1800,
    briefing: [
      'VINCE: The Saltwater crew is moving on the Marina Pier tonight. Five of them, armed, claiming my turf.',
      'VINCE: Go down there and end it. Fists or the pistol — your call. Just come back breathing.',
    ],
    steps: [
      { type: 'goto', x: LANDMARKS.pier.x, z: LANDMARKS.pier.z, radius: 16, label: 'Go to the Marina Pier' },
      { type: 'kill', count: 5, spawn: { x: LANDMARKS.pier.x, z: LANDMARKS.pier.z }, label: 'Take out the Saltwater crew (0/5)' },
      { type: 'goto', x: LANDMARKS.hideout.x, z: LANDMARKS.hideout.z, radius: 14, label: 'Report back to the Hideout' },
    ],
    complete: [
      'VINCE: The pier is ours again. $1,800, and the Saltwaters will think twice next time.',
      'VINCE: One more job after this, Dante. The big one. The Bank of Solmar.',
    ],
  },
  {
    id: 'm5',
    title: 'The Big Score',
    giver: 'Vince Corso',
    reward: 4500,
    briefing: [
      'VINCE: The Bank of Solmar moves its weekend take on Friday. One vault, one bag, one fast car.',
      "MARA: I'll be in the car out front, engine running, radio on. You bring the bag, I bring the speed.",
      'VINCE: Get inside, crack the vault, and bring the bag to the Hideout. Every cop in Solmar will be on you. Make it count.',
    ],
    steps: [
      { type: 'goto', x: LANDMARKS.bank.x, z: LANDMARKS.bank.z, radius: 15, label: 'Go to the Bank of Solmar' },
      { type: 'hold', x: LANDMARKS.bank.x, z: LANDMARKS.bank.z, radius: 11, seconds: 4, label: 'Crack the vault — hold E', heat: 75 },
      { type: 'deliver', x: LANDMARKS.hideout.x, z: LANDMARKS.hideout.z, radius: 14, label: 'Escape! Deliver the bag to the Hideout' },
    ],
    complete: [
      "VINCE: Four and a half thousand dollars of clean getaway. The whole Bay is talking about you, Dante.",
      "MARA: And about the driver who kept the cops off your bumper the whole way.",
      "ROSA: Dinner's on me tonight. You earned it, wheelman.",
    ],
  },
  {
    id: 'm6',
    title: 'Static',
    giver: 'Vince Corso',
    reward: 2000,
    briefing: [
      'VINCE: The Saltwaters didn\'t learn at the pier. Now they\'re squatting on the City Hall lot, waving guns at council staff.',
      'VINCE: Clear them out before the mayor calls the state police. Four of them, tops — and Dante? Make it loud.',
    ],
    steps: [
      { type: 'goto', x: LANDMARKS.cityhall.x, z: LANDMARKS.cityhall.z, radius: 16, label: 'Go to Solmar City Hall' },
      { type: 'kill', count: 4, spawn: { x: LANDMARKS.cityhall.x, z: LANDMARKS.cityhall.z }, label: 'Clear the Saltwaters off the City Hall lot (0/4)' },
      { type: 'goto', x: LANDMARKS.hideout.x, z: LANDMARKS.hideout.z, radius: 14, label: 'Report back to the Hideout' },
    ],
    complete: [
      'VINCE: City Hall is quiet again. The mayor owes me a favour now — $2,000 for you.',
      'VINCE: Rosa\'s got a client asking for a fast car. Talk to her when you\'re ready.',
    ],
  },
  {
    id: 'm7',
    title: 'Chop Shop',
    giver: "Rosa — Rosa's Diner",
    reward: 1600,
    briefing: [
      "ROSA: A client of mine collects fast cars and pays cash, no questions. He wants a Strada — red, quick, the one everybody stares at.",
      'ROSA: Lift one anywhere in the city and drop it at the docks. The chop crew will take it from there. $1,600.',
    ],
    steps: [
      { type: 'stealModel', model: 'Strada', label: 'Steal a Strada — any Strada will do' },
      { type: 'deliver', x: LANDMARKS.docks.x, z: LANDMARKS.docks.z, radius: 14, label: 'Deliver the Strada to the docks (chop shop)' },
    ],
    complete: [
      'ROSA: The client loves it. $1,600, and he says he\'ll call again when he wants something faster.',
      'VINCE (phone): One last job, Dante. The Grand Casino. Tonight. Bring your best driving.',
    ],
  },
  {
    id: 'm8',
    title: 'Heatwave',
    giver: 'Vince Corso',
    reward: 5000,
    briefing: [
      'VINCE: The Grand Casino keeps its Friday take in a safe behind the floor. Tonight the whole city is watching the fireworks — nobody watches the safe.',
      "MARA: You crack, I drive. Same as always — except this time the whole Bay is the getaway.",
      'VINCE: Crack it, then vanish. Lose every cop in Solmar, then get to the Hideout. Pull this off and you\'re not a wheelman any more, Dante. You\'re a legend.',
    ],
    steps: [
      { type: 'goto', x: LANDMARKS.casino.x, z: LANDMARKS.casino.z, radius: 15, label: 'Go to the Grand Casino' },
      { type: 'hold', x: LANDMARKS.casino.x, z: LANDMARKS.casino.z, radius: 11, seconds: 6, label: 'Crack the safe — hold E', heat: 75 },
      { type: 'escape', x: LANDMARKS.hideout.x, z: LANDMARKS.hideout.z, radius: 14, label: 'Lose the cops, then reach the Hideout' },
    ],
    complete: [
      'VINCE: Five thousand dollars. The casino, the bank, the pier — the whole Bay is yours now, Dante.',
      "MARA: Ours. Don't forget who was in the passenger seat.",
      "ROSA: The diner's renaming the special after you. The Dante: extra hot, gone in sixty seconds.",
      'VINCE (phone): Enjoy it while it lasts. The Saltwaters are regrouping at the Stadium — I\'ll call.',
    ],
  },
  {
    id: 'm9',
    title: 'Stadium Brawl',
    giver: 'Vince Corso',
    reward: 2000,
    briefing: [
      'VINCE: The Saltwaters are running a chop ring out of Solmar Stadium — six of them, armed, stripping fast cars in the lot.',
      'VINCE: Go in loud, take the lot back, and grab their ledger. It names every buyer they ever had — and it goes to the Marina Pier.',
    ],
    steps: [
      { type: 'goto', x: LANDMARKS.stadium.x, z: LANDMARKS.stadium.z, radius: 16, label: 'Go to Solmar Stadium' },
      { type: 'kill', count: 6, spawn: { x: LANDMARKS.stadium.x, z: LANDMARKS.stadium.z }, label: 'Take the Stadium lot back (0/6)' },
      { type: 'pickup', x: LANDMARKS.stadium.x, z: LANDMARKS.stadium.z, radius: 10, label: 'Grab the ledger (E)', heat: 30 },
      { type: 'deliver', x: LANDMARKS.pier.x, z: LANDMARKS.pier.z, radius: 14, label: 'Deliver the ledger to the Marina Pier' },
    ],
    complete: [
      'VINCE: The ledger is gold, Dante. Every Saltwater buyer in the Bay, in one book.',
      'VINCE: $2,000. One job left, and it ends this — the boss himself, at the Lighthouse.',
    ],
  },
  {
    id: 'm10',
    title: 'King of the Bay',
    giver: 'Vince Corso',
    reward: 8000,
    briefing: [
      'VINCE: The Saltwater boss is fleeing by boat from the Lighthouse — his whole cut of the Bay in one duffel bag, sitting in the keeper\'s hut.',
      "MARA: Last one. You drive like the Bay is on fire, I cover the exits, and we walk away kings.",
      'VINCE: Thread the checkpoints through the city, crack the hut, and vanish. Lose every cop in Solmar. Do this and the Bay is yours for good, Dante.',
    ],
    steps: [
      {
        type: 'timed', label: 'Hit all 4 checkpoints before time runs out', seconds: 180,
        checkpoints: [
          { x: 210, z: 90 }, { x: 330, z: 270 }, { x: 150, z: 390 }, { x: 390, z: 450 },
        ], heat: 50,
      },
      { type: 'hold', x: LANDMARKS.lighthouse.x, z: LANDMARKS.lighthouse.z, radius: 11, seconds: 5, label: 'Crack the keeper\'s hut — hold E', heat: 75 },
      { type: 'escape', x: LANDMARKS.hideout.x, z: LANDMARKS.hideout.z, radius: 14, label: 'Lose the cops, then reach the Hideout' },
    ],
    complete: [
      'VINCE: Eight thousand dollars. The boss is gone, the crew is yours, the Bay is yours.',
      "MARA: The Bay is OURS, Dante. Don't make me correct you in front of the crew again.",
      "ROSA: The Dante special is on the house tonight. Forever.",
      'STORY COMPLETE — Solmar Bay is yours. Courier jobs keep paying at the Hideout.',
    ],
  },
];

// Repeatable side job after the story (or between missions, from the Hideout).
export function makeCourierJob(rng, index) {
  const spots = [LANDMARKS.docks, LANDMARKS.pier, LANDMARKS.plaza, LANDMARKS.bank, LANDMARKS.diner];
  const dest = pick(rng, spots);
  return {
    id: `courier-${index}`,
    title: 'Courier Run',
    giver: 'Rosa — side job',
    reward: 250,
    briefing: [`ROSA: A parcel needs to reach ${dest.name}. $250 if it gets there in one piece.`],
    steps: [
      // The parcel starts at Rosa's Diner (she hands it over) so the
      // pickup never collides with the Hideout weapon shop's E prompt.
      { type: 'pickup', x: LANDMARKS.diner.x, z: LANDMARKS.diner.z, radius: 11, label: 'Pick up the parcel at the Diner (E)' },
      { type: 'deliver', x: dest.x, z: dest.z, radius: 14, label: `Deliver the parcel to ${dest.name}` },
    ],
    complete: ['ROSA: Delivered. $250 — come back when you want another run.'],
  };
}

// Human-readable objective line for the HUD.
export function objectiveText(mission, stepIndex, stepState) {
  if (!mission) return 'Free roam — visit the Hideout for work';
  const step = mission.steps[stepIndex];
  if (!step) return mission.title;
  if (step.type === 'kill') {
    const done = stepState.kills || 0;
    return `Take out the Saltwater crew (${done}/${step.count})`;
  }
  if (step.type === 'timed') {
    const hit = stepState.checkpointsHit || 0;
    const left = Math.max(0, Math.ceil(stepState.timeLeft || 0));
    return `Checkpoints ${hit}/${step.checkpoints.length} — ${left}s left`;
  }
  if (step.type === 'hold' && stepState.holding) {
    const left = Math.max(0, Math.ceil(stepState.holdLeft || 0));
    return `Hold on… ${left}s`;
  }
  if (step.type === 'stealModel') {
    return `Steal a ${step.model} — any ${step.model} will do`;
  }
  if (step.type === 'escape') {
    return 'Lose the cops, then reach the Hideout';
  }
  return step.label;
}
