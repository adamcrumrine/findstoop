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
const SPHERE = new THREE.SphereGeometry(0.5, 8, 6);
const ICO = new THREE.IcosahedronGeometry(0.5, 0);
const TORUS = new THREE.TorusGeometry(0.36, 0.07, 5, 12);

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

export const GEO = { UNIT_BOX, PLANE, CYL, CYL_LOW, CONE, SPHERE, ICO, TORUS, GABLE, WEDGE };

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

    trunk: lam({ color: 0x6d5340 }),
    canopy: ['#4f7c43', '#3f6b3d', '#5f8a48'].map((c) => lam({ color: new THREE.Color(c) })),
    foliage: lam({ map: T.leaves, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }),
    hedge: lam({ color: 0x3e6238 }),

    carBody: carTints.map((c) => lam({ color: new THREE.Color(c) })),
    carGlass: lam({ color: 0x27384a }),
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
    cap: lam({ color: 0x22314a }),
    shoe: lam({ color: 0xe8e4d8 }),
    bag: lam({ color: 0xc9bb96 }),
    bagStrap: lam({ color: 0xc8352b }),
    bike: lam({ color: 0x2e8f96 }),
    bikeDark: lam({ color: 0x22252c }),

    paper: lam({ map: T.newsprint }),

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
  return M;
}

// ---------------------------------------------------------------- helpers

