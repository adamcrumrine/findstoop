// Where the route runs. A scene owns the sky gradient, the fog, the lighting
// and whatever sits on the horizon; the street itself is identical in all of
// them, so the paper route plays the same wherever you take it.
//
// Backdrops live in the sky rig, which follows the player along z, and sit
// beyond the play area at 30-150 units out. At that distance the exponential
// fog turns them into hazy silhouettes, which is exactly the register a
// cartridge-era game drew its horizons in.

import * as THREE from 'three';
import { bx, cyl, plane, GEO } from './models.js';
import { mulberry32, range, pick } from './util.js';

const lam = (o) => new THREE.MeshLambertMaterial(Object.assign({ flatShading: true }, o));
const mat = (hex, extra) => lam(Object.assign({ color: new THREE.Color(hex) }, extra || {}));

// --------------------------------------------------------------- backdrops

// Scatter a builder around the player in a band either side of the street.
function scatter(g, rng, count, near, far, build) {
  for (let i = 0; i < count; i++) {
    const side = rng() > 0.5 ? 1 : -1;
    const x = side * range(rng, near, far);
    const z = range(rng, -210, 210);
    const o = build(rng, i);
    if (!o) continue;
    o.position.set(x, o.position.y, z);
    g.add(o);
  }
}

function ridge(g, rng, count, radiusA, radiusB, sizeA, sizeB, m, capMat) {
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const r = range(rng, radiusA, radiusB);
    const s = range(rng, sizeA, sizeB);
    const c = new THREE.Mesh(GEO.CONE, m);
    c.scale.set(s * 1.7, s * (capMat ? 1.5 : 0.55), s * 1.7);
    c.position.set(Math.cos(a) * r, -2, Math.sin(a) * r);
    g.add(c);
    if (capMat) {
      const cap = new THREE.Mesh(GEO.CONE, capMat);
      cap.scale.set(s * 0.62, s * 0.55, s * 0.62);
      cap.position.set(c.position.x, -2 + s * 1.5 * 0.5 - s * 0.09, c.position.z);
      g.add(cap);
    }
  }
}

function country(M, T) {
  const g = new THREE.Group();
  const rng = mulberry32(11);
  const grass = mat('#7c9a5e');
  const barn = mat('#9c3b32');
  const roof = mat('#4a4f5c');
  const silo = mat('#c8c4b6');
  ridge(g, rng, 26, 60, 140, 30, 62, mat('#8fa07e'));
  // Farmsteads: a gable barn with a silo beside it.
  scatter(g, rng, 9, 28, 60, (r) => {
    const f = new THREE.Group();
    const w = range(r, 10, 15);
    const h = range(r, 8, 12);
    f.add(bx(barn, w, h, w * 1.5, 0, h / 2, 0));
    const rf = new THREE.Mesh(GEO.GABLE, roof);
    rf.scale.set(w + 0.6, h * 0.5, w * 1.5 + 0.6);
    rf.position.set(-(w + 0.6) / 2 + w / 2, h, 0);
    f.add(rf);
    if (r() > 0.4) {
      f.add(cyl(silo, 1.7, h * 1.5, w * 0.8, h * 0.75, w * 0.8));
      const dome = new THREE.Mesh(GEO.SPHERE, roof);
      dome.scale.setScalar(3.4);
      dome.position.set(w * 0.8, h * 1.5, w * 0.8);
      f.add(dome);
    }
    return f;
  });
  // Hedgerows and haystacks in the fields.
  scatter(g, rng, 26, 26, 90, (r) => bx(grass, range(r, 8, 22), 1.2, 0.9, 0, 0.6, 0));
  scatter(g, rng, 18, 26, 70, (r) => {
    const s = range(r, 1.6, 2.6);
    const m = new THREE.Mesh(GEO.CYL, mat('#c9ad63'));
    m.scale.set(s * 2, s, s * 2);
    m.position.y = s / 2;
    m.rotation.z = Math.PI / 2;
    return m;
  });
  return g;
}

