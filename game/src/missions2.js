// Solmar Bay 3D — the Ironwood arc (missions m16–m20).
//
// The Saltwaters are finished after m15 "The Last Tide" and the Bay
// belongs to Dante — until a new crew rolls down from upstate. The
// Ironwood crew runs timber money, stolen cars and muscle, and their
// boss Silas Ironwood wants the whole coastline. His lieutenant
// Dagger runs the street side of the operation and drives a pink
// Aurora he did not pay for. Vince Corso sends Dante to break them
// the same way the Saltwaters were broken: turf, cars, the pier,
// the garage, and finally the boss himself at the Lighthouse.
//
// The arc runs in five beats, and each one takes something from
// Ironwood that he cannot buy back:
//
//   m16 — his eyes. The lookouts on the Stadium roofline watch the
//         whole north end for him. Take them down and the north
//         side goes blind.
//   m17 — his pride. Dagger's stolen pink Aurora is the fastest car
//         in the Bay and the loudest thing Dagger owns. Lift it,
//         sell it at the docks, and let Dagger come running.
//   m18 — his sea. Ironwood hits the Marina Pier with six men and
//         a boat. Hold the pier, chase the boat down the coast, and
//         bring the cargo home.
//   m19 — his driver. Dagger's best wheelman runs a tuned Strada
//         and wants the Strip. Out-build him at Lio's garage, then
//         out-drive him through the checkpoints and lose the cops.
//   m20 — the man himself. Silas Ironwood waits at the Lighthouse
//         with a safe full of timber money and the last of his crew.
//         Crack the safe, finish the crew, bring the money home.
//
// Five missions, escalating pay: m16 $9,000, m17 $14,000, m18
// $20,000, m19 $22,000, m20 $30,000 — $95,000 for the arc. The full
// story now pays $204,200 ($109,200 for m1–m15 plus $95,000 here).
//
// Step types are the same ones main.js understands (goto, talk,
// steal, stealModel, pickup, kill, timed, hold, deliver, escape,
// board, tune). New faces in this arc: Silas Ironwood, Dagger,
// and the Ironwood lookouts, drivers and dock crew. New ground too:
// the Stadium roofline, the pier dock, the coastal chase line and
// the Lighthouse road all get used in ways the first fifteen
// missions never used them.

import { LANDMARKS } from './config.js';
import { pick } from './rng.js';

