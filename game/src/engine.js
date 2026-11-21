// Solmar Bay 3D — engine: renderer, sky, lights, fixed-step loop.
// Written fresh for the gta6-01 3D rebuild (branch v12-3d).
import * as THREE from 'three';

// Seeded RNG so the city is identical every load (?seed=N to vary it).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Engine {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xe8906a, 120, 620);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1500);
    this.clock = new THREE.Clock();
    this.acc = 0;
    this.step = 1 / 60;
    this.time = 17.5; // hours — golden hour by default
    this.onResize();
    window.addEventListener('resize', () => this.onResize());

    // Golden-hour sun: low, warm, long shadows. Shadow camera follows the player.
    this.sun = new THREE.DirectionalLight(0xffb36b, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90;
    sc.near = 1; sc.far = 500;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffc9a0, 0x3a2b4a, 0.9);
    this.scene.add(this.hemi);
    this.amb = new THREE.AmbientLight(0x604060, 0.35);
    this.scene.add(this.amb);

    this.buildSky();
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Gradient dusk dome + sun disc + a few flat clouds. This IS the look.
  buildSky() {
    const geo = new THREE.SphereGeometry(900, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x6b3a8c) }, mid: { value: new THREE.Color(0xff7e5f) }, bot: { value: new THREE.Color(0xfeb47b) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
        void main(){ float h = normalize(vP).y; vec3 c = h > 0.18 ? mix(mid, top, smoothstep(0.18, 0.65, h)) : mix(bot, mid, smoothstep(-0.05, 0.18, h));
        gl_FragColor = vec4(c, 1.0); }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.scene.add(this.sky);
    // Sun disc, low on the west horizon.
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false });
    this.sunDisc = new THREE.Mesh(new THREE.CircleGeometry(34, 32), sunMat);
    this.sunDisc.position.set(-620, 150, -420);
    this.sunDisc.lookAt(0, 60, 0);
    this.scene.add(this.sunDisc);
    // Clouds: flat white boxes, slowly drifting.
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xfff2e0, transparent: true, opacity: 0.75, fog: false });
    this.clouds = [];
    const rng = mulberry32(99);
    for (let i = 0; i < 12; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(60 + rng() * 90, 6, 22 + rng() * 18), cloudMat);
      c.position.set((rng() - 0.5) * 1400, 180 + rng() * 120, (rng() - 0.5) * 1400);
      this.clouds.push(c); this.scene.add(c);
    }
  }

  // Time of day: 0-24. Moves the sun, warms/cools the light, shifts fog/sky.
  setTime(hours) {
    this.time = ((hours % 24) + 24) % 24;
    const t = this.time;
    const day = t > 6.5 && t < 19.5;
    const golden = (t >= 16.5 && t < 19.5) || (t >= 6.5 && t < 8);
    const night = !day;
    // Sun angle: rises east (06:00), sets west (18:00).
    const ang = ((t - 6) / 12) * Math.PI;
    const el = Math.sin(ang);
    this.sun.position.set(Math.cos(ang) * -500, Math.max(el, 0.04) * 320 + 20, -260);
    this.sun.target.position.set(0, 0, 0);
    if (night) {
      this.sun.intensity = 0.25; this.sun.color.setHex(0x8fa8ff);
      this.hemi.intensity = 0.35; this.hemi.color.setHex(0x2a3560); this.hemi.groundColor.setHex(0x1a1420);
      this.amb.intensity = 0.5;
      this.scene.fog.color.setHex(0x1c1a33);
      this.sky.material.uniforms.top.value.setHex(0x0a0a28);
      this.sky.material.uniforms.mid.value.setHex(0x2c1e4e);
      this.sky.material.uniforms.bot.value.setHex(0x4a2a55);
      this.sunDisc.material.color.setHex(0xdde4ff);
      this.sunDisc.position.set(420, 320, -500);
    } else if (golden) {
      this.sun.intensity = 2.6; this.sun.color.setHex(0xffb36b);
      this.hemi.intensity = 0.9; this.hemi.color.setHex(0xffc9a0); this.hemi.groundColor.setHex(0x3a2b4a);
      this.amb.intensity = 0.35;
      this.scene.fog.color.setHex(0xe8906a);
      this.sky.material.uniforms.top.value.setHex(0x6b3a8c);
      this.sky.material.uniforms.mid.value.setHex(0xff7e5f);
      this.sky.material.uniforms.bot.value.setHex(0xfeb47b);
      this.sunDisc.material.color.setHex(0xffe9a8);
      this.sunDisc.position.set(-620, 150, -420);
    } else {
      this.sun.intensity = 2.2; this.sun.color.setHex(0xfff2d0);
      this.hemi.intensity = 1.0; this.hemi.color.setHex(0xbfd8ff); this.hemi.groundColor.setHex(0x5a6a55);
      this.amb.intensity = 0.4;
      this.scene.fog.color.setHex(0x9fc4e0);
      this.sky.material.uniforms.top.value.setHex(0x3a7bd5);
      this.sky.material.uniforms.mid.value.setHex(0x7ec8e3);
      this.sky.material.uniforms.bot.value.setHex(0xcfeef5);
      this.sunDisc.material.color.setHex(0xfff6c0);
      this.sunDisc.position.set(-300, 420, -500);
    }
    this.isNight = night;
    return night;
  }

  // Shadow camera follows a focus point so shadows stay crisp near the player.
  followShadows(x, z) {
    this.sun.position.x += x - this.sun.target.position.x;
    this.sun.position.z += z - this.sun.target.position.z;
    this.sun.target.position.set(x, 0, z);
    this.sun.target.updateMatrixWorld();
  }

  // Fixed-step loop: update(dt) runs at 60 Hz, render every frame.
  start(update, render) {
    const tick = () => {
      requestAnimationFrame(tick);
      const dt = Math.min(this.clock.getDelta(), 0.1);
      this.acc += dt;
      let n = 0;
      while (this.acc >= this.step && n < 5) { update(this.step); this.acc -= this.step; n++; }
      render(dt);
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }
}
