// Low-poly model builders. Everything is assembled from a handful of shared
// primitive geometries so the whole street runs on a few dozen unique buffers,
// the way a cartridge-era game would have had to.

import * as THREE from 'three';
import { mulberry32, pick, range, clamp } from './util.js';

export const LAYOUT = {
  roadHalf: 4.5,
  walkInner: 4.5,
  walkOuter: 7.6,
  mailboxX: 8.4,
  porchX: 10.7,
  houseFrontX: 11.6,
  houseDepth: 7,
  houseWidth: 11,
  lawnOuter: 22,
  playMinX: -9.4,
  playMaxX: 9.4,
};

// ---------------------------------------------------------------- primitives

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const PLANE = new THREE.PlaneGeometry(1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const CYL_LOW = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
const CONE = new THREE.ConeGeometry(0.5, 1, 8);
// Four-sided cone, used rotated 45 degrees as a hip roof.
const CONE4 = new THREE.ConeGeometry(0.5, 1, 4);
const SPHERE = new THREE.SphereGeometry(0.5, 8, 6);
const ICO = new THREE.IcosahedronGeometry(0.5, 0);
const TORUS = new THREE.TorusGeometry(0.36, 0.07, 5, 12);
// A torus is built in the XY plane with its hole along Z, which points the
// axle straight at a chase camera. Bake a quarter turn into the geometry so a
// bike wheel's axle runs along X and it rolls along Z like a wheel should.
const WHEEL = new THREE.TorusGeometry(0.36, 0.07, 5, 12).rotateY(Math.PI / 2);

function gableGeometry() {
  // Ridge runs along local +x (front-to-back), so the street sees a triangle.
  const p = [];
  const v = {
    fl: [0, 0, -0.5], fr: [0, 0, 0.5], bl: [1, 0, -0.5], br: [1, 0, 0.5],
    ft: [0, 1, 0], bt: [1, 1, 0],
  };
  const tri = (a, b, c) => p.push(...a, ...b, ...c);
  // Left slope.
  tri(v.fl, v.bl, v.bt);
  tri(v.fl, v.bt, v.ft);
  // Right slope.
  tri(v.fr, v.ft, v.bt);
  tri(v.fr, v.bt, v.br);
  // Gable ends.
  tri(v.fl, v.ft, v.fr);
  tri(v.bl, v.br, v.bt);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

function wedgeGeometry() {
  // Ramp: rises along -z (the direction of travel).
  const p = [];
  const v = {
    a: [-0.5, 0, 0.5], b: [0.5, 0, 0.5], c: [-0.5, 0, -0.5], d: [0.5, 0, -0.5],
    e: [-0.5, 1, -0.5], f: [0.5, 1, -0.5],
  };
  const tri = (x, y, z) => p.push(...x, ...y, ...z);
  tri(v.a, v.f, v.e); tri(v.a, v.b, v.f);   // slope
  tri(v.c, v.e, v.f); tri(v.c, v.f, v.d);   // back
  tri(v.a, v.e, v.c); tri(v.b, v.d, v.f);   // sides
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

const GABLE = gableGeometry();
const WEDGE = wedgeGeometry();

export const GEO = { UNIT_BOX, PLANE, CYL, CYL_LOW, CONE, CONE4, SPHERE, ICO, TORUS, WHEEL, GABLE, WEDGE };

// ---------------------------------------------------------------- materials

const lam = (o) => new THREE.MeshLambertMaterial(Object.assign({ flatShading: true }, o));

export function makeMaterials(T) {
  const sidingTints = ['#e4e0d4', '#b6cbd6', '#d9c288', '#adc4a6', '#d7b3a6', '#94a7bd', '#cfd2ae', '#c4b7d0'];
  const roofTints = ['#4a4f5c', '#6b4a3f', '#3f4a46', '#5a4d5e', '#7a6248'];
  const doorTints = ['#8c3b32', '#2f4f68', '#3f5c3c', '#6a4a2c', '#4a3a58'];
  const carTints = ['#c8352b', '#2f6f9e', '#d9c04a', '#e8e4d8', '#3f8f6a', '#8a4fa0', '#2c3038', '#d97b3a'];

  const M = {
    road: lam({ map: T.asphalt, flatShading: false }),
    sidewalk: lam({ map: T.sidewalk, flatShading: false }),
    grass: lam({ map: T.grass, flatShading: false }),
    curb: lam({ color: 0xb6b8bd }),
    walkway: lam({ color: 0xa8a49b }),
    driveway: lam({ color: 0x6f727c }),

    siding: sidingTints.map((c) => lam({ map: T.siding, color: new THREE.Color(c) })),
    roof: roofTints.map((c) => lam({ map: T.shingle, color: new THREE.Color(c) })),
    brick: lam({ map: T.brick }),
    door: doorTints.map((c) => lam({ map: T.door, color: new THREE.Color(c) })),
    trim: lam({ color: 0xf1ece1 }),
    porchFloor: lam({ color: 0x9c8c74 }),
    window: lam({ map: T.window }),
    windowBroken: lam({ map: T.windowBroken }),

    poleWood: lam({ color: 0x6a5a49 }),
    wire: lam({ color: 0x25272e }),
    fence: lam({ color: 0xe7e3d6 }),
    soil: lam({ color: 0x4b3a2c }),
    flower: ['#d8586a', '#e8b23a', '#c46fc0', '#e8e4d8'].map((c) => lam({ color: new THREE.Color(c) })),
    crosswalk: new THREE.MeshBasicMaterial({
      map: T.crosswalk, transparent: true, depthWrite: false, fog: true,
    }),
    stopFace: lam({ map: T.stopFace, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }),
    bird: new THREE.MeshBasicMaterial({
      map: T.bird, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    }),
    trunk: lam({ color: 0x6d5340 }),
    canopy: ['#4f7c43', '#3f6b3d', '#5f8a48'].map((c) => lam({ color: new THREE.Color(c) })),
    foliage: lam({ map: T.leaves, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }),
    hedge: lam({ color: 0x3e6238 }),

    carBody: carTints.map((c) => lam({ color: new THREE.Color(c) })),
    carGlass: lam({ color: 0x27384a }),
    busBody: lam({ color: 0xe8b220 }),
    busTrim: lam({ color: 0x2c3038 }),
    taxiBody: lam({ color: 0xf0c33a }),
    taxiCheck: lam({ color: 0x2c3038 }),
    brakeHot: lam({ color: 0xff5a4a, emissive: 0xd8241a, emissiveIntensity: 1.6 }),
    tire: lam({ color: 0x1b1c22 }),
    chrome: lam({ color: 0xb9bec7 }),
    lightWhite: lam({ color: 0xfff1cf, emissive: 0xffd98a, emissiveIntensity: 0.9 }),
    lightRed: lam({ color: 0xd8433a, emissive: 0x8a1c14, emissiveIntensity: 0.9 }),

    hydrant: lam({ color: 0xc8352b }),
    bin: lam({ color: 0x3f5a48 }),
    binLid: lam({ color: 0x2f4438 }),
    metalDark: lam({ color: 0x363a44 }),
    postWood: lam({ color: 0x7b6045 }),
    flagRed: lam({ color: 0xc8352b, side: THREE.DoubleSide }),
    flagGrey: lam({ color: 0x8b8f98, side: THREE.DoubleSide }),
    mailbox: lam({ color: 0x9aa3ad }),
    mailboxLive: lam({ color: 0xe8e4d8 }),

    dog: ['#b58146', '#3a3d48', '#d8d2c4'].map((c) => lam({ color: new THREE.Color(c) })),
    skin: lam({ color: 0xd8a077 }),
    shirt: lam({ color: 0xc8352b }),
    jeans: lam({ color: 0x3f5878 }),
    cap: lam({ color: 0xe8c33a }),
    capLogo: lam({ map: T.capLogo, transparent: true, alphaTest: 0.45 }),
    shoe: lam({ color: 0xe8e4d8 }),
    bag: lam({ color: 0xf4f1ea }),
    bagFlap: lam({ color: 0xdcd7c8 }),
    bagStrap: lam({ color: 0xc8352b }),
    bike: lam({ color: 0x2e8f96 }),
    bikeDark: lam({ color: 0x22252c }),

    paper: lam({ map: T.newsprint }),
    shard: new THREE.MeshBasicMaterial({
      map: T.shard, transparent: true, depthWrite: false, fog: true,
      side: THREE.DoubleSide,
    }),

    shadow: new THREE.MeshBasicMaterial({
      map: T.blob, color: 0x1a1f2a, transparent: true, opacity: 0.4,
      depthWrite: false, fog: true, blending: THREE.NormalBlending,
    }),
    reticle: new THREE.MeshBasicMaterial({
      map: T.ring, transparent: true, depthWrite: false, depthTest: false,
      fog: false, side: THREE.DoubleSide,
    }),
    chevron: new THREE.MeshBasicMaterial({
      map: T.chevron, transparent: true, depthWrite: false, fog: false,
      side: THREE.DoubleSide,
    }),
    porchGlow: new THREE.MeshBasicMaterial({
      map: T.glow, transparent: true, depthWrite: false, fog: false,
      blending: THREE.AdditiveBlending, opacity: 0.7,
    }),
    lampGlow: new THREE.MeshBasicMaterial({
      map: T.glow, transparent: true, depthWrite: false, fog: true,
      blending: THREE.AdditiveBlending, opacity: 0.42,
    }),
    water: new THREE.MeshBasicMaterial({
      map: T.water, transparent: true, depthWrite: false, fog: true,
      blending: THREE.AdditiveBlending, opacity: 0.75,
    }),
    cloud: new THREE.MeshBasicMaterial({
      map: T.cloud, transparent: true, depthWrite: false, fog: false, opacity: 0.7,
    }),
    sun: new THREE.MeshBasicMaterial({
      map: T.sunDisc, transparent: true, depthWrite: false, fog: false,
      blending: THREE.AdditiveBlending,
    }),
    sky: new THREE.MeshBasicMaterial({ map: T.sky, side: THREE.BackSide, fog: false, depthWrite: false }),
    hill: lam({ color: 0x6f8496, fog: true }),
    banner: null, // filled in by makeBanner
  };
  M.carTints = carTints;

  // A unit box's UVs run 0..1 on every face, so one shared material stretches
  // a single texture tile across an entire wall -- fine on a garden shed,
  // absurd on a three-storey brick facade. These factories hand back a variant
  // whose repeat matches the surface it is going on, cached so the material
  // count stays in the dozens.
  const tile = (tex, rx, ry) => {
    const t = tex.clone();
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    return t;
  };
  const cache = {};
  const cached = (key, make) => (cache[key] || (cache[key] = make()));
  const steps = (v, per) => Math.max(1, Math.round(v / per));

  // 4 bricks and 8 courses per tile; aim for half-unit bricks.
  M.brickFor = (w, h) => {
    const rx = steps(w, 2.0);
    const ry = steps(h, 1.6);
    return cached(`b${rx}_${ry}`, () => lam({ map: tile(T.brick, rx, ry) }));
  };
  // 8 laps per tile; aim for laps a touch under a fifth of a unit.
  M.sidingFor = (base, w, h) => {
    const rx = steps(w, 4.0);
    const ry = steps(h, 1.45);
    const hex = base.color.getHexString();
    return cached(`s${hex}_${rx}_${ry}`, () =>
      lam({ map: tile(T.siding, rx, ry), color: base.color.clone() }));
  };
  // 4 tabs and 8 rows per tile.
  M.roofFor = (base, w, h) => {
    const rx = steps(w, 2.2);
    const ry = steps(h, 2.0);
    const hex = base.color.getHexString();
    return cached(`r${hex}_${rx}_${ry}`, () =>
      lam({ map: tile(T.shingle, rx, ry), color: base.color.clone() }));
  };
  return M;
}

// ---------------------------------------------------------------- helpers

export function bx(mat, sx, sy, sz, x, y, z) {
  const m = new THREE.Mesh(UNIT_BOX, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
}

export function cyl(mat, r, h, x, y, z, seg) {
  const m = new THREE.Mesh(seg === 8 ? CYL_LOW : CYL, mat);
  m.scale.set(r * 2, h, r * 2);
  m.position.set(x, y, z);
  return m;
}

export function plane(mat, w, h, x, y, z) {
  const m = new THREE.Mesh(PLANE, mat);
  m.scale.set(w, h, 1);
  m.position.set(x, y, z);
  return m;
}

export function shadowPlane(M, size) {
  const m = new THREE.Mesh(PLANE, M.shadow);
  m.scale.set(size, size, 1);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  m.renderOrder = 1;
  return m;
}

// ---------------------------------------------------------------- ground

// One long strip per surface that snaps along z in 8-unit steps behind the
// player. Every texture tile length divides 8, so the seam never shows and
// the road markings stay evenly spaced no matter how far you ride.
export const GROUND_SNAP = 8;

export function makeGround(M) {
  const g = new THREE.Group();
  const L = 448;
  const road = plane(M.road, LAYOUT.roadHalf * 2, L, 0, 0.01, 0);
  road.rotation.x = -Math.PI / 2;
  M.road.map.repeat.set(1, L / 8);
  g.add(road);

  for (const s of [-1, 1]) {
    const w = LAYOUT.walkOuter - LAYOUT.walkInner;
    const walk = plane(M.sidewalk, w, L, s * (LAYOUT.walkInner + w / 2), 0.14, 0);
    walk.rotation.x = -Math.PI / 2;
    g.add(walk);
    // Curb face, so the sidewalk reads as raised rather than painted on. Its
    // top sits deliberately above the walk -- coplanar surfaces z-fight into a
    // dotted line all the way to the horizon.
    g.add(bx(M.curb, 0.22, 0.32, L, s * (LAYOUT.walkInner + 0.11), 0.01, 0));

    const lw = LAYOUT.lawnOuter - LAYOUT.walkOuter;
    const lawn = plane(M.grass, lw, L, s * (LAYOUT.walkOuter + lw / 2), 0.12, 0);
    lawn.rotation.x = -Math.PI / 2;
    g.add(lawn);
  }
  M.sidewalk.map.repeat.set(1, L / 2);
  M.grass.map.repeat.set(3, L / 4);
  return g;
}

// ---------------------------------------------------------------- buildings

// Four kinds of address on the route. Setback drives how long the porch throw
// is, the curbside box width drives how hard the bullseye is, and the payouts
// follow from both -- a mansion sits far back behind a narrow stone box and
// pays accordingly, an apartment block has a fat cluster of mailboxes and does
// not.
export const HOUSE_SPEC = {
  single: {
    frontX: 11.6, depth: 7, width: 11, wall: 3.6, spacing: 26, chevY: 6.5,
    porch: 250, mail: 500, window: 150, mailW: 0.8,
    porchBox: [1.7, 1.3, 2.7], label: 'HOUSE',
  },
  townhome: {
    frontX: 10.2, depth: 6, width: 9.9, wall: 6.4, spacing: 9.9, chevY: 8.6,
    porch: 200, mail: 400, window: 125, mailW: 0.6,
    porchBox: [1.4, 1.4, 2.0], label: 'ROW HOUSE',
  },
  apartment: {
    frontX: 12.8, depth: 8.5, width: 17, wall: 9.2, spacing: 36, chevY: 11.6,
    porch: 300, mail: 450, window: 100, mailW: 1.95,
    porchBox: [2.2, 1.5, 3.2], label: 'APARTMENTS',
  },
  mansion: {
    frontX: 15.8, depth: 10, width: 17, wall: 7.2, spacing: 40, chevY: 10.8,
    porch: 450, mail: 750, window: 300, mailW: 0.5,
    porchBox: [2.4, 1.6, 4.0], label: 'MANSION',
  },
};

export const HOUSE_TYPES = Object.keys(HOUSE_SPEC);

// -- shared fittings -------------------------------------------------------

function addWindow(g, M, windows, y, z, w, h) {
  const win = plane(M.window, w, h, 0.06, y, z);
  win.rotation.y = -Math.PI / 2;
  g.add(win);
  g.add(bx(M.trim, 0.06, h + 0.2, w + 0.22, 0.02, y, z));
  windows.push(win);
  return win;
}

// Decoration only, on the gable ends of the wide buildings -- you approach
// those corner-on, and a blank three-storey slab looks unfinished. They are
// deliberately kept out of the smashable list; only the street face counts.
function addSideWindows(g, M, halfW, xs, ys, w, h) {
  for (const s of [-1, 1]) {
    for (const x of xs) {
      for (const y of ys) {
        const win = plane(M.window, w, h, x, y, s * (halfW + 0.05));
        if (s < 0) win.rotation.y = Math.PI;
        g.add(win);
        g.add(bx(M.trim, w + 0.22, h + 0.2, 0.06, x, y, s * (halfW + 0.02)));
      }
    }
  }
}

// Every building keeps a box at the curb, whatever its architecture would
// really have -- the whole risk/reward of riding the sidewalk depends on it.
function addMailbox(g, M, spec, rng) {
  const mbX = -(spec.frontX - LAYOUT.mailboxX);
  const out = {};

  if (spec.mailW > 1.4) {
    // Apartment: a bank of cluster boxes on a stand, each with its own door.
    out.post = bx(M.metalDark, 0.5, 1.0, 1.9, mbX, 0.5, 0);
    g.add(out.post);
    g.add(bx(M.metalDark, 0.9, 0.1, 2.1, mbX, 0.06, 0));       // base plate
    out.boxMesh = bx(M.mailbox, 0.6, 0.78, spec.mailW, mbX, 1.36, 0);
    g.add(out.boxMesh);
    g.add(bx(M.metalDark, 0.64, 0.1, spec.mailW + 0.1, mbX, 1.79, 0));  // cap
    for (let i = -1; i <= 1; i++) {
      for (const y of [1.18, 1.54]) {
        g.add(bx(M.metalDark, 0.05, 0.26, 0.5, mbX - 0.3, y, i * 0.62));
        g.add(bx(M.chrome, 0.05, 0.05, 0.05, mbX - 0.33, y - 0.08, i * 0.62 + 0.16));
      }
    }
    out.flag = plane(M.flagRed, 0.16, 0.34, mbX + 0.32, 1.7, spec.mailW / 2 - 0.2);
  } else if (spec.mailW < 0.55) {
    // Mansion: a slim brass slot set into a stone pillar with a lamp on top.
    g.add(bx(M.brickFor(0.9, 1.5), 0.7, 1.5, 0.9, mbX, 0.75, 0));
    out.post = bx(M.brickFor(0.9, 0.2), 0.86, 0.18, 1.06, mbX, 1.58, 0);
    g.add(out.post);
    g.add(bx(M.chrome, 0.18, 0.18, 0.18, mbX, 1.76, 0));
    g.add(bx(M.lightWhite, 0.13, 0.16, 0.13, mbX, 1.9, 0));
    out.boxMesh = bx(M.mailbox, 0.5, 0.36, spec.mailW, mbX - 0.12, 1.28, 0);
    g.add(out.boxMesh);
    g.add(bx(M.chrome, 0.05, 0.05, spec.mailW - 0.1, mbX - 0.37, 1.28, 0));  // slot
    out.flag = plane(M.flagRed, 0.14, 0.3, mbX - 0.36, 1.52, 0.2);
  } else {
    // The classic tunnel box: post, cross brace, rounded lid, hinged door
    // with a knob, a numbered plate and a flag on a real arm.
    out.post = bx(M.postWood, 0.14, 1.02, 0.14, mbX, 0.51, 0);
    g.add(out.post);
    g.add(bx(M.postWood, 0.5, 0.1, 0.12, mbX, 0.96, 0));          // cross brace
    g.add(bx(M.postWood, 0.14, 0.12, 0.5, mbX, 0.96, 0));
    g.add(bx(M.metalDark, 0.3, 0.1, 0.3, mbX, 0.05, 0));          // footing

    // Body plus a half-round lid, axis running front-to-back like a real box.
    const w = spec.mailW;
    out.boxMesh = bx(M.mailbox, 0.78, 0.26, w, mbX, 1.1, 0);
    g.add(out.boxMesh);
    const lid = cyl(M.mailbox, w / 2, 0.78, mbX, 1.23, 0, 8);
    lid.rotation.z = Math.PI / 2;
    g.add(lid);

    // Door on the street end, slightly proud, with a knob and hinge line.
    g.add(bx(M.mailbox, 0.06, 0.24, w - 0.04, mbX - 0.4, 1.11, 0));
    g.add(bx(M.chrome, 0.07, 0.07, 0.07, mbX - 0.45, 1.06, 0));
    g.add(bx(M.metalDark, 0.05, 0.04, w - 0.06, mbX - 0.41, 1.24, 0));
    // Address plate on the flank.
    g.add(bx(M.trim, 0.34, 0.12, 0.03, mbX + 0.06, 1.06, w / 2 + 0.015));

    // Flag on an arm, so raising it reads as a mechanism rather than a decal.
    const arm = new THREE.Group();
    arm.position.set(mbX + 0.3, 1.2, w / 2 + 0.03);
    g.add(arm);
    arm.add(bx(M.flagRed, 0.05, 0.3, 0.05, 0, 0.15, 0));
    arm.add(bx(M.flagRed, 0.05, 0.22, 0.16, 0, 0.34, 0.06));
    out.flag = arm;
  }
  // The classic box hands back a pivoting arm; the others hand back a plane.
  // Either way the caller only ever sets rotation.z and visible.
  if (out.flag && out.flag.isMesh) g.add(out.flag);
  return out;
}

function addPorchLight(g, M, x, y, z) {
  const bulb = bx(M.lightWhite, 0.18, 0.26, 0.18, x, y, z);
  g.add(bulb);
  const halo = plane(M.porchGlow, 1.7, 1.7, x + 0.2, y, z);
  halo.renderOrder = 3;
  g.add(halo);
  return { bulb, halo };
}

function addChevron(g, M, y) {
  const chev = plane(M.chevron, 1.1, 1.1, -1.2, y, 0);
  chev.renderOrder = 4;
  g.add(chev);
  return chev;
}

function addWalkway(g, M, spec, width) {
  const mbX = -(spec.frontX - LAYOUT.mailboxX);
  const len = Math.abs(mbX) - 1.5;
  if (len > 0.4) g.add(bx(M.walkway, len, 0.05, width, (mbX - 1.4) / 2, 0.16, 0));
}

// -- single family ---------------------------------------------------------

function buildSingle(M, rng, spec) {
  const g = new THREE.Group();
  const w = spec.width;
  const d = spec.depth;
  const wallH = range(rng, 3.2, 3.9);
  const siding = M.sidingFor(pick(rng, M.siding), w, wallH);

  g.add(bx(siding, d, wallH, w, d / 2, wallH / 2, 0));
  if (rng() > 0.65) g.add(bx(M.brickFor(w, 1.1), 0.12, 1.1, w, -0.05, 0.55, 0));

  const roof = new THREE.Mesh(GABLE, M.roofFor(pick(rng, M.roof), w + 0.8, d + 0.7));
  roof.scale.set(d + 0.7, range(rng, 1.9, 2.6), w + 0.8);
  roof.position.set(-0.35, wallH, 0);
  g.add(roof);
  g.add(bx(M.trim, d + 0.7, 0.16, w + 0.8, d / 2 - 0.35, wallH + 0.02, 0));
  if (rng() > 0.5) g.add(bx(M.brickFor(0.7, 1.5), 0.7, 1.5, 0.7, d * 0.62, wallH + 1.4, w * 0.28));

  const porchD = 1.7;
  const porchW = 4.4;
  g.add(bx(M.trim, porchD, 0.42, porchW, -porchD / 2, 0.21, 0));
  g.add(bx(M.trim, porchD + 0.5, 0.16, porchW + 0.5, -porchD / 2 + 0.1, 2.72, 0));
  for (const s of [-1, 1]) {
    g.add(bx(M.trim, 0.16, 2.3, 0.16, -porchD + 0.2, 1.57, s * (porchW / 2 - 0.25)));
  }
  g.add(bx(pick(rng, M.door), 0.1, 1.9, 0.95, 0.02, 1.37, 0));

  const mat = bx(M.walkway, 1.2, 0.06, 2.2, -0.75, 0.45, 0);
  g.add(mat);

  const windows = [];
  for (const o of [-3.4, 3.4]) addWindow(g, M, windows, 1.95, o, 1.7, 1.35);
  addWindow(g, M, windows, wallH + 0.85, 0, 1.1, 0.9);

  if (rng() > 0.45) {
    g.add(bx(M.hedge, 1.0, 0.8, 2.4, -0.2, 0.55, (rng() > 0.5 ? 1 : -1) * range(rng, 3.2, 4.6)));
  }
  return { g, mat, windows, light: addPorchLight(g, M, 0.12, 2.15, 0.85) };
}

// -- row house -------------------------------------------------------------

function buildTownhome(M, rng, spec) {
  const g = new THREE.Group();
  const w = spec.width;
  const d = spec.depth;
  const wallH = spec.wall;
  const brickFront = rng() > 0.45;
  const siding = M.sidingFor(pick(rng, M.siding), w, wallH);

  g.add(bx(siding, d, wallH, w, d / 2, wallH / 2, 0));
  // Facade only on the street face, so the shared walls stay plain.
  g.add(bx(brickFront ? M.brickFor(w, wallH) : siding, 0.14, wallH, w - 0.12, -0.06, wallH / 2, 0));
  // Cornice and a low parapet instead of a pitched roof.
  g.add(bx(M.trim, d + 0.5, 0.3, w, (d - 0.5) / 2 - 0.15, wallH + 0.15, 0));
  g.add(bx(M.roofFor(pick(rng, M.roof), w, d), d, 0.5, w - 0.3, d / 2, wallH + 0.55, 0));
  // Party walls, so a row reads as separate addresses.
  for (const s of [-1, 1]) g.add(bx(M.trim, d, 0.34, 0.22, d / 2, wallH + 1.0, s * w / 2));

  // Stoop: three steps up to a small landing.
  for (let i = 0; i < 3; i++) {
    g.add(bx(M.walkway, 0.42, 0.26, 2.3, -1.55 + i * 0.42, 0.13 + i * 0.26, 0));
  }
  g.add(bx(M.trim, 0.62, 0.16, 2.5, -0.3, 0.86, 0));
  const mat = bx(M.walkway, 0.55, 0.06, 1.5, -0.32, 0.97, 0);
  g.add(mat);
  g.add(bx(pick(rng, M.door), 0.1, 2.1, 1.0, 0.02, 1.98, 0));
  // Iron railings either side of the steps.
  for (const s of [-1, 1]) {
    g.add(bx(M.metalDark, 1.9, 0.07, 0.07, -0.85, 1.15, s * 1.2));
    g.add(bx(M.metalDark, 0.07, 0.9, 0.07, -1.7, 0.6, s * 1.2));
  }

  const windows = [];
  addWindow(g, M, windows, 2.1, 2.9, 1.3, 1.6);          // ground, beside the door
  addWindow(g, M, windows, 4.6, -2.4, 1.2, 1.7);         // upper pair
  addWindow(g, M, windows, 4.6, 2.4, 1.2, 1.7);

  return { g, mat, windows, light: addPorchLight(g, M, 0.12, 2.9, 0.72) };
}

// -- apartment block -------------------------------------------------------

function buildApartment(M, rng, spec) {
  const g = new THREE.Group();
  const w = spec.width;
  const d = spec.depth;
  const wallH = spec.wall;
  const body = rng() > 0.5 ? M.brickFor(w, wallH) : M.sidingFor(pick(rng, M.siding), w, wallH);

  g.add(bx(body, d, wallH, w, d / 2, wallH / 2, 0));
  g.add(bx(M.trim, d + 0.4, 0.4, w + 0.4, d / 2 - 0.2, wallH + 0.2, 0));   // parapet
  g.add(bx(M.metalDark, 1.6, 0.7, 2.2, d * 0.55, wallH + 0.75, w * 0.24)); // roof plant
  g.add(bx(M.trim, 0.16, wallH, w, -0.08, wallH / 2, 0));                  // pilaster strip

  // Recessed entrance under a flat canopy.
  g.add(bx(M.trim, 1.9, 0.24, 5.0, -0.95, 3.3, 0));
  for (const s of [-1, 1]) g.add(bx(M.chrome, 0.14, 3.2, 0.14, -1.8, 1.6, s * 2.2));
  g.add(bx(M.walkway, 0.5, 0.22, 4.6, -0.25, 0.11, 0));
  g.add(bx(M.carGlass, 0.1, 2.4, 2.4, 0.02, 1.4, 0));
  g.add(bx(M.chrome, 0.14, 2.5, 0.16, -0.03, 1.45, 0));
  const mat = bx(M.walkway, 1.1, 0.06, 2.6, -0.9, 0.25, 0);
  g.add(mat);

  // Window grid, skipping the bay the entrance occupies.
  const windows = [];
  for (const y of [2.4, 5.2, 7.7]) {
    for (const z of [-6.4, -2.2, 2.2, 6.4]) {
      if (y < 3 && Math.abs(z) < 3) continue;
      addWindow(g, M, windows, y, z, 1.4, 1.5);
    }
  }
  addSideWindows(g, M, w / 2, [2.4, 6.0], [2.4, 5.2, 7.7], 1.3, 1.4);

  // A couple of balconies to break up the slab.
  for (const z of [-6.4, 6.4]) {
    g.add(bx(M.chrome, 1.0, 0.12, 2.2, -0.5, 4.5, z));
    g.add(bx(M.metalDark, 1.0, 0.6, 0.08, -0.5, 4.8, z + 1.05));
  }

  return { g, mat, windows, light: addPorchLight(g, M, -1.6, 3.05, 1.4) };
}

// -- mansion ---------------------------------------------------------------

function buildMansion(M, rng, spec) {
  const g = new THREE.Group();
  const w = spec.width;
  const d = spec.depth;
  const wallH = spec.wall;
  const body = rng() > 0.5 ? M.brickFor(w, wallH) : M.sidingFor(pick(rng, M.siding), w, wallH);

  g.add(bx(body, d, wallH, w, d / 2, wallH / 2, 0));
  g.add(bx(M.trim, d + 0.3, 0.3, w + 0.3, d / 2 - 0.15, wallH + 0.15, 0));

  // Hip roof: a four-sided cone turned so its faces square up with the walls.
  const roof = new THREE.Mesh(CONE4, M.roofFor(pick(rng, M.roof), w, d));
  roof.rotation.y = Math.PI / 4;
  roof.scale.set((d + 0.8) * 1.414, 2.5, (w + 0.8) * 1.414);
  roof.position.set(d / 2, wallH + 0.3, 0);
  g.add(roof);
  for (const s of [-1, 1]) g.add(bx(M.brickFor(0.9, 1.8), 0.9, 1.8, 0.9, d * 0.6, wallH + 1.6, s * w * 0.3));

  // Two-storey portico across the middle of the facade.
  const porticoD = 2.6;
  g.add(bx(M.trim, porticoD, 0.5, 6.4, -porticoD / 2, 0.25, 0));
  for (let i = 0; i < 3; i++) {
    g.add(bx(M.trim, 0.34, 0.2, 7.2, -porticoD - 0.3 + i * 0.32, 0.1 + i * 0.18, 0));
  }
  for (const z of [-2.7, -0.9, 0.9, 2.7]) {
    g.add(cyl(M.trim, 0.24, 5.4, -porticoD + 0.45, 3.2, z));
    g.add(bx(M.trim, 0.66, 0.18, 0.66, -porticoD + 0.45, 0.58, z));
    g.add(bx(M.trim, 0.66, 0.18, 0.66, -porticoD + 0.45, 5.9, z));
  }
  g.add(bx(M.trim, porticoD + 0.7, 0.44, 7.0, -porticoD / 2, 6.15, 0));
  const ped = new THREE.Mesh(GABLE, M.trim);
  ped.scale.set(porticoD + 0.7, 1.5, 7.0);
  ped.position.set(-porticoD - 0.35, 6.37, 0);
  ped.rotation.y = 0;
  g.add(ped);

  const mat = bx(M.walkway, 1.4, 0.06, 3.4, -1.0, 0.53, 0);
  g.add(mat);
  for (const s of [-1, 1]) g.add(bx(M.door[3], 0.1, 2.6, 0.8, 0.02, 1.85, s * 0.45));
  g.add(bx(M.chrome, 0.14, 2.7, 0.12, -0.02, 1.85, 0));

  const windows = [];
  for (const y of [2.2, 5.1]) {
    for (const z of [-6.4, -3.9, 3.9, 6.4]) addWindow(g, M, windows, y, z, 1.5, 1.9);
  }

  addSideWindows(g, M, w / 2, [3.2, 6.8], [2.2, 5.1], 1.4, 1.7);

  // Grounds: clipped hedges and a gravel sweep.
  g.add(bx(M.driveway, Math.abs(-(spec.frontX - LAYOUT.mailboxX)) - 1.2, 0.05, 5.4,
    (-(spec.frontX - LAYOUT.mailboxX) - 1.1) / 2, 0.15, 0));
  for (const s of [-1, 1]) {
    g.add(bx(M.hedge, 3.4, 1.0, 0.9, -1.9, 0.6, s * 4.2));
    g.add(bx(M.hedge, 0.9, 1.3, 3.0, -3.6, 0.75, s * 5.4));
  }
  return { g, mat, windows, light: addPorchLight(g, M, -2.2, 3.4, 1.7) };
}

const BUILDERS = {
  single: buildSingle,
  townhome: buildTownhome,
  apartment: buildApartment,
  mansion: buildMansion,
};

export function makeHouse(M, rng, type) {
  const spec = HOUSE_SPEC[type] || HOUSE_SPEC.single;
  const built = BUILDERS[type in BUILDERS ? type : 'single'](M, rng, spec);
  const g = built.g;
  const mb = addMailbox(g, M, spec, rng);
  addWalkway(g, M, spec, type === 'mansion' ? 3.0 : 1.1);
  const chev = addChevron(g, M, spec.chevY);
  const anchors = {
    boxMesh: mb.boxMesh, flag: mb.flag, post: mb.post,
    mat: built.mat, windows: built.windows,
    bulb: built.light.bulb, halo: built.light.halo, chev,
  };
  return { group: g, anchors, type, spec };
}

// ---------------------------------------------------------------- scenery

export function makeTree(M, rng) {
  const g = new THREE.Group();
  const h = range(rng, 2.2, 3.4);
  g.add(cyl(M.trunk, 0.19, h, 0, h / 2, 0));
  const conifer = rng() > 0.68;
  if (conifer) {
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(CONE, pick(rng, M.canopy));
      const s = 2.6 - i * 0.6;
      c.scale.set(s, 2.0 - i * 0.3, s);
      c.position.y = h * 0.55 + i * 1.0;
      g.add(c);
    }
  } else {
    const lobes = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < lobes; i++) {
      const c = new THREE.Mesh(ICO, pick(rng, M.canopy));
      const s = range(rng, 2.0, 3.0);
      c.scale.set(s, s * range(rng, 0.75, 1.0), s);
      c.position.set(range(rng, -0.7, 0.7), h + range(rng, 0.1, 1.0), range(rng, -0.7, 0.7));
      c.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      g.add(c);
    }
  }
  return g;
}

export function makeBush(M, rng) {
  const g = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const card = plane(M.foliage, 1.9, 1.5, 0, 0.7, 0);
    card.rotation.y = i * Math.PI / 2;
    g.add(card);
  }
  return g;
}

export function makeHydrant(M) {
  const g = new THREE.Group();
  g.add(cyl(M.hydrant, 0.19, 0.62, 0, 0.31, 0));
  const dome = new THREE.Mesh(SPHERE, M.hydrant);
  dome.scale.setScalar(0.38);
  dome.position.y = 0.62;
  g.add(dome);
  for (const s of [-1, 1]) g.add(cyl(M.hydrant, 0.1, 0.18, s * 0.22, 0.42, 0).rotateZ(Math.PI / 2));
  g.add(bx(M.hydrant, 0.5, 0.08, 0.5, 0, 0.04, 0));
  return g;
}

export function makeBin(M) {
  const g = new THREE.Group();
  g.add(cyl(M.bin, 0.34, 0.86, 0, 0.43, 0));
  g.add(cyl(M.binLid, 0.38, 0.1, 0, 0.9, 0));
  g.add(bx(M.binLid, 0.1, 0.06, 0.5, 0.34, 0.78, 0));
  return g;
}

export function makeLamp(M) {
  const g = new THREE.Group();
  g.add(cyl(M.metalDark, 0.09, 5.4, 0, 2.7, 0));
  g.add(bx(M.metalDark, 1.5, 0.1, 0.1, -0.7, 5.35, 0));
  g.add(bx(M.lightWhite, 0.7, 0.18, 0.34, -1.35, 5.2, 0));
  const halo = plane(M.lampGlow, 1.5, 1.5, -1.35, 5.06, 0);
  halo.renderOrder = 3;
  g.add(halo);
  return g;
}

// ---------------------------------------------------------------- vehicles

// Body plans, in world units. `rz` is the half-length used for collision, so
// a bus genuinely takes up more of the block than a sedan does.
export const VEHICLES = {
  sedan: { len: 4.3, halfW: 1.0, rz: 2.4, speed: 1.0 },
  taxi: { len: 4.3, halfW: 1.0, rz: 2.4, speed: 1.1 },
  pickup: { len: 4.9, halfW: 1.05, rz: 2.7, speed: 0.95 },
  van: { len: 5.1, halfW: 1.05, rz: 2.8, speed: 0.85 },
  bus: { len: 8.2, halfW: 1.2, rz: 4.4, speed: 0.62 },
};

export const VEHICLE_KINDS = Object.keys(VEHICLES);

function wheels(g, M, len, halfW, r) {
  const out = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = cyl(M.tire, r, 0.26, sx * (halfW - 0.1), r, sz * len * 0.31, 8);
      w.rotation.z = Math.PI / 2;
      g.add(w);
      out.push(w);
    }
  }
  return out;
}

