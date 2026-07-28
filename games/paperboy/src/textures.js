// Every texture in the game is drawn at runtime on a 2D canvas at N64-era
// sizes (32-128px) and then bilinear-filtered with mipmaps. That soft, slightly
// smeared look is the console's signature -- crunchy nearest-neighbour pixels
// read as PlayStation, not Nintendo 64.

import * as THREE from 'three';
import { mulberry32 } from './util.js';

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h == null ? w : h;
  return c;
}

function finish(canvas, rx, ry, opts = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx == null ? 1 : rx, ry == null ? 1 : ry);
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 1;
  t.needsUpdate = true;
  return t;
}

function grain(ctx, w, h, count, rng, colors, size) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    const s = size ? size[0] + rng() * (size[1] - size[0]) : 1;
    ctx.fillRect(rng() * w, rng() * h, s, s);
  }
}

function asphalt() {
  const c = cv(128);
  const x = c.getContext('2d');
  const rng = mulberry32(7);
  x.fillStyle = '#3a3d48';
  x.fillRect(0, 0, 128, 128);
  grain(x, 128, 128, 2600, rng, ['#454956', '#33363f', '#4d515e', '#2e3039'], [1, 3]);
  // Patched-over crack running down the lane.
  x.strokeStyle = '#2b2d36';
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(18, 0);
  x.bezierCurveTo(26, 40, 10, 80, 22, 128);
  x.stroke();
  // Centre line: one dash per tile, so the dashes stay evenly spaced forever.
  x.fillStyle = '#c9a227';
  x.fillRect(62, 20, 4, 52);
  // Edge lines just inside the gutter.
  x.fillStyle = '#b9bcc4';
  x.fillRect(4, 0, 3, 128);
  x.fillRect(121, 0, 3, 128);
  return c;
}

function sidewalk() {
  const c = cv(64);
  const x = c.getContext('2d');
  const rng = mulberry32(19);
  x.fillStyle = '#9a9ba3';
  x.fillRect(0, 0, 64, 64);
  grain(x, 64, 64, 900, rng, ['#a4a5ad', '#909199', '#adaeb6'], [1, 2]);
  x.fillStyle = '#7d7e86';
  x.fillRect(0, 0, 64, 2); // expansion joint
  return c;
}

function grass() {
  const c = cv(64);
  const x = c.getContext('2d');
  const rng = mulberry32(31);
  x.fillStyle = '#4c7a4b';
  x.fillRect(0, 0, 64, 64);
  // Mower stripes -- the thing that actually reads as "suburban lawn".
  for (let i = 0; i < 64; i += 16) {
    x.fillStyle = 'rgba(255,255,255,0.05)';
    x.fillRect(i, 0, 8, 64);
  }
  grain(x, 64, 64, 1400, rng, ['#568a54', '#446f43', '#5f9459', '#3d6440'], [1, 2]);
  return c;
}

function siding() {
  const c = cv(64);
  const x = c.getContext('2d');
  const rng = mulberry32(43);
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 8) {
    x.fillStyle = 'rgba(0,0,0,0.16)';
    x.fillRect(0, y, 64, 1);
    x.fillStyle = 'rgba(255,255,255,0.5)';
    x.fillRect(0, y + 1, 64, 2);
  }
  grain(x, 64, 64, 300, rng, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.3)'], [1, 2]);
  return c;
}

function shingle() {
  const c = cv(64);
  const x = c.getContext('2d');
  const rng = mulberry32(57);
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, 64, 64);
  for (let row = 0; row < 8; row++) {
    const y = row * 8;
    const off = row % 2 ? 8 : 0;
    for (let i = -1; i < 5; i++) {
      const tx = i * 16 + off;
      x.fillStyle = rng() > 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.03)';
      x.fillRect(tx + 1, y + 1, 14, 6);
    }
    x.fillStyle = 'rgba(0,0,0,0.30)';
    x.fillRect(0, y + 7, 64, 1);
  }
  return c;
}

