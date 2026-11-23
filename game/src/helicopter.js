// Solmar Bay 3D — helicopter: the BBPD police helicopter. It appears at
// wanted 3+, circling the player, and it stars in the cover shot: hovering
// low (~12 m) so the body, tail, main rotor and tail rotor all read, in
// police white with a blue cheatline and a red beacon. Its SpotLight cone
// is STAGED-ONLY — it turns on only during staged shots (stageAt()), and
// stays OFF in normal gameplay, because a live shadow-casting spotlight
// halves the sim rate under SwiftShader.
import * as THREE from 'three';

export function createHelicopter(G) {
  const group = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xe9edf2 });
  const blue = new THREE.MeshLambertMaterial({ color: 0x1e5fd6 });
  const glass = new THREE.MeshLambertMaterial({
    color: 0x8ab0cc, emissive: 0x3a5a7a, emissiveIntensity: 0.7,
  });
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0xb8bec6 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2a2e });

  // Body: a rounded cabin (box + nose), police white.
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.7, 4.2), white);
  body.castShadow = !G.lowfx;
  group.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 1.2), white);
  nose.position.set(0, -0.1, 2.5);
  group.add(nose);
  // Blue cheatline along the body.
  const cheat = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.35, 4.0), blue);
  cheat.position.y = -0.15;
  group.add(cheat);
  // Cockpit glass: the dark blue windshield up front.
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.0, 0.9), glass);
  cockpit.position.set(0, 0.35, 2.0);
  group.add(cockpit);
  // Tail boom + tail fin.
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.6), white);
  tail.position.set(0, 0.2, -4.2);
  group.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 1.0), blue);
  fin.position.set(0, 0.8, -6.2);
  group.add(fin);
  // Skids.
  for (const sx of [-0.9, 0.9]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 3.4), dark);
    skid.position.set(sx, -1.15, 0.4);
    group.add(skid);
  }
  // Main rotor: two blades on a mast, plus a translucent blur disc so the
  // spin reads even in a still screenshot.
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 8), dark);
  mast.position.y = 1.25;
  group.add(mast);
  const rotor = new THREE.Group();
  rotor.position.y = 1.75;
  for (const a of [0, Math.PI]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.08, 0.5), bladeMat);
    blade.rotation.y = a;
    rotor.add(blade);
  }
  group.add(rotor);
  const blurDisc = new THREE.Mesh(
    new THREE.CircleGeometry(4.6, 28),
    new THREE.MeshBasicMaterial({ color: 0xd8dce2, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
  );
  blurDisc.rotation.x = -Math.PI / 2;
  blurDisc.position.y = 1.78;
  group.add(blurDisc);
  // Tail rotor: small spinning cross at the tail.
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.35, 0.7, -6.2);
  for (const a of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.7, 0.14), bladeMat);
    blade.rotation.z = a;
    tailRotor.add(blade);
  }
  group.add(tailRotor);
  // Red beacon on top + a soft halo sprite so it reads at a glance.
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xaa1010, emissive: 0xff2020, emissiveIntensity: 2.5 })
  );
  beacon.position.set(0, 1.0, -0.6);
  group.add(beacon);
  const beaconHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: G.glowTexture, transparent: true, depthWrite: false,
    color: 0xff4040, blending: THREE.AdditiveBlending, opacity: 0.7,
  }));
  beaconHalo.scale.set(2.2, 2.2, 1);
  beaconHalo.position.copy(beacon.position);
  group.add(beaconHalo);

  // The SpotLight cone pointing down. STAGED-ONLY: off during gameplay.
  const spot = new THREE.SpotLight(0xfff2c0, 0, 90, 0.42, 0.5, 1.2);
  spot.position.set(0, -0.8, 0);
  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(0, -30, 0);
  group.add(spotTarget);
  spot.target = spotTarget;
  group.add(spot);

  group.visible = false;
  G.scene.add(group);

  const heli = {
    group,
    rotor,
    tailRotor,
    beacon,
    beaconHalo,
    spot,
    staged: false,
    angle: 0,
    height: 26,

    // Show the helicopter (wanted 3+ or a staged shot).
    show() {
      group.visible = true;
    },

    hide() {
      group.visible = false;
      this.setSpot(false);
    },

    // Stage the helicopter for a shot: hover low (~12 m) over the road
    // ahead of the car, fully in frame, spotlight ON.
    stageAt(x, z, height) {
      this.staged = true;
      this.height = height || 12;
      group.position.set(x, this.height, z);
      group.rotation.y = 0;
      this.show();
      this.setSpot(true);
    },

    // Unstage: back to the patrol height, spotlight OFF.
    unstage() {
      this.staged = false;
      this.height = 26;
      this.setSpot(false);
    },

    setSpot(on) {
      spot.intensity = on ? 900 : 0;
    },

    // One fixed step: rotors spin, the beacon pulses, and the heli
    // circles the player (unless staged, when it holds its mark).
    update(dt) {
      if (!group.visible) return;
      this.rotor.rotation.y += dt * 14;
      this.tailRotor.rotation.x += dt * 22;
      const pulse = 0.5 + 0.5 * Math.sin(G.simTime * 6);
      this.beaconHalo.material.opacity = 0.35 + pulse * 0.45;
      if (this.staged) return;
      this.angle += dt * 0.22;
      const r = 34;
      group.position.set(
        G.player.x + Math.sin(this.angle) * r,
        this.height + Math.sin(G.simTime * 0.8) * 1.5,
        G.player.z + Math.cos(this.angle) * r
      );
      group.rotation.y = Math.atan2(G.player.x - group.position.x, G.player.z - group.position.z);
    },
  };

  return heli;
}
