// Small math + RNG helpers shared across the game.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);

// Frame-rate independent approach-toward. `l` is a rate, not a fraction.
export const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

export function range(rng, a, b) {
  return a + rng() * (b - a);
}

// Axis-aligned box hit test with a per-axis pad, used for paper-vs-target.
export function inBox(px, py, pz, b, pad) {
  return (
    px > b.x0 - pad && px < b.x1 + pad &&
    py > b.y0 - pad && py < b.y1 + pad &&
    pz > b.z0 - pad && pz < b.z1 + pad
  );
}

export function box(cx, cy, cz, sx, sy, sz) {
  return {
    x0: cx - sx / 2, x1: cx + sx / 2,
    y0: cy - sy / 2, y1: cy + sy / 2,
    z0: cz - sz / 2, z1: cz + sz / 2,
  };
}

export function formatScore(n) {
  return Math.max(0, Math.round(n)).toString().padStart(6, '0');
}