function brick() {
  const c = cv(64);
  const x = c.getContext('2d');
  const rng = mulberry32(71);
  x.fillStyle = '#cfc7bb';
  x.fillRect(0, 0, 64, 64);
  for (let row = 0; row < 8; row++) {
    const y = row * 8;
    const off = row % 2 ? 8 : 0;
    for (let i = -1; i < 5; i++) {
      const shade = 0.6 + rng() * 0.4;
      x.fillStyle = `rgba(${Math.round(150 * shade)},${Math.round(80 * shade)},${Math.round(66 * shade)},1)`;
      x.fillRect(i * 16 + off + 1, y + 1, 14, 6);
    }
  }
  return c;
}

function windowTex(broken) {
  const c = cv(64);
  const x = c.getContext('2d');
  // Frame.
  x.fillStyle = '#efeae0';
  x.fillRect(0, 0, 64, 64);
  // Glass with a low dawn-sky reflection.
  const g = x.createLinearGradient(0, 6, 0, 58);
  g.addColorStop(0, '#8fa9c6');
  g.addColorStop(0.55, '#b9c9dc');
  g.addColorStop(1, '#5d6f86');
  x.fillStyle = g;
  x.fillRect(6, 6, 52, 52);
  // Muntins.
  x.fillStyle = '#efeae0';
  x.fillRect(30, 6, 4, 52);
  x.fillRect(6, 30, 52, 4);
  // A single specular streak sells the glass at low resolution.
  x.strokeStyle = 'rgba(255,255,255,0.55)';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(10, 52);
  x.lineTo(34, 10);
  x.stroke();

  if (broken) {
    const rng = mulberry32(2024);
    // Radial fracture: spokes out from the impact, a jagged hole punched
    // through the middle, and the surviving shards left catching the light.
    const spokes = 11;
    const ang = [];
    for (let i = 0; i < spokes; i++) ang.push((i / spokes) * Math.PI * 2 + rng() * 0.3);
    const holeR = [];
    for (let i = 0; i < spokes; i++) holeR.push(9 + rng() * 9);

    // The dark hole itself, with a ragged edge.
    x.fillStyle = '#14151a';
    x.beginPath();
    for (let i = 0; i < spokes; i++) {
      const px = 32 + Math.cos(ang[i]) * holeR[i];
      const py = 32 + Math.sin(ang[i]) * holeR[i];
      x[i ? 'lineTo' : 'moveTo'](px, py);
    }
    x.closePath();
    x.fill();

    // Shards still in the frame: alternating bright and shadowed facets so
    // the remaining glass reads as broken rather than merely dirty.
    for (let i = 0; i < spokes; i++) {
      const a1 = ang[i];
      const a2 = ang[(i + 1) % spokes];
      const outer = 27 + rng() * 3;
      x.beginPath();
      x.moveTo(32 + Math.cos(a1) * holeR[i], 32 + Math.sin(a1) * holeR[i]);
      x.lineTo(32 + Math.cos(a1) * outer, 32 + Math.sin(a1) * outer);
      x.lineTo(32 + Math.cos(a2) * outer, 32 + Math.sin(a2) * outer);
      x.lineTo(32 + Math.cos(a2) * holeR[(i + 1) % spokes], 32 + Math.sin(a2) * holeR[(i + 1) % spokes]);
      x.closePath();
      x.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.42)'
        : i % 3 === 1 ? 'rgba(40,54,72,0.5)' : 'rgba(196,220,240,0.22)';
      x.fill();
    }

    // Fracture lines: radial cracks plus a couple of concentric ones.
    x.strokeStyle = 'rgba(16,17,22,0.9)';
    x.lineWidth = 1.6;
    for (let i = 0; i < spokes; i++) {
      x.beginPath();
      x.moveTo(32 + Math.cos(ang[i]) * 3, 32 + Math.sin(ang[i]) * 3);
      x.lineTo(32 + Math.cos(ang[i]) * (28 + rng() * 4), 32 + Math.sin(ang[i]) * (28 + rng() * 4));
      x.stroke();
    }
    x.lineWidth = 1.1;
    for (const r of [14, 21]) {
      x.beginPath();
      for (let i = 0; i <= spokes; i++) {
        const a = ang[i % spokes];
        const rr = r + rng() * 3;
        x[i ? 'lineTo' : 'moveTo'](32 + Math.cos(a) * rr, 32 + Math.sin(a) * rr);
      }
      x.stroke();
    }
    // A few bright glints on shard edges.
    x.strokeStyle = 'rgba(255,255,255,0.75)';
    x.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2;
      const r0 = 12 + rng() * 12;
      x.beginPath();
      x.moveTo(32 + Math.cos(a) * r0, 32 + Math.sin(a) * r0);
      x.lineTo(32 + Math.cos(a + 0.5) * (r0 + 5), 32 + Math.sin(a + 0.5) * (r0 + 5));
      x.stroke();
    }
    // Keep the frame intact around the hole.
    x.fillStyle = '#efeae0';
    x.fillRect(0, 0, 64, 6);
    x.fillRect(0, 58, 64, 6);
    x.fillRect(0, 0, 6, 64);
    x.fillRect(58, 0, 6, 64);
  }
  return c;
}