// Head and tail lamps. The tail meshes come back so the driving code can
// swap them to a bright material when the vehicle is slowing.
function lamps(g, M, len, halfW, y) {
  const brake = [];
  for (const sx of [-1, 1]) {
    g.add(bx(M.lightWhite, 0.42, 0.2, 0.1, sx * (halfW - 0.4), y, -len / 2 - 0.03));
    const tail = bx(M.lightRed, 0.42, 0.2, 0.1, sx * (halfW - 0.4), y, len / 2 + 0.03);
    g.add(tail);
    brake.push(tail);
  }
  return brake;
}

export function makeVehicle(M, rng, kind) {
  const spec = VEHICLES[kind] || VEHICLES.sedan;
  const g = new THREE.Group();
  const len = spec.len;
  const halfW = spec.halfW;
  let brake = [];

  if (kind === 'bus') {
    const body = M.busBody;
    g.add(bx(body, halfW * 2, 1.9, len, 0, 1.25, 0));
    g.add(bx(M.busTrim, halfW * 2 + 0.04, 0.16, len, 0, 0.5, 0));
    g.add(bx(M.carGlass, halfW * 2 + 0.02, 0.62, len * 0.82, 0, 1.72, 0.1));
    g.add(bx(M.carGlass, halfW * 2 - 0.2, 0.72, 0.1, 0, 1.6, -len / 2 - 0.02));
    g.add(bx(M.metalDark, 0.9, 0.16, 0.9, 0, 2.24, len * 0.2));   // roof hatch
    g.add(bx(M.chrome, halfW * 2, 0.18, 0.2, 0, 0.62, -len / 2 - 0.04));
    // Stop arm and the door, so it reads as a school bus even at 240p.
    g.add(bx(M.hydrant, 0.1, 0.5, 0.5, -halfW - 0.06, 1.3, 0.4));
    brake = lamps(g, M, len, halfW, 0.9);
    for (const sz of [-0.34, 0.2, 0.36]) {
      for (const sx of [-1, 1]) {
        const w = cyl(M.tire, 0.42, 0.3, sx * (halfW - 0.08), 0.42, sz * len, 8);
        w.rotation.z = Math.PI / 2;
        g.add(w);
      }
    }
    return { group: g, brake, spec, kind };
  }

  const body = kind === 'taxi' ? M.taxiBody : pick(rng, M.carBody);
  g.add(bx(body, halfW * 2, 0.62, len, 0, 0.62, 0));

  if (kind === 'pickup') {
    g.add(bx(body, halfW * 2 - 0.16, 0.6, len * 0.34, 0, 1.16, -len * 0.16));
    g.add(bx(M.carGlass, halfW * 2 - 0.1, 0.42, len * 0.32, 0, 1.22, -len * 0.16));
    // Open bed with low side walls.
    for (const sx of [-1, 1]) {
      g.add(bx(body, 0.14, 0.44, len * 0.42, sx * (halfW - 0.07), 1.12, len * 0.22));
    }
    g.add(bx(body, halfW * 2, 0.44, 0.14, 0, 1.12, len / 2 - 0.07));
    if (rng() > 0.5) g.add(bx(M.postWood, 0.6, 0.5, 1.2, 0, 1.15, len * 0.2));
  } else if (kind === 'van') {
    g.add(bx(body, halfW * 2, 1.34, len * 0.76, 0, 1.5, len * 0.1));
    g.add(bx(M.carGlass, halfW * 2 - 0.06, 0.5, 0.1, 0, 1.72, -len * 0.28));
    for (const sx of [-1, 1]) {
      g.add(bx(M.carGlass, 0.06, 0.44, len * 0.3, sx * halfW, 1.74, -len * 0.06));
    }
    g.add(bx(M.trim, halfW * 2 - 0.2, 0.5, 0.08, 0, 1.4, len * 0.48));
  } else {
    g.add(bx(body, halfW * 2 - 0.2, 0.56, len * 0.46, 0, 1.14, len * 0.02));
    g.add(bx(M.carGlass, halfW * 2 - 0.16, 0.4, len * 0.44, 0, 1.2, len * 0.02));
    if (kind === 'taxi') {
      g.add(bx(M.trim, 0.5, 0.22, 0.9, 0, 1.53, len * 0.02));
      g.add(bx(M.taxiCheck, halfW * 2 + 0.02, 0.16, len * 0.7, 0, 0.66, 0));
    }
  }

  g.add(bx(M.chrome, halfW * 2, 0.14, 0.22, 0, 0.55, -len / 2 - 0.02));
  g.add(bx(M.chrome, halfW * 2, 0.14, 0.22, 0, 0.55, len / 2 + 0.02));
  brake = lamps(g, M, len, halfW, 0.78);
  wheels(g, M, len, halfW, 0.34);
  return { group: g, brake, spec, kind };
}