function mountain(M, T) {
  const g = new THREE.Group();
  const rng = mulberry32(23);
  const rock = mat('#6e7a8c');
  const snow = mat('#eef2f6');
  const pine = mat('#33553f');
  ridge(g, rng, 18, 78, 150, 52, 92, rock, snow);
  ridge(g, rng, 22, 48, 96, 20, 38, mat('#5d6b7c'));
  // Pine belts running up the lower slopes.
  scatter(g, rng, 60, 26, 95, (r) => {
    const h = range(r, 5, 11);
    const t = new THREE.Group();
    t.add(cyl(mat('#4a3b2e'), 0.3, h * 0.3, 0, h * 0.15, 0));
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(GEO.CONE, pine);
      const s = (h * 0.55) * (1 - i * 0.22);
      c.scale.set(s, h * 0.5, s);
      c.position.y = h * 0.3 + i * h * 0.22;
      t.add(c);
    }
    return t;
  });
  return g;
}

function lake(M, T) {
  const g = new THREE.Group();
  const rng = mulberry32(37);
  const water = plane(mat('#3f6f96', { flatShading: false }), 262, 470, -159, -0.35, 0);
  water.rotation.x = -Math.PI / 2;
  g.add(water);
  // Far shore beyond the water, and hills on the dry side.
  ridge(g, rng, 16, 96, 168, 40, 68, mat('#6b8272'));
  for (let i = 0; i < 16; i++) {
    const z = range(rng, -210, 210);
    g.add(bx(mat('#5d7a63'), range(rng, 14, 30), range(rng, 2, 5), 8, -range(rng, 200, 250), 1.5, z));
  }
  // Jetties and a couple of moored boats on the near shore.
  scatter(g, rng, 5, 32, 46, (r) => {
    const f = new THREE.Group();
    f.add(bx(mat('#8a7355'), 3, 0.4, 14, 0, 0.6, 0));
    for (let i = -2; i <= 2; i++) f.add(bx(mat('#6d5a42'), 0.4, 1.6, 0.4, 0, 0, i * 3));
    f.add(bx(mat('#e8e4d8'), 1.8, 0.9, 4.4, -3.4, 0.7, 3));
    return f;
  });
  scatter(g, rng, 22, 23, 29, (r) => bx(mat('#6f8a52'), range(r, 3, 9), 1.5, 1.2, 0, 0.7, 0));
  return g;
}

function ocean(M, T) {
  const g = new THREE.Group();
  const rng = mulberry32(53);
  for (const s of [-1, 1]) {
    const water = plane(mat('#2f6480', { flatShading: false }), 300, 530, s * 178, -0.35, 0);
    water.rotation.x = -Math.PI / 2;
    g.add(water);
  }
  // Dunes hemming the road, then a pier and a distant headland.
  scatter(g, rng, 34, 23, 31, (r) => {
    const s = range(r, 5, 12);
    const m = new THREE.Mesh(GEO.CONE, mat('#d3c49a'));
    m.scale.set(s * 1.8, s * 0.4, s * 1.8);
    m.position.y = -0.5;
    return m;
  });
  scatter(g, rng, 26, 23, 30, (r) => bx(mat('#9aab72'), range(r, 2, 5), 1.1, 1.1, 0, 0.55, 0));
  const pier = new THREE.Group();
  pier.position.set(52, 0, -70);
  pier.add(bx(mat('#8a7355'), 46, 0.6, 5, 0, 2.2, 0));
  for (let i = -7; i <= 7; i++) pier.add(bx(mat('#6d5a42'), 0.5, 4.4, 0.5, i * 3, 0, 0));
  pier.add(bx(mat('#c8352b'), 4, 3.4, 4, 22, 3.6, 0));
  g.add(pier);
  ridge(g, rng, 9, 110, 180, 40, 62, mat('#7a8a8e'));
  return g;
}