function door() {
  const c = cv(64);
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, 64, 64);
  x.fillStyle = 'rgba(0,0,0,0.18)';
  x.fillRect(8, 6, 20, 22);
  x.fillRect(36, 6, 20, 22);
  x.fillRect(8, 34, 20, 24);
  x.fillRect(36, 34, 20, 24);
  x.fillStyle = '#d8b45a';
  x.beginPath();
  x.arc(52, 32, 3, 0, Math.PI * 2);
  x.fill();
  return c;
}

function leaves() {
  const c = cv(64);
  const x = c.getContext('2d');
  const rng = mulberry32(97);
  x.clearRect(0, 0, 64, 64);
  for (let i = 0; i < 90; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.pow(rng(), 0.6) * 27;
    const px = 32 + Math.cos(a) * r;
    const py = 32 + Math.sin(a) * r * 0.95;
    const s = 5 + rng() * 8;
    const t = rng();
    x.fillStyle = t > 0.62 ? '#6ea052' : t > 0.3 ? '#4f7c43' : '#3c6238';
    x.beginPath();
    x.ellipse(px, py, s, s * 0.8, a, 0, Math.PI * 2);
    x.fill();
  }
  return c;
}

function newsprint() {
  const c = cv(32);
  const x = c.getContext('2d');
  x.fillStyle = '#e8e4d8';
  x.fillRect(0, 0, 32, 32);
  x.fillStyle = '#c8352b';
  x.fillRect(3, 3, 26, 4);
  x.fillStyle = 'rgba(30,30,36,0.55)';
  for (let y = 11; y < 29; y += 3) x.fillRect(3, y, 26, 1);
  x.fillStyle = 'rgba(30,30,36,0.8)';
  x.fillRect(3, 9, 15, 1);
  return c;
}

function blob() {
  const c = cv(64);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return c;
}

function ring() {
  const c = cv(64);
  const x = c.getContext('2d');
  x.clearRect(0, 0, 64, 64);
  x.strokeStyle = '#ffffff';
  x.lineWidth = 6;
  x.beginPath();
  x.arc(32, 32, 22, 0, Math.PI * 2);
  x.stroke();
  // Corner ticks turn a plain circle into something that reads as a reticle.
  x.lineWidth = 5;
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    x.beginPath();
    x.moveTo(32 + Math.cos(a) * 13, 32 + Math.sin(a) * 13);
    x.lineTo(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30);
    x.stroke();
  }
  return c;
}