export function makeDog(M, rng) {
  const g = new THREE.Group();
  const fur = pick(rng, M.dog);
  const body = bx(fur, 0.38, 0.36, 0.86, 0, 0.52, 0);
  g.add(body);
  const head = new THREE.Group();
  head.position.set(0, 0.68, -0.5);
  head.add(bx(fur, 0.32, 0.3, 0.34, 0, 0, 0));
  head.add(bx(fur, 0.2, 0.16, 0.22, 0, -0.07, -0.24));
  head.add(bx(M.metalDark, 0.06, 0.06, 0.06, 0, -0.04, -0.36));
  for (const s of [-1, 1]) head.add(bx(fur, 0.08, 0.18, 0.12, s * 0.14, 0.2, 0.02));
  g.add(head);
  const legs = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const l = bx(fur, 0.12, 0.4, 0.12, sx * 0.14, -0.2, sz * 0.28);
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.4, 0);
      pivot.add(l);
      g.add(pivot);
      legs.push(pivot);
    }
  }
  const tail = bx(fur, 0.1, 0.1, 0.4, 0, 0.68, 0.5);
  g.add(tail);
  return { group: g, legs, head, tail, body };
}

// ------------------------------------------------------- street furniture

// Poles carry a fixed-length span of wire toward the next pole, so the world
// streamer can place them independently and the line still looks continuous.
export const POLE_SPAN = 34;