function towers(g, rng, T, opts) {
  const glass = lam({ map: T.cityWindows.clone(), flatShading: false });
  const shades = ['#5a6070', '#6b6f7c', '#4d5462', '#7a7466', '#636a78'];
  const pool = shades.map((c) => mat(c));
  for (let i = 0; i < opts.count; i++) {
    const side = rng() > 0.5 ? 1 : -1;
    const x = side * range(rng, opts.near, opts.far);
    const z = range(rng, -220, 220);
    const w = range(rng, opts.wMin, opts.wMax);
    const h = range(rng, opts.hMin, opts.hMax);
    const b = new THREE.Group();
    b.position.set(x, 0, z);
    b.add(bx(pick(rng, pool), w, h, w * range(rng, 0.7, 1.3), 0, h / 2, 0));
    // A glazed band so the mass is not a flat silhouette.
    const gl = bx(glass, w + 0.1, h * 0.72, w * 0.9, 0, h * 0.5, 0);
    b.add(gl);
    if (opts.watertowers && rng() > 0.62) {
      b.add(cyl(mat('#6d5a42'), 1.6, 3.2, 0, h + 2.4, 0));
      for (const s of [-1, 1]) b.add(bx(mat('#5a4a38'), 0.3, 2.2, 0.3, s * 1.2, h + 0.9, 0));
    }
    if (opts.spires && rng() > 0.78) {
      b.add(cyl(mat('#8f96a4'), 0.4, h * 0.28, 0, h + h * 0.14, 0));
    }
    g.add(b);
  }
}

function city(M, T) {
  const g = new THREE.Group();
  const rng = mulberry32(71);
  towers(g, rng, T, { count: 70, near: 25, far: 92, wMin: 8, wMax: 16, hMin: 22, hMax: 58 });
  return g;
}

function nyc(M, T) {
  const g = new THREE.Group();
  const rng = mulberry32(89);
  towers(g, rng, T, {
    count: 78, near: 26, far: 130, wMin: 8, wMax: 18, hMin: 30, hMax: 128,
    watertowers: true, spires: true,
  });
  // A suspension bridge closing off one end of the view.
  const bridge = new THREE.Group();
  bridge.position.set(-96, 0, -150);
  const steel = mat('#8a5a4a');
  for (const bx0 of [-26, 26]) {
    bridge.add(bx(steel, 3, 66, 3, 0, 33, bx0));
    bridge.add(bx(steel, 4.4, 3, 8, 0, 44, bx0));
    bridge.add(bx(steel, 4.4, 3, 8, 0, 58, bx0));
  }
  bridge.add(bx(steel, 4, 1.6, 74, 0, 20, 0));
  // Main cables faked with two shallow tilted spans.
  for (const dir of [-1, 1]) {
    const c = bx(steel, 0.6, 0.6, 30, 0, 46, dir * 14);
    c.rotation.x = dir * 0.42;
    bridge.add(c);
  }
  for (let i = -8; i <= 8; i++) {
    bridge.add(bx(steel, 0.4, 12 - Math.abs(i) * 1.1, 0.4, 0, 26 + (12 - Math.abs(i) * 1.1) / 2, i * 3));
  }
  g.add(bridge);
  return g;
}