export const MISSIONS2 = [
  // m16 — SMOKE FROM UPSTATE.
  // The opener. Vince calls Dante to the Hideout with bad news from
  // upstate, Mara has already tailed a lookout to the Stadium, and
  // the job ends with Dante holding a dead lookout's radio — the
  // first proof of how Ironwood talks, and the thread m17 pulls on.
  // Pay $9,000. Four lookouts, one radio, no witnesses left talking.
  {
    id: 'm16',
    title: 'Smoke from Upstate',
    giver: 'Vince Corso',
    reward: 9000,
    briefing: [
      "VINCE: Enjoy the quiet, Dante. It lasted about a week.",
      "VINCE: A crew from upstate — Ironwood — just bought the old timber yard and started taxing every driver on the north side.",
      "VINCE: Their boss is Silas Ironwood. Ex-military, patient, and he does not bluff. His street man is called Dagger.",
      "MARA: I tailed one of their lookouts to the Stadium. They watch the whole north end from the stands, radios and all.",
      "VINCE: Go see me at the Hideout first. Then go look at their turf with your own eyes — and clear those lookouts off it.",
      "MARA: Bring me one of their radios when you are done. I want to hear how Ironwood talks before he knows we are listening.",
    ],
    steps: [
      {
        type: 'goto',
        x: LANDMARKS.hideout.x, z: LANDMARKS.hideout.z, radius: 14,
        label: 'Meet Vince at the Hideout',
      },
      {
        type: 'talk',
        x: LANDMARKS.hideout.x, z: LANDMARKS.hideout.z, radius: 15,
        label: 'Talk to Vince (E)',
        lines: [
          "VINCE: Ironwood thinks the Bay is an empty lot he can fence off. Show him it has an owner.",
          'VINCE: Four lookouts on the Stadium roofline. Take them down and the north side goes blind.',
          "VINCE: And Dante — quiet where you can be. Loud where you cannot. Either way, come back.",
        ],
      },
      {
        type: 'goto',
        x: LANDMARKS.stadium.x, z: LANDMARKS.stadium.z, radius: 16,
        label: 'Scout the Ironwood turf at the Stadium',
      },
      {
        type: 'kill',
        count: 4,
        spawn: { x: LANDMARKS.stadium.x, z: LANDMARKS.stadium.z },
        label: 'Clear the Ironwood lookouts (0/4)',
      },
      {
        type: 'pickup',
        x: LANDMARKS.stadium.x, z: LANDMARKS.stadium.z, radius: 10,
        label: 'Grab a lookout radio (E)',
      },
    ],
    complete: [
      'VINCE: The Stadium is quiet again. Their lookouts are gone and the north side noticed.',
      "MARA: The radio works. Ironwood's men check in every twenty minutes — and now they are checking in to nobody.",
      "MARA: Dagger is going to take that personally. Good — angry men make mistakes.",
      'VINCE: $9,000. Ironwood will answer this. Be ready when he does.',
    ],
  },
  // m17 — THE PINK AURORA.
  // The humiliation job. Dagger's stolen Aurora is his reputation
  // on four wheels, so Dante steals it in broad daylight, drops it
  // at the Old Harbor Docks for Mara's buyer, and then waits at the
  // Marina Pier for the crew Dagger always sends when he is angry.
  // Pay $14,000. One supercar, one buyer, five angry men.
  {
    id: 'm17',
    title: 'The Pink Aurora',
    giver: 'Vince Corso',
    reward: 14000,
    briefing: [
      'VINCE: Dagger drives a pink Aurora through Downtown like he owns the road. He does not own it — he lifted it off a dealer in Coral Row.',
      "VINCE: That car is the fastest thing in the Bay and it is also bait. Take it, and Dagger comes running.",
      'MARA: The docks are the drop. I will have a buyer waiting with cash and no questions.',
      "VINCE: Lift the Aurora, bring it to the Old Harbor Docks — then deal with whatever Dagger sends to the Pier. He always sends somebody.",
      'MARA: And Dante? When you take it, take it clean. That paint job is half the price.',
      'VINCE: Five men, maybe more, at the pier. You have done this before. Do it again.',
    ],
    steps: [
      {
        type: 'stealModel',
        model: 'Aurora',
        label: 'Steal an Aurora (find the pink one, press E)',
      },
      {
        type: 'deliver',
        x: LANDMARKS.docks.x, z: LANDMARKS.docks.z, radius: 14,
        label: 'Deliver the Aurora to the Old Harbor Docks',
      },
      {
        type: 'talk',
        x: LANDMARKS.docks.x, z: LANDMARKS.docks.z, radius: 15,
        label: 'Talk to Mara at the docks (E)',
        lines: [
          "MARA: Cash is in the bag. The buyer never even asked where the pink came from.",
          "MARA: Dagger's crew is already rolling toward the pier. Go — I will watch the docks.",
        ],
      },
      {
        type: 'goto',
        x: LANDMARKS.pier.x, z: LANDMARKS.pier.z, radius: 16,
        label: 'Head to the Marina Pier — Dagger will answer',
      },
      {
        type: 'kill',
        count: 5,
        spawn: { x: LANDMARKS.pier.x, z: LANDMARKS.pier.z },
        label: "Take out Dagger's crew (0/5)",
      },
    ],
    complete: [
      "MARA: The Aurora is gone, the cash is in the bag, and Dagger is screaming at his own crew on an open channel.",
      'VINCE: $14,000. You took his car and his pride in one afternoon.',
      'MARA: He is not going to forget the pink car. Nobody in this city is going to let him forget it.',
      'VINCE: Ironwood will not send boys next time. He will come himself — or send the whole pier.',
    ],
  },
  // m18 — STORM THE MARINA.
  // The siege job, and the first boat chase of the arc. Ironwood
  // sends six men at the Marina Pier at night; when the pier holds,
  // their boat tries to run down the coast. Dante boards the Dinghy
  // at the pier dock, runs the coastal checkpoints, and brings the
  // recovered cargo back to the Hideout. Pay $20,000.
  {
    id: 'm18',
    title: 'Storm the Marina',
    giver: 'Vince Corso',
    reward: 20000,
    briefing: [
      "VINCE: Here it comes. Ironwood is hitting the Marina Pier tonight — six men, maybe more, straight at our boats.",
      'VINCE: If the pier falls, the sea is theirs, and the sea is how half this crew eats.',
      'MARA: Hold the pier. When their boat tries to run, take the Dinghy and chase it down the coast. Do not let it reach open water.',
      'VINCE: Six men on the pier, one boat on the run. End both problems before sunrise.',
      'MARA: The Dinghy is slow and the coast is dark. Stay on the chase line and do not cut the corners — the sand will eat you.',
      "VINCE: And bring the cargo back. Whatever they loaded on that boat, it is ours now.",
    ],
    steps: [
      {
        type: 'goto',
        x: LANDMARKS.pier.x, z: LANDMARKS.pier.z, radius: 16,
        label: 'Get to the Marina Pier',
      },
      {
        type: 'kill',
        count: 6,
        spawn: { x: LANDMARKS.pier.x, z: LANDMARKS.pier.z },
        label: 'Defend the Marina Pier (0/6)',
      },
      {
        type: 'board',
        x: 90, z: 531, radius: 12,
        label: 'Board the Dinghy at the pier dock (E)',
      },
      {
        type: 'timed',
        label: 'Chase the Ironwood boat down the coast',
        seconds: 150,
        checkpoints: [
          { x: 150, z: 533 }, { x: 240, z: 533 }, { x: 330, z: 533 }, { x: 420, z: 533 },
        ],
        heat: 50,
      },
      {
        type: 'deliver',
        x: LANDMARKS.hideout.x, z: LANDMARKS.hideout.z, radius: 14,
        label: 'Bring the recovered cargo to the Hideout',
      },
    ],
    complete: [
      'MARA: The pier is ours, their boat is scrap, and the coast road is quiet for the first time in weeks.',
      "VINCE: $20,000. Ironwood just lost his pier, his boat and six men. He has one move left.",
      'MARA: The cargo was timber money — clean bills, banded, counted. Ironwood was funding the whole push from that boat.',
      'VINCE: He will make it at the Lighthouse. I can feel it.',
    ],
  },
  // m19 — FOUR ON THE FLOOR.
  // The race job. Dagger's best driver challenges the crew for the
  // Strip, so Lio builds Dante's car to TUNE 4 first — engine,
  // armour, wheels, the works — and Dante beats the Ironwood driver
  // through four checkpoints across the city, then shakes the cops
  // at the Hideout. Pay $22,000. The only mission in the arc where
  // the garage does the talking before the driver does.
  {
    id: 'm19',
    title: 'Four on the Floor',
    giver: "Lio — Lio's Tuning Garage",
    reward: 22000,
    briefing: [
      "LIO: Dagger is done crying about his Aurora. Now he wants a race — his best driver against ours, winner takes the Strip.",
      'LIO: His driver runs a tuned Strada and he is fast, Dante. Faster than anything you have driven stock.',
      "LIO: So we tune yours first. Bring a car to my garage and I will build it to TUNE 4 — engine, armour, wheels, the works.",
      'MARA: Then beat his driver through the checkpoints, and when the cops come — because they always come — lose them at the Hideout.',
      "LIO: TUNE 4 or do not bother showing up. Dagger's driver will eat a stock car alive.",
      "MARA: The whole Strip is watching this one. Win it clean and Ironwood's name is mud from the docks to the casino.",
    ],
    steps: [
      {
        type: 'goto',
        x: LANDMARKS.stadium.x, z: LANDMARKS.stadium.z, radius: 16,
        label: 'Face down Dagger’s driver at the Stadium',
      },
      {
        type: 'goto',
        x: LANDMARKS.tuner.x, z: LANDMARKS.tuner.z, radius: 14,
        label: "Get to Lio's Tuning Garage",
      },
      {
        type: 'tune',
        label: 'Tune your car to TUNE 4 at the garage',
        min: 4,
      },
      {
        type: 'timed',
        label: "Beat Dagger's driver through the checkpoints",
        seconds: 180,
        checkpoints: [
          { x: 90, z: 330 }, { x: 210, z: 270 }, { x: 330, z: 150 }, { x: 450, z: 270 },
        ],
        heat: 50,
      },
      {
        type: 'escape',
        x: LANDMARKS.hideout.x, z: LANDMARKS.hideout.z, radius: 14,
        label: 'Escape the cops — reach the Hideout with no heat',
      },
    ],
    complete: [
      "LIO: TUNE 4, a clean run, and Dagger's driver is still looking for the finish line. That car sings now.",
      "MARA: The whole Strip saw it. Ironwood's best just got beaten by a garage build and a wheelman.",
      'VINCE: $22,000. One man left standing in the Ironwood crew — Silas himself.',
      "LIO: Bring the car back any time. After tonight, everybody in Solmar wants what you are driving.",
    ],
  },
  // m20 — IRONWOOD FALLS.
  // The finale. Silas Ironwood waits at the Lighthouse with a safe
  // full of timber money and the last six men of his crew, on ground
  // with only one road out. Dante threads the roadblocks through
  // the north side, cracks the safe under fire, finishes the crew,
  // and carries the money home to the Hideout. Pay $30,000 — the
  // biggest single payout in the story — and the Bay is Dante's.
  {
    id: 'm20',
    title: 'Ironwood Falls',
    giver: 'Vince Corso',
    reward: 30000,
    briefing: [
      'VINCE: It ends tonight, Dante. Silas Ironwood is at the Lighthouse with what is left of his crew and a safe full of timber money.',
      'VINCE: He picked the Lighthouse because there is only one road out. He thinks that traps us. It traps him.',
      "MARA: Thread the checkpoints through the north side fast — his lookouts will call it in the second you move.",
      'VINCE: Crack the safe, take out his crew, and bring the money home to the Hideout. When the sun comes up, the Bay is ours for good.',
      'MARA: Silas is not Dagger. He will not scream and he will not run. He will stand by that safe and dare you to open it.',
      'VINCE: Then open it. Thirty thousand, and the whole coastline with it.',
    ],
    steps: [
      {
        type: 'goto',
        x: LANDMARKS.lighthouse.x, z: LANDMARKS.lighthouse.z, radius: 16,
        label: 'Get to the Lighthouse',
      },
      {
        type: 'timed',
        label: 'Push through the Ironwood roadblocks',
        seconds: 180,
        checkpoints: [
          { x: 330, z: 90 }, { x: 270, z: 210 }, { x: 150, z: 330 }, { x: 90, z: 450 },
        ],
        heat: 50,
      },
      {
        type: 'hold',
        x: LANDMARKS.lighthouse.x, z: LANDMARKS.lighthouse.z, radius: 10,
        seconds: 8,
        label: "Crack Silas's safe (hold E)",
        heat: 50,
      },
      {
        type: 'kill',
        count: 6,
        spawn: { x: LANDMARKS.lighthouse.x, z: LANDMARKS.lighthouse.z },
        label: "Take out Silas's crew (0/6)",
      },
      {
        type: 'deliver',
        x: LANDMARKS.hideout.x, z: LANDMARKS.hideout.z, radius: 14,
        label: 'Bring the Ironwood money to the Hideout',
      },
    ],
    complete: [
      'VINCE: Silas Ironwood is done. The safe is empty, his crew is scattered, and the timber yard is ours.',
      "MARA: From the docks to the Lighthouse — the whole Bay, Dante. Saltwaters, Ironwood, all of it.",
      'VINCE: $30,000. The Bay is yours now. Try not to get bored — the city always finds new trouble.',
      'DANTE: Let it come. We will be ready.',
    ],
  },
];

// The Ironwood arc in numbers: five missions, $95,000, and the Bay
// finally quiet — until the next crew hears about it. The totals
// below are computed from the mission list itself so the header
// comment above and the payout can never drift apart again.
export const IRONWOOD_ARC = {
  missions: MISSIONS2.length,
  totalReward: MISSIONS2.reduce((sum, m) => sum + m.reward, 0),
  firstId: MISSIONS2[0].id,
  lastId: MISSIONS2[MISSIONS2.length - 1].id,
};

// A spare roll for later hooks: pick a random Ironwood-flavoured
// landmark for ambient chatter. Not used by the missions above.
export function ironwoodLandmark(rng) {
  return pick(rng, [LANDMARKS.stadium, LANDMARKS.pier, LANDMARKS.lighthouse, LANDMARKS.docks]);
}