export function makePole(M) {
  const g = new THREE.Group();
  g.add(cyl(M.poleWood, 0.17, 7.4, 0, 3.7, 0));
  for (const y of [6.5, 5.9]) {
    g.add(bx(M.poleWood, 0.12, 0.12, 2.0, 0, y, 0));
    for (const s of [-1, 1]) g.add(bx(M.chrome, 0.08, 0.22, 0.08, 0, y + 0.16, s * 0.8));
  }
  // Each span is a shallow catenary faked with two tilted bars meeting at the
  // low point, running toward where the next pole will stand.
  const half = POLE_SPAN / 2;
  const sag = 0.9;
  const tilt = Math.atan2(sag, half);
  const barLen = Math.hypot(half, sag);
  for (const y of [6.66, 6.06]) {
    const a = bx(M.wire, 0.05, 0.05, barLen, 0, y - sag / 2, -half / 2);
    a.rotation.x = -tilt;
    g.add(a);
    const b = bx(M.wire, 0.05, 0.05, barLen, 0, y - sag / 2, -half * 1.5);
    b.rotation.x = tilt;
    g.add(b);
  }
  return g;
}

export function makeStopSign(M) {
  const g = new THREE.Group();
  g.add(cyl(M.metalDark, 0.055, 2.5, 0, 1.25, 0));
  const face = plane(M.stopFace, 0.82, 0.82, 0, 2.3, 0);
  g.add(face);
  const back = plane(M.stopFace, 0.82, 0.82, 0, 2.3, -0.02);
  back.rotation.y = Math.PI;
  g.add(back);
  return g;
}