function paris(M, T) {
  const g = new THREE.Group();
  const rng = mulberry32(101);
  const stone = ['#d8cdb6', '#cfc4ad', '#e0d6c0', '#c8bda6'].map((c) => mat(c));
  const zinc = mat('#5b6068');
  const glass = lam({ map: T.cityWindows.clone(), flatShading: false });
  // Haussmann blocks: even cornice line, dark mansard roof on top.
  for (let i = 0; i < 58; i++) {
    const side = rng() > 0.5 ? 1 : -1;
    const x = side * range(rng, 24, 74);
    const z = range(rng, -190, 190);
    const w = range(rng, 13, 24);
    const h = range(rng, 26, 34);
    const b = new THREE.Group();
    b.position.set(x, 0, z);
    b.add(bx(pick(rng, stone), w, h, w * range(rng, 0.8, 1.4), 0, h / 2, 0));
    b.add(bx(glass, w + 0.08, h * 0.62, w * 0.86, 0, h * 0.46, 0));
    b.add(bx(mat('#e8e0cc'), w + 0.7, 0.6, w * 1.5 + 0.7, 0, h + 0.3, 0));
    const roof = new THREE.Mesh(GEO.CONE4, zinc);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(w * 1.35, h * 0.24, w * 1.7);
    roof.position.y = h + 0.6;
    b.add(roof);
    for (let c = 0; c < 3; c++) {
      b.add(cyl(mat('#b04a3a'), 0.3, 1.3, range(rng, -w / 3, w / 3), h + 1.6, range(rng, -w / 2, w / 2)));
    }
    g.add(b);
  }
  // The tower, off to one side and unmistakable in silhouette.
  const t = new THREE.Group();
  t.position.set(-92, 0, -128);
  const iron = mat('#7d6a52');
  const H = 112;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = bx(iron, 1.6, H * 0.42, 1.6, sx * 9, H * 0.2, sz * 9);
      leg.rotation.z = -sx * 0.30;
      leg.rotation.x = sz * 0.30;
      t.add(leg);
      const mid = bx(iron, 1.2, H * 0.3, 1.2, sx * 4.2, H * 0.55, sz * 4.2);
      mid.rotation.z = -sx * 0.12;
      mid.rotation.x = sz * 0.12;
      t.add(mid);
    }
  }
  t.add(bx(iron, 24, 1.6, 24, 0, H * 0.33, 0));      // first platform
  t.add(bx(iron, 13, 1.4, 13, 0, H * 0.62, 0));      // second platform
  t.add(bx(iron, 5.5, H * 0.2, 5.5, 0, H * 0.79, 0));
  t.add(bx(iron, 7, 1.2, 7, 0, H * 0.89, 0));        // summit
  t.add(cyl(iron, 0.5, H * 0.1, 0, H * 0.95, 0));
  // Arches under the first platform, the tower's real signature.
  for (const sz of [-1, 1]) {
    t.add(bx(iron, 20, 1.1, 1.1, 0, H * 0.24, sz * 9));
    t.add(bx(iron, 1.1, 1.1, 20, sz * 9, H * 0.24, 0));
  }
  g.add(t);
  return g;
}

// ------------------------------------------------------------------ scenes

