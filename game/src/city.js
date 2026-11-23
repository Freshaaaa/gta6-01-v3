// Solmar Bay 3D — city: the golden-hour grid city, beach and ocean.
// Everything visual in the world lives here: the ground canvas (roads,
// lane dashes, crosswalks, sidewalks, park), the buildings in six facade
// colours with lit windows and rooftop kit, storefront awnings on the main
// street, lamps standing on the sidewalk (never on the road), real palm
// trees, the two-tone sand, the wide light-blue ocean, and the sunset sky
// (gradient shader + sun disc + halo + drifting clouds). All placement is
// driven by the seeded RNG, so a seed always builds the same city.
import * as THREE from 'three';

export const PITCH = 52;
export const ROAD_HALF = 7;
export const CITY_HALF = 260;
export const BEACH_Z = 308;

// Six facade colours: warm beige, light grey, warm brown, off-white,
// muted blue-grey and brick red-brown. No two neighbouring blocks share one.
const FACADES = [0xd8c8a8, 0xc8c8c4, 0xb0906a, 0xe8e4da, 0x9aa8b4, 0xa86a54];
const AWNING_COLORS = [0xc23b2e, 0x2e8a8a, 0x2e4a7a, 0xd8a03a];

// A canvas window texture: facade colour with a lit/dark window grid.
// Six variants are shared by every building, so windows cost no meshes.
function makeWindowTexture(facade, variant, rng) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#' + facade.toString(16).padStart(6, '0');
  g.fillRect(0, 0, 128, 256);
  // A subtle vertical shade so the facade is not one flat tone.
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.10)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  const cols = 3 + (variant % 3);
  const rows = 5 + (variant % 4);
  const ww = 128 / cols;
  const hh = 256 / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const lit = rng() < 0.55;
      g.fillStyle = lit ? '#ffd27a' : '#23232e';
      const x = col * ww + ww * 0.2;
      const y = r * hh + hh * 0.22;
      g.fillRect(x, y, ww * 0.6, hh * 0.56);
      if (lit) {
        g.fillStyle = 'rgba(255,210,122,0.35)';
        g.fillRect(x - 2, y - 2, ww * 0.6 + 4, hh * 0.56 + 4);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// The ground canvas: one 2048 texture for the whole city floor. Roads are
// asphalt bands, sidewalks are lighter concrete, the centre line is dashed,
// intersections get zebra crosswalks, and one block is a green park.
function makeGroundTexture(rng) {
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const W = 640; // world units across (-320..320)
  const px = (x) => ((x + 320) / W) * S;
  const pw = (w) => (w / W) * S;
  // Base: pavement.
  g.fillStyle = '#a89e8c';
  g.fillRect(0, 0, S, S);
  // Sidewalk ribbons along every street (lighter concrete).
  g.fillStyle = '#c8c0b0';
  for (let s = -260; s <= 260; s += PITCH) {
    g.fillRect(px(-320), px(s - 10), S, pw(20));
    g.fillRect(px(s - 10), px(-320), pw(20), S);
  }
  // Asphalt road bands.
  g.fillStyle = '#9a938a';
  for (let s = -260; s <= 260; s += PITCH) {
    g.fillRect(px(-320), px(s - ROAD_HALF), S, pw(ROAD_HALF * 2));
    g.fillRect(px(s - ROAD_HALF), px(-320), pw(ROAD_HALF * 2), S);
  }
  // Centre dashes (pale yellow) and edge lines (pale white).
  g.fillStyle = '#e8d878';
  for (let s = -260; s <= 260; s += PITCH) {
    for (let d = -300; d < 300; d += 12) {
      g.fillRect(px(d), px(s - 0.35), pw(6), pw(0.7));
      g.fillRect(px(s - 0.35), px(d), pw(0.7), pw(6));
    }
  }
  g.fillStyle = 'rgba(240,240,235,0.85)';
  for (let s = -260; s <= 260; s += PITCH) {
    g.fillRect(px(-320), px(s - ROAD_HALF + 0.6), S, pw(0.5));
    g.fillRect(px(-320), px(s + ROAD_HALF - 1.1), S, pw(0.5));
    g.fillRect(px(s - ROAD_HALF + 0.6), px(-320), pw(0.5), S);
    g.fillRect(px(s + ROAD_HALF - 1.1), px(-320), pw(0.5), S);
  }
  // Zebra crosswalks at every intersection, on all four approaches.
  g.fillStyle = 'rgba(245,245,240,0.9)';
  for (let sx = -260; sx <= 260; sx += PITCH) {
    for (let sz = -260; sz <= 260; sz += PITCH) {
      for (let i = -3; i <= 3; i++) {
        // North and south approaches (bars run east-west).
        g.fillRect(px(sx + i * 1.8 - 0.7), px(sz - ROAD_HALF - 2.4), pw(1.4), pw(2.0));
        g.fillRect(px(sx + i * 1.8 - 0.7), px(sz + ROAD_HALF + 0.4), pw(1.4), pw(2.0));
        // West and east approaches (bars run north-south).
        g.fillRect(px(sx - ROAD_HALF - 2.4), px(sz + i * 1.8 - 0.7), pw(2.0), pw(1.4));
        g.fillRect(px(sx + ROAD_HALF + 0.4), px(sz + i * 1.8 - 0.7), pw(2.0), pw(1.4));
      }
    }
  }
  // The park: one green block with darker tree blobs (x 52..84, z 52..84).
  g.fillStyle = '#5a8a4a';
  g.fillRect(px(56), px(56), pw(40), pw(40));
  g.fillStyle = '#4a7a3e';
  for (let i = 0; i < 9; i++) {
    const tx = 60 + rng() * 32;
    const tz = 60 + rng() * 32;
    g.beginPath();
    g.arc(px(tx), px(tz), pw(3 + rng() * 3), 0, Math.PI * 2);
    g.fill();
  }
  // A few lawn strips along the main street sidewalks (green contrast).
  g.fillStyle = '#6a9a52';
  for (let z = -200; z <= 200; z += 52) {
    g.fillRect(px(10.5), px(z + 4), pw(2.5), pw(18));
    g.fillRect(px(-13), px(z + 4), pw(2.5), pw(18));
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Sand gradient: darker tan at the city edge, pale near the water.
function makeSandTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#cbb98e');
  grad.addColorStop(0.55, '#d8c898');
  grad.addColorStop(1, '#efe0b8');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// The sunset sky: a big inverted sphere with a three-stop gradient
// (orange horizon, magenta mid, dusky blue top) in a tiny shader.
function makeSky(G) {
  const geo = new THREE.SphereGeometry(850, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {},
    vertexShader: [
      'varying vec3 vDir;',
      'void main() {',
      '  vDir = normalize(position);',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}',
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vDir;',
      'void main() {',
      '  float h = clamp(vDir.y, -0.05, 1.0);',
      '  vec3 horizon = vec3(1.00, 0.58, 0.28);',
      '  vec3 mid = vec3(0.85, 0.42, 0.54);',
      '  vec3 top = vec3(0.29, 0.35, 0.54);',
      '  vec3 col = mix(horizon, mid, smoothstep(0.02, 0.28, h));',
      '  col = mix(col, top, smoothstep(0.25, 0.62, h));',
      '  col = mix(vec3(0.55, 0.32, 0.28), col, smoothstep(-0.05, 0.02, h));',
      '  gl_FragColor = vec4(col, 1.0);',
      '}',
    ].join('\n'),
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.position.set(0, 0, 0);
  G.scene.add(sky);
  return sky;
}

export function createCity(G) {
  const rng = G.rng;
  const city = { buildings: 0, clouds: [], update: null };

  // --- Ground: city floor, sand, ocean, foam ---
  const groundTex = makeGroundTexture(rng);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(640, 640),
    new THREE.MeshLambertMaterial({ map: groundTex })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  ground.receiveShadow = !G.lowfx;
  G.scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(640, BEACH_Z - CITY_HALF),
    new THREE.MeshLambertMaterial({ map: makeSandTexture() })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, CITY_HALF + (BEACH_Z - CITY_HALF) / 2);
  sand.receiveShadow = !G.lowfx;
  G.scene.add(sand);

  // Wide, light-blue ocean with a horizon far past the beach.
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 420),
    new THREE.MeshLambertMaterial({ color: 0x4a90c8, emissive: 0x1a3a5a })
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, 0.04, BEACH_Z + 210);
  G.scene.add(ocean);

  // White foam line where the waves meet the sand.
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(640, 2.2),
    new THREE.MeshBasicMaterial({ color: 0xf4f8ff })
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, 0.08, BEACH_Z - 0.5);
  G.scene.add(foam);

  // --- Sky, sun, halo, clouds ---
  makeSky(G);
  // Sun disc low over the ocean (south, slightly west), so the cover shot
  // — which looks south down the main street — catches it at the horizon.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false })
  );
  sunDisc.position.set(-90, 42, 780);
  sunDisc.lookAt(0, 20, 0);
  G.scene.add(sunDisc);
  // Soft glow halo around the sun (additive sprite, cheap bloom).
  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = 128;
  haloCanvas.height = 128;
  const hg = haloCanvas.getContext('2d');
  const hgrad = hg.createRadialGradient(64, 64, 4, 64, 64, 64);
  hgrad.addColorStop(0, 'rgba(255,230,160,0.85)');
  hgrad.addColorStop(0.4, 'rgba(255,180,110,0.35)');
  hgrad.addColorStop(1, 'rgba(255,160,90,0)');
  hg.fillStyle = hgrad;
  hg.fillRect(0, 0, 128, 128);
  const haloTex = new THREE.CanvasTexture(haloCanvas);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTex, transparent: true, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending,
  }));
  halo.scale.set(190, 190, 1);
  halo.position.copy(sunDisc.position);
  G.scene.add(halo);

  // 5 soft clouds: flattened white-pink puffs, drifting slowly east.
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xf6d8de, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 5; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 2);
    for (let p = 0; p < puffs; p++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(7 + rng() * 7, 10, 8), cloudMat);
      s.position.set((p - puffs / 2) * 10 + rng() * 4, rng() * 2, rng() * 5);
      s.scale.y = 0.42;
      cloud.add(s);
    }
    cloud.position.set(-260 + rng() * 520, 62 + rng() * 42, -260 + rng() * 420);
    cloud.userData.speed = 0.5 + rng() * 0.8;
    G.scene.add(cloud);
    city.clouds.push(cloud);
  }

  // --- Buildings ---
  const facadeMats = FACADES.map((col, i) => {
    const tex = makeWindowTexture(col, i, rng);
    return new THREE.MeshLambertMaterial({ map: tex, emissive: 0x222222, emissiveMap: tex, emissiveIntensity: 0.35 });
  });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6a6258 });
  const tankMat = new THREE.MeshLambertMaterial({ color: 0x8a8a86 });
  const antennaMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3e });
  const awningMats = AWNING_COLORS.map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const signMat = new THREE.MeshLambertMaterial({ color: 0x222226, emissive: 0xffc860, emissiveIntensity: 0.9 });

  // Each block (between streets) holds 1–4 buildings around a small court.
  // The park block (x 56..96, z 56..96) and the safehouse block stay clear.
  let buildingCount = 0;
  for (let bx = -260; bx < 260; bx += PITCH) {
    for (let bz = -260; bz < 260; bz += PITCH) {
      // Park block and safehouse block: no buildings.
      if (bx === 52 && bz === 52) continue;
      if (bx === 0 && bz === 0) continue;
      const n = 1 + Math.floor(rng() * 4);
      for (let i = 0; i < n; i++) {
        const w = 13 + rng() * 9;
        const d = 13 + rng() * 9;
        const cx = bx + 12 + rng() * (PITCH - 24 - w + 12);
        const cz = bz + 12 + rng() * (PITCH - 24 - d + 12);
        // Height: 2-storey, mid or tall; taller toward downtown.
        const downtown = 1 - (Math.abs(cx) + Math.abs(cz)) / 520;
        const roll = rng();
        const h = roll < 0.45 ? 8 + rng() * 3 : roll < 0.8 ? 13 + rng() * 7 : 22 + rng() * 10 + downtown * 8;
        const mat = facadeMats[Math.floor(rng() * facadeMats.length)];
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(cx, h / 2, cz);
        b.castShadow = !G.lowfx;
        b.receiveShadow = !G.lowfx;
        G.scene.add(b);
        buildingCount++;
        // Rooftop kit on some buildings: AC box, water tank, antenna.
        const kit = rng();
        if (kit < 0.3) {
          const ac = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 1.8), roofMat);
          ac.position.set(cx - w * 0.2, h + 0.6, cz + d * 0.15);
          G.scene.add(ac);
        } else if (kit < 0.5) {
          const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.6, 10), tankMat);
          tank.position.set(cx + w * 0.2, h + 1.3, cz - d * 0.2);
          G.scene.add(tank);
        } else if (kit < 0.62) {
          const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5, 6), antennaMat);
          ant.position.set(cx, h + 2.5, cz);
          G.scene.add(ant);
        }
        // Storefronts on the main street (x = 0): a coloured awning plus a
        // lit sign band on the ground floor, facing the street.
        const onMain = Math.abs(cx) < 14 && Math.abs(cz) < 130;
        if (onMain && rng() < 0.75) {
          const aw = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.8, 0.5, 3.2),
            awningMats[Math.floor(rng() * awningMats.length)]
          );
          const facing = cx > 0 ? -1 : 1;
          aw.position.set(cx + facing * (w / 2 + 1.2), 3.4, cz);
          aw.rotation.z = facing * 0.18;
          G.scene.add(aw);
          const sign = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, w * 0.7), signMat);
          sign.position.set(cx + facing * (w / 2 + 0.4), 5.2, cz);
          G.scene.add(sign);
        }
      }
    }
  }
  city.buildings = buildingCount;

  // --- Street lamps: on the SIDEWALK (x = street + ROAD_HALF + 1), never
  // on the road centre line, so the Comet's path is always clear. ---
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffc860, emissiveIntensity: 1.4 });
  const lampPositions = [];
  for (let s = -208; s <= 208; s += PITCH) {
    for (let t = -156; t <= 156; t += 104) {
      lampPositions.push([s + ROAD_HALF + 1, t]);
      lampPositions.push([t, s + ROAD_HALF + 1]);
    }
  }
  for (const [lx, lz] of lampPositions) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6.4, 6), poleMat);
    pole.position.set(lx, 3.2, lz);
    G.scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 1.4), lampMat);
    head.position.set(lx - 0.5, 6.5, lz);
    G.scene.add(head);
  }
  city.lampCount = lampPositions.length;

  // --- Palm trees: a curved trunk (two stacked segments) and five
  // drooping fronds. Along the beach, the Marina sidewalks and the park. ---
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3a7a3a });
  function makePalm(x, z, scale) {
    const palm = new THREE.Group();
    const lean = (rng() - 0.5) * 0.35;
    const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 4.2, 7), trunkMat);
    seg1.position.set(0, 2.1, 0);
    seg1.rotation.z = lean * 0.5;
    palm.add(seg1);
    const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 3.6, 7), trunkMat);
    seg2.position.set(lean * 1.6, 5.4, 0);
    seg2.rotation.z = lean;
    palm.add(seg2);
    for (let f = 0; f < 5; f++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.4, 5), frondMat);
      const ang = (f / 5) * Math.PI * 2 + rng() * 0.5;
      frond.position.set(Math.cos(ang) * 1.1, 7.0, Math.sin(ang) * 1.1);
      frond.rotation.z = Math.cos(ang) * 1.9;
      frond.rotation.x = -Math.sin(ang) * 1.9;
      frond.scale.set(1, 1, 0.28);
      palm.add(frond);
    }
    palm.position.set(x, 0, z);
    palm.scale.setScalar(scale);
    G.scene.add(palm);
    return palm;
  }
  // Beach row (the cover's southern edge).
  for (let x = -240; x <= 240; x += 40) {
    makePalm(x + (rng() - 0.5) * 8, 266 + rng() * 10, 0.9 + rng() * 0.4);
  }
  // Marina sidewalks (z > 150).
  for (let x = -208; x <= 208; x += 52) {
    if (rng() < 0.7) makePalm(x + 9, 168 + (rng() - 0.5) * 6, 0.85 + rng() * 0.3);
  }
  // Park trees.
  for (let i = 0; i < 5; i++) {
    makePalm(60 + rng() * 32, 60 + rng() * 32, 0.9 + rng() * 0.35);
  }
  // A few on the main street for the cover's foreground.
  makePalm(11, 30, 1.0);
  makePalm(-11, 84, 1.0);

  // Clouds drift east, slowly.
  city.update = function (dt) {
    for (const cloud of city.clouds) {
      cloud.position.x += cloud.userData.speed * dt;
      if (cloud.position.x > 420) cloud.position.x = -420;
    }
  };

  return city;
}