export function makeCrosswalk(M) {
  const g = new THREE.Group();
  const m = plane(M.crosswalk, LAYOUT.roadHalf * 2 - 0.6, 2.6, 0, 0.04, 0);
  m.rotation.x = -Math.PI / 2;
  g.add(m);
  return g;
}

export function makeFence(M, rng) {
  const g = new THREE.Group();
  const len = 5.2;
  for (const y of [0.42, 0.86]) g.add(bx(M.fence, 0.06, 0.08, len, 0, y, 0));
  for (let i = 0; i < 11; i++) {
    const z = -len / 2 + 0.24 + i * (len - 0.48) / 10;
    g.add(bx(M.fence, 0.08, 1.06, 0.14, 0, 0.53, z));
    g.add(bx(M.fence, 0.08, 0.12, 0.1, 0, 1.1, z));
  }
  return g;
}

export function makeFlowerbed(M, rng) {
  const g = new THREE.Group();
  g.add(bx(M.soil, 1.1, 0.16, 2.6, 0, 0.08, 0));
  const beds = M.flower;
  for (let i = 0; i < 10; i++) {
    const f = new THREE.Mesh(SPHERE, beds[Math.floor(rng() * beds.length)]);
    f.scale.setScalar(range(rng, 0.16, 0.26));
    f.position.set(range(rng, -0.35, 0.35), range(rng, 0.2, 0.34), range(rng, -1.1, 1.1));
    g.add(f);
  }
  return g;
}

