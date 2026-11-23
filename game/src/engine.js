// Solmar Bay 3D — engine: renderer, scene, camera, lights and the loop.
// The loop runs a fixed timestep (1/60 s steps, dt capped at 0.2, at most
// 12 substeps a frame) so the simulation advances at a steady rate even
// under SwiftShader, where a frame can take half a second. The chase
// camera sits behind the player's car (chaseDist 5.5, chaseLateral 1.0,
// nearly centred so the Comet fills the frame). __shotReady is raised
// after the scene has rendered enough frames for a screenshot.
import * as THREE from 'three';

export function createEngine(G) {
  const canvas = document.getElementById('game-canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(G.lowfx ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = G.exposure;
  renderer.shadowMap.enabled = !G.lowfx;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe8a06a, 260, 820);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 6, -8);

  // Golden-hour sun: warm, low in the south-west, matching the sun disc.
  const sun = new THREE.DirectionalLight(0xffd9a0, G.sunIntensity);
  sun.position.set(-90, 90, 320);
  sun.target.position.set(0, 0, 40);
  scene.add(sun);
  scene.add(sun.target);
  if (!G.lowfx) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -90;
    sun.shadow.camera.right = 90;
    sun.shadow.camera.top = 90;
    sun.shadow.camera.bottom = -90;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 700;
    sun.shadow.bias = -0.0006;
  }
  // Warm sky bounce + a cool ground bounce so shadows never go black.
  const hemi = new THREE.HemisphereLight(0xffd0a0, 0x5a4a3a, G.hemiIntensity);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0x604a3a, 0.5);
  scene.add(amb);

  G.scene = scene;
  G.camera = camera;
  G.renderer = renderer;
  G.sunLight = sun;

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Chase camera: behind the car, nearly centred (chaseLateral 1.0), so the
  // Comet is large in frame. On foot the camera follows Dante the same way.
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  function updateCamera(dt) {
    const focus = G.player.inCar && G.player.car ? G.player.car : null;
    let fx, fz, heading;
    if (focus) {
      fx = focus.x;
      fz = focus.z;
      heading = focus.heading;
    } else {
      fx = G.player.x;
      fz = G.player.z;
      heading = G.player.heading;
    }
    const lateral = G.chaseLateral;
    const dist = G.chaseDist;
    const backX = -Math.sin(heading);
    const backZ = -Math.cos(heading);
    const sideX = Math.cos(heading);
    const sideZ = -Math.sin(heading);
    const tx = fx + backX * dist + sideX * lateral * 0.9;
    const tz = fz + backZ * dist + sideZ * lateral * 0.9;
    const ty = focus ? 3.4 : 4.2;
    // Smooth-follow so the camera never snaps.
    const k = 1 - Math.exp(-dt * 7);
    camPos.lerp(new THREE.Vector3(tx, ty, tz), k);
    camera.position.copy(camPos);
    camLook.set(fx + Math.sin(heading) * 6, focus ? 1.4 : 1.6, fz + Math.cos(heading) * 6);
    camera.lookAt(camLook);
  }

  // The fixed-timestep loop. step() is the game's own update (wired by
  // main.js). A frame never advances the sim more than 12 steps, so a slow
  // renderer cannot spiral, and the sim rate stays near 0.5x real time.
  let last = performance.now();
  let acc = 0;
  let frames = 0;
  const STEP = 1 / 60;
  let running = true;

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.5) dt = 0.5;
    if (G.frozen) {
      renderer.render(scene, camera);
      return;
    }
    acc += Math.min(dt, 0.2);
    let steps = 0;
    while (acc >= STEP && steps < 12) {
      if (G.step) G.step(STEP);
      acc -= STEP;
      steps++;
    }
    if (steps === 12) acc = 0;
    updateCamera(dt);
    renderer.render(scene, camera);
    frames++;
    // The shot harness waits on this: enough rendered frames that the
    // screenshot is a settled frame, not a half-built one.
    if (!window.__shotReady && frames >= 20) {
      window.__shotReady = true;
    }
  }

  return {
    renderer,
    scene,
    camera,
    start() {
      camPos.copy(camera.position);
      requestAnimationFrame(frame);
    },
    stop() {
      running = false;
    },
    frames() {
      return frames;
    },
  };
}