function chevron() {
  const c = cv(64);
  const x = c.getContext('2d');
  x.clearRect(0, 0, 64, 64);
  x.fillStyle = '#ffffff';
  x.beginPath();
  x.moveTo(32, 54);
  x.lineTo(6, 18);
  x.lineTo(19, 10);
  x.lineTo(32, 32);
  x.lineTo(45, 10);
  x.lineTo(58, 18);
  x.closePath();
  x.fill();
  return c;
}

function cloud() {
  const c = cv(64, 32);
  const x = c.getContext('2d');
  const rng = mulberry32(113);
  x.clearRect(0, 0, 64, 32);
  for (let i = 0; i < 16; i++) {
    const px = 8 + rng() * 48;
    const py = 14 + rng() * 10;
    const r = 5 + rng() * 8;
    const g = x.createRadialGradient(px, py, 1, px, py, r);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  return c;
}

function glow() {
  const c = cv(64);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 1, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,244,214,1)');
  g.addColorStop(0.25, 'rgba(255,214,138,0.85)');
  g.addColorStop(1, 'rgba(255,180,110,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return c;
}

// The sun needs a defined edge; a plain radial falloff just reads as a smudge.
function sunDisc() {
  const c = cv(64);
  const x = c.getContext('2d');
  const halo = x.createRadialGradient(32, 32, 6, 32, 32, 32);
  halo.addColorStop(0, 'rgba(255,224,170,0.85)');
  halo.addColorStop(0.5, 'rgba(255,186,120,0.22)');
  halo.addColorStop(1, 'rgba(255,170,110,0)');
  x.fillStyle = halo;
  x.fillRect(0, 0, 64, 64);
  const core = x.createRadialGradient(32, 32, 1, 32, 32, 11);
  core.addColorStop(0, 'rgba(255,252,238,1)');
  core.addColorStop(0.72, 'rgba(255,238,196,0.98)');
  core.addColorStop(1, 'rgba(255,214,150,0)');
  x.fillStyle = core;
  x.fillRect(0, 0, 64, 64);
  return c;
}

function water() {
  const c = cv(32);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(16, 16, 1, 16, 16, 16);
  g.addColorStop(0, 'rgba(226,242,255,0.95)');
  g.addColorStop(1, 'rgba(160,200,235,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
  return c;
}

function crosswalk() {
  const c = cv(64);
  const x = c.getContext('2d');
  x.clearRect(0, 0, 64, 64);
  x.fillStyle = 'rgba(232,232,228,0.9)';
  for (let i = 2; i < 64; i += 12) x.fillRect(i, 2, 7, 60);
  return c;
}

function bird() {
  const c = cv(32, 16);
  const x = c.getContext('2d');
  x.clearRect(0, 0, 32, 16);
  x.strokeStyle = 'rgba(38,42,52,0.85)';
  x.lineWidth = 2.4;
  x.lineCap = 'round';
  x.beginPath();
  x.moveTo(3, 5);
  x.quadraticCurveTo(9, 12, 16, 6);
  x.quadraticCurveTo(23, 12, 29, 5);
  x.stroke();
  return c;
}

function stopFace() {
  const c = cv(64);
  const x = c.getContext('2d');
  x.clearRect(0, 0, 64, 64);
  x.fillStyle = '#b8302a';
  x.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    x[i ? 'lineTo' : 'moveTo'](32 + Math.cos(a) * 31, 32 + Math.sin(a) * 31);
  }
  x.closePath();
  x.fill();
  x.strokeStyle = '#f0ece2';
  x.lineWidth = 3;
  x.stroke();
  x.fillStyle = '#f0ece2';
  x.font = 'bold 21px sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('STOP', 32, 34);
  return c;
}

function capLogo() {
  const c = cv(64, 32);
  const x = c.getContext('2d');
  x.clearRect(0, 0, 64, 32);
  x.fillStyle = '#20252e';
  x.font = 'bold 25px Georgia, serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('PB', 32, 17);
  return c;
}

function shard() {
  const c = cv(32);
  const x = c.getContext('2d');
  x.clearRect(0, 0, 32, 32);
  x.fillStyle = 'rgba(214,236,252,0.92)';
  x.beginPath();
  x.moveTo(16, 1);
  x.lineTo(29, 20);
  x.lineTo(12, 30);
  x.closePath();
  x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.95)';
  x.lineWidth = 2;
  x.stroke();
  return c;
}