export function makeHoop(M) {
  const g = new THREE.Group();
  g.add(cyl(M.metalDark, 0.08, 3.3, 0, 1.65, 0));
  g.add(bx(M.metalDark, 0.5, 0.08, 0.08, -0.25, 3.2, 0));
  g.add(bx(M.trim, 0.08, 0.9, 1.3, -0.52, 3.05, 0));
  const rim = new THREE.Mesh(TORUS, M.hydrant);
  rim.scale.setScalar(0.62);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(-0.68, 2.72, 0);
  g.add(rim);
  return g;
}

export function makeDrain(M) {
  const g = new THREE.Group();
  g.add(bx(M.metalDark, 0.5, 0.1, 1.1, 0, 0.06, 0));
  for (let i = -2; i <= 2; i++) g.add(bx(M.curb, 0.42, 0.06, 0.09, 0, 0.12, i * 0.19));
  return g;
}

export function makeRamp(M) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(WEDGE, M.postWood);
  m.scale.set(2.6, 0.85, 3.0);
  g.add(m);
  g.add(bx(M.flagRed, 2.6, 0.1, 0.3, 0, 0.9, -1.45));
  return g;
}

export function makeSprinkler(M) {
  const g = new THREE.Group();
  g.add(cyl(M.metalDark, 0.12, 0.3, 0, 0.15, 0));
  const drops = [];
  for (let i = 0; i < 14; i++) {
    const d = plane(M.water, 0.42, 0.42, 0, 0, 0);
    d.renderOrder = 2;
    g.add(d);
    drops.push(d);
  }
  return { group: g, drops };
}

