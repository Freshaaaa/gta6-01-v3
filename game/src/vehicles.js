// Solmar Bay 3D — vehicles: the car model factory every car is built from.
// A car is a group: a bright body, a dark glass cabin and rear window, four
// wheels that stick out at the corners (dark tires, light hubs), a darker
// rear bumper, a thin rear spoiler, red/orange emissive taillight bars, side
// mirrors and pale headlights, plus a cheap blob shadow so it sits on the
// road instead of floating. The same factory builds the player's Comet, the
// traffic cars, the taxi and the police cars (which add a light bar).
import * as THREE from 'three';

export const CAR_COLORS = {
  comet: 0x2fae4e, // bright green — the hero car
  red: 0xc23b2e,
  teal: 0x2e8a8a,
  grey: 0x8a8f96,
  yellow: 0xe8b83a, // taxi
  white: 0xe9edf2, // police
  blue: 0x2e4a7a,
  purple: 0x7a4a9a,
};

const TIRE_COLOR = 0x2a2a2e;
const HUB_COLOR = 0xdfe3e8;
const GLASS_COLOR = 0x18202a;

// Build one car. opts: { color, model, police, taxi, spoiler }.
// Returns { group, wheels, setSpeed, model } — wheels spin with speed.
export function buildCar(G, opts) {
  const color = opts.color ?? CAR_COLORS.grey;
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1c1e24 });
  const glassMat = new THREE.MeshLambertMaterial({
    color: GLASS_COLOR, emissive: 0x0a1420, emissiveIntensity: 0.6,
  });
  const hubMat = new THREE.MeshLambertMaterial({
    color: HUB_COLOR, emissive: 0x555a60, emissiveIntensity: 0.5,
  });
  const tireMat = new THREE.MeshLambertMaterial({ color: TIRE_COLOR });

  // Main body: long, low, slightly tapered by a second box up front.
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.62;
  body.castShadow = !G.lowfx;
  group.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.42, 0.9), bodyMat);
  nose.position.set(0, 0.58, 2.15);
  group.add(nose);

  // Cabin + rear window (dark glass, set back so the rear reads as a car).
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.0), glassMat);
  cabin.position.set(0, 1.18, -0.3);
  cabin.castShadow = !G.lowfx;
  group.add(cabin);
  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.12), glassMat);
  rearGlass.position.set(0, 1.05, -1.36);
  rearGlass.rotation.x = -0.28;
  group.add(rearGlass);

  // Rear bumper: a darker strip across the back.
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.28, 0.24), darkMat);
  bumper.position.set(0, 0.42, -2.22);
  group.add(bumper);
  // Front bumper, same treatment.
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.26, 0.22), darkMat);
  frontBumper.position.set(0, 0.4, 2.26);
  group.add(frontBumper);

  // Rear spoiler: a thin wing on two small struts (sports-car read).
  if (opts.spoiler !== false) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.09, 0.5), darkMat);
    wing.position.set(0, 1.18, -2.05);
    group.add(wing);
    for (const sx of [-0.7, 0.7]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), darkMat);
      strut.position.set(sx, 1.0, -2.05);
      group.add(strut);
    }
  }

  // Taillights: red/orange emissive horizontal bars, not pale rectangles.
  const tailMat = new THREE.MeshLambertMaterial({
    color: 0xaa1408, emissive: 0xff2a10, emissiveIntensity: 1.6,
  });
  for (const sx of [-0.62, 0.62]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 0.08), tailMat);
    tail.position.set(sx, 0.82, -2.24);
    group.add(tail);
  }
  // Headlights: pale yellow-white bars up front.
  const headMat = new THREE.MeshLambertMaterial({
    color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 1.2,
  });
  for (const sx of [-0.62, 0.62]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.14, 0.08), headMat);
    head.position.set(sx, 0.78, 2.62);
    group.add(head);
  }

  // Side mirrors: small boxes on stalks.
  for (const sx of [-1, 1]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.24), darkMat);
    mirror.position.set(sx * 1.08, 1.05, 0.75);
    group.add(mirror);
  }

  // Four wheels, sticking out slightly at the corners: dark tires with
  // light hubs (radius 0.25) so all four read from the chase view.
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.34, 10);
  hubGeo.rotateZ(Math.PI / 2);
  for (const [wx, wz] of [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]]) {
    const wheel = new THREE.Group();
    const tire = new THREE.Mesh(wheelGeo, tireMat);
    tire.castShadow = !G.lowfx;
    wheel.add(tire);
    const hub = new THREE.Mesh(hubGeo, hubMat);
    wheel.add(hub);
    wheel.position.set(wx, 0.42, wz);
    group.add(wheel);
    wheels.push(wheel);
  }

  // Blob shadow: a dark ellipse under the car so it sits on the road.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 64;
  shadowCanvas.height = 128;
  const sg = shadowCanvas.getContext('2d');
  const sgrad = sg.createRadialGradient(32, 64, 4, 32, 64, 62);
  sgrad.addColorStop(0, 'rgba(0,0,0,0.42)');
  sgrad.addColorStop(0.7, 'rgba(0,0,0,0.25)');
  sgrad.addColorStop(1, 'rgba(0,0,0,0)');
  sg.fillStyle = sgrad;
  sg.fillRect(0, 0, 64, 128);
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(2.7, 5.2),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;
  group.add(blob);

  // Police light bar: red/blue emissive blocks on the roof.
  let lightBar = null;
  if (opts.police) {
    lightBar = new THREE.Group();
    const red = new THREE.MeshLambertMaterial({ color: 0xaa1010, emissive: 0xff2020, emissiveIntensity: 2.0 });
    const blue = new THREE.MeshLambertMaterial({ color: 0x1020aa, emissive: 0x2040ff, emissiveIntensity: 2.0 });
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.3), red);
    r.position.x = -0.35;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.3), blue);
    b.position.x = 0.35;
    lightBar.add(r);
    lightBar.add(b);
    lightBar.position.set(0, 1.52, -0.3);
    group.add(lightBar);
    // Police cheatline: a blue stripe down the body side.
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.22, 4.0),
      new THREE.MeshLambertMaterial({ color: 0x1e5fd6 }));
    stripe.position.y = 0.72;
    group.add(stripe);
  }

  // Taxi sign on the roof.
  if (opts.taxi) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3),
      new THREE.MeshLambertMaterial({ color: 0x222222, emissive: 0xffc860, emissiveIntensity: 1.0 }));
    sign.position.set(0, 1.55, -0.3);
    group.add(sign);
  }

  const car = {
    group,
    wheels,
    lightBar,
    model: opts.model || 'Sedan',
    color,
    x: 0,
    z: 0,
    heading: 0,
    speed: 0,
    staged: !!opts.staged,
    isPolice: !!opts.police,
    isTaxi: !!opts.taxi,
    // Spin the wheels from the speed (visual only).
    spin(dt) {
      const w = this.speed / 0.42;
      for (const wheel of this.wheels) wheel.rotation.x += w * dt;
    },
    // Place the mesh from the logical state.
    sync() {
      this.group.position.set(this.x, 0, this.z);
      this.group.rotation.y = this.heading;
    },
  };
  car.sync();
  return car;
}