// The dome is a full sphere, so v = 0.5 is the horizon line -- a scene's
// bright band has to sit right on it or the sunrise ends up buried under the
// ground.
export function makeSkyTexture(stops) {
  const c = cv(4, 256);
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  for (const [at, col] of stops) g.addColorStop(at, col);
  x.fillStyle = g;
  x.fillRect(0, 0, 4, 256);
  const t = finish(c, 1, 1);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

const DAWN_STOPS = [
  [0.00, '#1d3563'], [0.22, '#48699b'], [0.38, '#8aa5c4'], [0.455, '#c2b3ac'],
  [0.492, '#f0a55c'], [0.505, '#ffcd92'], [0.55, '#f0b782'], [1.00, '#e0a877'],
];

function sky() {
  const c = cv(4, 256);
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  for (const [at, col] of DAWN_STOPS) g.addColorStop(at, col);
  x.fillStyle = g;
  x.fillRect(0, 0, 4, 256);
  return c;
}

// A grid of lit and dark windows, for towers seen from a long way off.
function cityWindows() {
  const c = cv(64);
  const x = c.getContext('2d');
  const rng = mulberry32(515);
  x.fillStyle = '#3d4351';
  x.fillRect(0, 0, 64, 64);
  for (let gy = 0; gy < 8; gy++) {
    for (let gx = 0; gx < 8; gx++) {
      const r = rng();
      x.fillStyle = r > 0.72 ? '#ffdc94' : r > 0.5 ? '#8f9db4' : '#333844';
      x.fillRect(gx * 8 + 2, gy * 8 + 2, 4, 5);
    }
  }
  return c;
}

export function makeTextures() {
  const t = {
    asphalt: finish(asphalt(), 1, 1),
    sidewalk: finish(sidewalk(), 1, 1),
    grass: finish(grass(), 1, 1),
    siding: finish(siding(), 1, 1),
    shingle: finish(shingle(), 1, 1),
    brick: finish(brick(), 1, 1),
    window: finish(windowTex(false), 1, 1),
    windowBroken: finish(windowTex(true), 1, 1),
    door: finish(door(), 1, 1),
    leaves: finish(leaves(), 1, 1),
    newsprint: finish(newsprint(), 1, 1),
    blob: finish(blob(), 1, 1),
    ring: finish(ring(), 1, 1),
    chevron: finish(chevron(), 1, 1),
    cloud: finish(cloud(), 1, 1),
    glow: finish(glow(), 1, 1),
    sunDisc: finish(sunDisc(), 1, 1),
    crosswalk: finish(crosswalk(), 1, 1),
    bird: finish(bird(), 1, 1),
    stopFace: finish(stopFace(), 1, 1),
    capLogo: finish(capLogo(), 1, 1),
    cityWindows: finish(cityWindows(), 1, 1),
    shard: finish(shard(), 1, 1),
    water: finish(water(), 1, 1),
    sky: finish(sky(), 1, 1),
  };
  // Sprites and cards must not tile across their own edges.
  for (const k of ['window', 'windowBroken', 'door', 'leaves', 'blob', 'ring', 'chevron',
    'cloud', 'glow', 'sunDisc', 'water', 'newsprint', 'sky', 'bird', 'stopFace',
    'capLogo', 'shard']) {
    t[k].wrapS = t[k].wrapT = THREE.ClampToEdgeWrapping;
    t[k].needsUpdate = true;
  }
  return t;
}