export function makeGnome(M, rng) {
  const g = new THREE.Group();
  g.add(cyl(M.shirt, 0.16, 0.34, 0, 0.17, 0));
  const head = new THREE.Mesh(SPHERE, M.skin);
  head.scale.setScalar(0.24);
  head.position.y = 0.42;
  g.add(head);
  const hat = new THREE.Mesh(CONE, M.hydrant);
  hat.scale.set(0.34, 0.42, 0.34);
  hat.position.y = 0.68;
  g.add(hat);
  return g;
}

export function makeBundle(M) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    g.add(bx(M.paper, 0.42, 0.12, 0.3, 0, 0.08 + i * 0.12, (i - 1) * 0.04));
  }
  g.add(bx(M.bagStrap, 0.46, 0.06, 0.06, 0, 0.2, 0));
  return g;
}

// ---------------------------------------------------------------- player

export function makeRider(M) {
  const root = new THREE.Group();
  const lean = new THREE.Group();   // rolls with steering
  root.add(lean);

  const bike = new THREE.Group();
  lean.add(bike);

  // Frame.
  bike.add(bx(M.bike, 0.07, 0.07, 1.0, 0, 0.62, 0.05));
  bike.add(bx(M.bike, 0.07, 0.5, 0.07, 0, 0.5, 0.42).rotateX(0.35));
  bike.add(bx(M.bike, 0.07, 0.62, 0.07, 0, 0.72, -0.38).rotateX(-0.28));
  bike.add(bx(M.bikeDark, 0.16, 0.16, 0.12, 0, 0.42, 0.16));

  const wheels = [];
  for (const z of [0.62, -0.58]) {
    const w = new THREE.Mesh(WHEEL, M.bikeDark);
    w.position.set(0, 0.36, z);
    bike.add(w);
    // Crossed spokes in the wheel plane, so the rotation is legible from
    // behind even though the rim itself is nearly edge-on.
    const spokes = new THREE.Group();
    spokes.position.set(0, 0.36, z);
    spokes.add(bx(M.chrome, 0.03, 0.66, 0.03, 0, 0, 0));
    spokes.add(bx(M.chrome, 0.03, 0.03, 0.66, 0, 0, 0));
    spokes.add(bx(M.chrome, 0.03, 0.5, 0.5, 0, 0, 0).rotateX(Math.PI / 4));
    bike.add(spokes);
    wheels.push({ tyre: w, spokes });
  }

  const fork = new THREE.Group();
  fork.position.set(0, 0.72, -0.5);
  bike.add(fork);
  fork.add(bx(M.chrome, 0.06, 0.5, 0.06, 0, -0.2, -0.06));
  fork.add(bx(M.bikeDark, 0.62, 0.06, 0.06, 0, 0.24, 0));
  fork.add(bx(M.bikeDark, 0.08, 0.06, 0.16, 0.3, 0.24, 0.06));
  fork.add(bx(M.bikeDark, 0.08, 0.06, 0.16, -0.3, 0.24, 0.06));

  const seat = bx(M.bikeDark, 0.14, 0.08, 0.34, 0, 0.94, 0.34);
  bike.add(seat);

  // Rider.
  const rider = new THREE.Group();
  lean.add(rider);
  const torso = new THREE.Group();
  torso.position.set(0, 0.95, 0.2);
  torso.rotation.x = -0.42;
  rider.add(torso);
  torso.add(bx(M.shirt, 0.44, 0.62, 0.3, 0, 0.28, 0));
  torso.add(bx(M.jeans, 0.42, 0.2, 0.32, 0, -0.04, 0));

  const head = new THREE.Group();
  head.position.set(0, 0.68, -0.06);
  torso.add(head);
  head.add(bx(M.skin, 0.26, 0.28, 0.26, 0, 0, 0));
  head.add(bx(M.cap, 0.29, 0.12, 0.29, 0, 0.18, 0));
  head.add(bx(M.cap, 0.3, 0.055, 0.09, 0, 0.13, 0.16));      // adjuster strap
  // Worn backwards: the brim sticks out behind, toward the chase camera.
  head.add(bx(M.cap, 0.24, 0.05, 0.2, 0, 0.115, 0.2));
  // The monogram goes on the panel the camera can actually see.
  const logo = plane(M.capLogo, 0.21, 0.095, 0, 0.184, 0.148);
  head.add(logo);

  // Satchel on the back -- the papers you are actually carrying. The flap and
  // buckle keep it from reading as a blank white slab from the chase camera.
  const bag = bx(M.bag, 0.4, 0.28, 0.19, 0, 0.15, 0.225);
  torso.add(bag);
  torso.add(bx(M.bagFlap, 0.42, 0.11, 0.21, 0, 0.27, 0.228));
  torso.add(bx(M.bagStrap, 0.08, 0.07, 0.06, 0, 0.22, 0.33));
  torso.add(bx(M.bagStrap, 0.1, 0.56, 0.3, 0.11, 0.3, 0.02).rotateZ(0.18));

  const arms = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(s * 0.24, 0.44, -0.04);
    torso.add(a);
    a.add(bx(M.shirt, 0.13, 0.5, 0.13, 0, -0.25, 0));
    a.add(bx(M.skin, 0.11, 0.14, 0.11, 0, -0.5, 0));
    arms.push(a);
  }

  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.15, 0.92, 0.16);
    rider.add(hip);
    const thigh = new THREE.Group();
    hip.add(thigh);
    thigh.add(bx(M.jeans, 0.15, 0.36, 0.16, 0, -0.18, 0));
    const knee = new THREE.Group();
    knee.position.y = -0.34;
    thigh.add(knee);
    knee.add(bx(M.jeans, 0.13, 0.34, 0.14, 0, -0.17, 0));
    knee.add(bx(M.shoe, 0.14, 0.1, 0.26, 0, -0.34, -0.04));
    legs.push({ hip, thigh, knee, side: s });
  }

  const crank = new THREE.Group();
  crank.position.set(0, 0.42, 0.16);
  bike.add(crank);
  for (const s of [-1, 1]) crank.add(bx(M.chrome, 0.05, 0.3, 0.05, s * 0.13, 0, 0));

  return { root, lean, bike, rider, torso, head, arms, legs, wheels, fork, crank, bag };
}