export const SCENES = {
  country: {
    id: 'country', name: 'Open Country', short: 'Country',
    blurb: 'Barns, silos and hedgerows out past the last row of mailboxes.',
    fog: 0xc9bfb4, fogD: 0.0125, clear: 0xc9bfb4,
    grass: 0x6f9a5c, hemi: [0xc6d8ee, 0x6a7355, 1.35], sun: [0xffd39a, 2.0], amb: [0x5d6478, 0.5],
    stops: [[0, '#1d3563'], [0.22, '#48699b'], [0.38, '#8aa5c4'], [0.455, '#c2b3ac'],
      [0.492, '#f0a55c'], [0.505, '#ffcd92'], [0.55, '#f0b782'], [1, '#e0a877']],
    build: country,
  },
  mountain: {
    id: 'mountain', name: 'High Country', short: 'Mountains',
    blurb: 'Snow on the peaks and pine belts running down to the road.',
    fog: 0xb9c6d4, fogD: 0.0108, clear: 0xb9c6d4,
    grass: 0x5c8055, hemi: [0xd2e2f4, 0x5f6d5a, 1.45], sun: [0xffe6c4, 1.9], amb: [0x6a7c98, 0.55],
    stops: [[0, '#16305e'], [0.24, '#3f6aa4'], [0.4, '#83a8ce'], [0.47, '#c2d2e0'],
      [0.5, '#f2ddc0'], [0.56, '#d8dfe6'], [1, '#c4cfda']],
    build: mountain,
  },
  lake: {
    id: 'lake', name: 'Lakeside', short: 'Lake',
    blurb: 'Still water on one side, jetties and moored boats along the shore.',
    fog: 0xc3cfcd, fogD: 0.0118, clear: 0xc3cfcd,
    grass: 0x67925a, hemi: [0xcae0e8, 0x64775f, 1.4], sun: [0xffe0b0, 1.95], amb: [0x5f7480, 0.52],
    stops: [[0, '#1b3f60'], [0.24, '#427ba0'], [0.4, '#8fb8ca'], [0.47, '#cfd8cf'],
      [0.5, '#ffd9a2'], [0.56, '#e3d4bd'], [1, '#cfd6cd']],
    build: lake,
  },
  ocean: {
    id: 'ocean', name: 'Coast Road', short: 'Ocean',
    blurb: 'Dunes, a fishing pier and open sea on both sides of the street.',
    fog: 0xcbd8dc, fogD: 0.0132, clear: 0xcbd8dc,
    grass: 0x8a9c62, hemi: [0xd6ecf6, 0x7a7a5e, 1.5], sun: [0xffe8c0, 2.05], amb: [0x6f8894, 0.55],
    stops: [[0, '#1c4a6e'], [0.24, '#4a8bad'], [0.4, '#93c0d2'], [0.47, '#d6dcd6'],
      [0.5, '#ffdca8'], [0.56, '#e6dcc8'], [1, '#d2dcdc']],
    build: ocean,
  },
  city: {
    id: 'city', name: 'Inner Suburb', short: 'City',
    blurb: 'The blocks close in and the skyline starts a street or two over.',
    fog: 0xc0bcb8, fogD: 0.0142, clear: 0xc0bcb8,
    grass: 0x5d7a4f, hemi: [0xc0cadb, 0x6a6a62, 1.25], sun: [0xffcf96, 1.85], amb: [0x62687a, 0.55],
    stops: [[0, '#25355a'], [0.24, '#54688f'], [0.4, '#93a2b6'], [0.46, '#c8b8a8'],
      [0.5, '#f2a862'], [0.56, '#dfc0a2'], [1, '#cbb8a4']],
    build: city,
  },
  nyc: {
    id: 'nyc', name: 'Five Boroughs', short: 'NYC',
    blurb: 'Water towers, fire escapes and a bridge closing off the avenue.',
    fog: 0xb8b4b4, fogD: 0.0152, clear: 0xb8b4b4,
    grass: 0x577044, hemi: [0xb8c2d2, 0x66645c, 1.2], sun: [0xffc98c, 1.8], amb: [0x5e6274, 0.58],
    stops: [[0, '#2b2f52'], [0.24, '#5b5f88'], [0.4, '#9a9ab0'], [0.46, '#cbb2a0'],
      [0.5, '#f79c56'], [0.56, '#dcb598'], [1, '#c6ac9c']],
    build: nyc,
  },
  paris: {
    id: 'paris', name: 'Paris', short: 'Paris',
    blurb: 'Zinc mansards, cream stone and the tower off the end of the block.',
    fog: 0xcfc6bc, fogD: 0.0128, clear: 0xcfc6bc,
    grass: 0x6d8a56, hemi: [0xcdd6e4, 0x71705f, 1.3], sun: [0xffdcae, 1.95], amb: [0x6a6a80, 0.52],
    stops: [[0, '#2c3a63'], [0.24, '#5e739c'], [0.4, '#a0aec2'], [0.46, '#d2c0ae'],
      [0.5, '#f6c489'], [0.56, '#e2cbb2'], [1, '#d2c4b2']],
    build: paris,
  },
};

export const SCENE_ORDER = ['country', 'mountain', 'lake', 'ocean', 'city', 'nyc', 'paris'];