export function bx(mat, sx, sy, sz, x, y, z) {
  const m = new THREE.Mesh(UNIT_BOX, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
}

function cyl(mat, r, h, x, y, z, seg) {
  const m = new THREE.Mesh(seg === 8 ? CYL_LOW : CYL, mat);
  m.scale.set(r * 2, h, r * 2);
  m.position.set(x, y, z);
  return m;
}

function plane(mat, w, h, x, y, z) {
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

// ---------------------------------------------------------------- house

export function makeHouse(M, rng) {
  const g = new THREE.Group();
  const w = LAYOUT.houseWidth;
  const d = LAYOUT.houseDepth;
  const wallH = range(rng, 3.2, 3.9);
  const siding = pick(rng, M.siding);
  const roofMat = pick(rng, M.roof);
  const stone = rng() > 0.65;

  // Body sits with its front face at local x = 0, extending to x = +d.
  g.add(bx(siding, d, wallH, w, d / 2, wallH / 2, 0));
  if (stone) g.add(bx(M.brick, 0.12, 1.1, w, -0.05, 0.55, 0));

  const roof = new THREE.Mesh(GABLE, roofMat);
  roof.scale.set(d + 0.7, range(rng, 1.9, 2.6), w + 0.8);
  roof.position.set(-0.35, wallH, 0);
  g.add(roof);
  // Fascia board under the eaves.
  g.add(bx(M.trim, d + 0.7, 0.16, w + 0.8, d / 2 - 0.35, wallH + 0.02, 0));

  if (rng() > 0.5) {
    g.add(bx(M.brick, 0.7, 1.5, 0.7, d * 0.62, wallH + 1.4, w * 0.28));
  }

  // Porch: floor, roof, posts, door, and the doormat that is the delivery zone.
  const porchD = 1.7;
  const porchW = 4.4;
  g.add(bx(M.trim, porchD, 0.42, porchW, -porchD / 2, 0.21, 0));
  g.add(bx(M.trim, porchD + 0.5, 0.16, porchW + 0.5, -porchD / 2 + 0.1, 2.72, 0));
  for (const s of [-1, 1]) {
    g.add(bx(M.trim, 0.16, 2.3, 0.16, -porchD + 0.2, 1.57, s * (porchW / 2 - 0.25)));
  }
  const doorMat = pick(rng, M.door);
  g.add(bx(doorMat, 0.1, 1.9, 0.95, 0.02, 1.37, 0));

  const mat = bx(M.walkway, 1.2, 0.06, 2.2, -0.75, 0.45, 0);
  g.add(mat);

  // Porch light + its glow card. Both toggle with subscriber state.
  const bulb = bx(M.lightWhite, 0.18, 0.26, 0.18, 0.12, 2.15, 0.85);
  g.add(bulb);
  const halo = plane(M.porchGlow, 1.7, 1.7, 0.3, 2.15, 0.85);
  halo.renderOrder = 3;
  g.add(halo);

  // Front windows -- smashable, and the mesh list is what the game hit-tests.
  const windows = [];
  for (const o of [-3.4, 3.4]) {
    const win = plane(M.window, 1.7, 1.35, 0.06, 1.95, o);
    win.rotation.y = -Math.PI / 2;
    g.add(win);
    g.add(bx(M.trim, 0.06, 1.55, 1.9, 0.02, 1.95, o));
    windows.push(win);
  }
  // Gable window, higher and harder to reach.
  const gw = plane(M.window, 1.1, 0.9, 0.06, wallH + 0.85, 0);
  gw.rotation.y = -Math.PI / 2;
  g.add(gw);
  windows.push(gw);

  // Mailbox out at the lawn edge, local x is negative (toward the street).
  const mbX = -(LAYOUT.houseFrontX - LAYOUT.mailboxX);
  const post = bx(M.postWood, 0.14, 1.0, 0.14, mbX, 0.5, 0);
  g.add(post);
  const boxMesh = bx(M.mailbox, 0.78, 0.44, 0.42, mbX, 1.16, 0);
  g.add(boxMesh);
  const flag = plane(M.flagRed, 0.16, 0.42, mbX + 0.3, 1.42, 0.24);
  g.add(flag);

  // Walkway from mailbox to porch.
  g.add(bx(M.walkway, Math.abs(mbX) - 1.6, 0.05, 1.1, (mbX - 1.5) / 2, 0.16, 0));

  // Floating chevron that marks a pending subscriber.
  const chev = plane(M.chevron, 1.1, 1.1, -1.2, 4.6, 0);
  chev.renderOrder = 4;
  g.add(chev);

  // Yard dressing.
  if (rng() > 0.45) {
    const hedgeZ = (rng() > 0.5 ? 1 : -1) * range(rng, 3.2, 4.6);
    g.add(bx(M.hedge, 1.0, 0.8, 2.4, -0.2, 0.55, hedgeZ));
  }

  const anchors = { boxMesh, mat, windows, flag, bulb, halo, chev, post };
  return { group: g, anchors };
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

export function makeCar(M, rng) {
  const g = new THREE.Group();
  const body = pick(rng, M.carBody);
  const len = range(rng, 3.9, 4.6);
  g.add(bx(body, 1.85, 0.62, len, 0, 0.62, 0));
  g.add(bx(body, 1.66, 0.56, len * 0.46, 0, 1.14, len * 0.02));
  g.add(bx(M.carGlass, 1.7, 0.4, len * 0.44, 0, 1.2, len * 0.02));
  g.add(bx(M.chrome, 1.9, 0.14, 0.22, 0, 0.55, -len / 2 - 0.02));
  g.add(bx(M.chrome, 1.9, 0.14, 0.22, 0, 0.55, len / 2 + 0.02));
  for (const sx of [-1, 1]) {
    g.add(bx(M.lightWhite, 0.42, 0.2, 0.1, sx * 0.6, 0.78, -len / 2 - 0.03));
    g.add(bx(M.lightRed, 0.42, 0.2, 0.1, sx * 0.6, 0.78, len / 2 + 0.03));
    for (const sz of [-1, 1]) {
      const wheel = cyl(M.tire, 0.34, 0.26, sx * 0.92, 0.34, sz * len * 0.31, 8);
      wheel.rotation.z = Math.PI / 2;
      g.add(wheel);
    }
  }
  return g;
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
    const w = new THREE.Mesh(TORUS, M.bikeDark);
    w.position.set(0, 0.36, z);
    bike.add(w);
    const spokes = bx(M.chrome, 0.03, 0.62, 0.03, 0, 0.36, z);
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
  head.add(bx(M.cap, 0.24, 0.05, 0.2, 0, 0.11, -0.2));

  // Satchel on the back -- the papers you are actually carrying.
  const bag = bx(M.bag, 0.42, 0.3, 0.2, 0, 0.16, 0.23);
  torso.add(bag);
  torso.add(bx(M.bagStrap, 0.44, 0.09, 0.22, 0, 0.28, 0.23));
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

export function makeReticle(M) {
  const m = plane(M.reticle, 1.4, 1.4, 0, 0, 0);
  m.renderOrder = 900;
  return m;
}

export { clamp };