// ---------------------------------------------------------------- sky

export function makeSky(M, rng) {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(260, 16, 10), M.sky);
  g.add(dome);

  // Low sun, ahead and off to the left, so it sits in the ride-toward view.
  const sun = plane(M.sun, 62, 62, -74, 15, -228);
  sun.renderOrder = -1;
  g.add(sun);

  for (let i = 0; i < 11; i++) {
    const c = plane(M.cloud, range(rng, 30, 58), range(rng, 7, 14), 0, 0, 0);
    const a = rng() * Math.PI * 2;
    const r = range(rng, 140, 225);
    c.position.set(Math.cos(a) * r, range(rng, 30, 62), Math.sin(a) * r);
    c.lookAt(0, c.position.y, 0);
    g.add(c);
  }
  return g;
}

export function makeHills(M, rng) {
  const g = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const c = new THREE.Mesh(CONE, M.hill);
    const a = rng() * Math.PI * 2;
    const r = range(rng, 130, 190);
    const s = range(rng, 30, 70);
    c.scale.set(s * 1.8, s * 0.5, s * 1.8);
    c.position.set(Math.cos(a) * r, -2, Math.sin(a) * r);
    g.add(c);
  }
  return g;
}

export function makeFinishArch(M) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) g.add(cyl(M.metalDark, 0.16, 6, s * 6.4, 3, 0));
  const c = document.createElement('canvas');
  c.width = 512; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#c8352b';
  x.fillRect(0, 0, 512, 64);
  x.fillStyle = '#e8e4d8';
  x.fillRect(0, 4, 512, 3);
  x.fillRect(0, 57, 512, 3);
  x.font = 'bold 40px monospace';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('END OF ROUTE', 256, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
  g.add(plane(mat, 13, 1.6, 0, 5.4, 0));
  return g;
}

export function makePaperMesh(M) {
  const m = bx(M.paper, 0.34, 0.1, 0.24, 0, 0, 0);
  return m;
}

export function makeShard(M) {
  // Built at unit size on purpose: the spawn code calls setScalar, which would
  // otherwise throw away any base scale baked in here.
  const m = plane(M.shard, 1, 1, 0, 0, 0);
  // Own material: each shard fades out on its own clock.
  m.material = M.shard.clone();
  m.renderOrder = 5;
  return m;
}

export function makeReticle(M) {
  const m = plane(M.reticle, 1.4, 1.4, 0, 0, 0);
  m.renderOrder = 900;
  return m;
}

export { clamp };
