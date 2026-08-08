// Regenerate the derived brand assets from the two master logos.
//
// Everything here is DERIVED. Edit the masters in apps/web/public and re-run;
// never hand-edit the outputs, or the next run silently reverts you.
//
//   og-image.png       1200x630 social card
//   favicon.ico        16/32/48 multi-resolution, for crawlers and older
//                      clients that request /favicon.ico directly rather than
//                      reading the <link> tags
//   stoop-mark.svg     monochrome vector of the square mark
//   stoop-mark-3d.svg  shaded vector of the square mark   [--trace only]
//
// On the vectors: the masters are raster. Quantise-then-trace (imagetracerjs)
// turns the ribbon's shading into speckle and is not worth having. potrace's
// posterize does hold it — it fits nested curves per luminance band — and since
// it emits a stack of black paths at rising opacity, recolouring that stack to
// one brand teal reproduces the shading as a tonal ramp. That is what
// stoop-mark-3d.svg is: 9KB, clean edges, real depth.
//
// The posterize pass takes minutes, so it sits behind --trace and its outputs
// are committed. Everything else runs in a second.
//
// Usage: node scripts/build-brand-assets.mjs [--trace]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import potrace from 'potrace';
import pngToIcoModule from 'png-to-ico';
import { Resvg } from '@resvg/resvg-js';
import { optimize } from 'svgo';

const pngToIco = pngToIcoModule.default ?? pngToIcoModule;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'apps/web/public');

const HORIZONTAL = path.join(PUBLIC, 'stoop_logo_horizontal_trans.png');
const SQUARE = path.join(PUBLIC, 'stoop_logo_square_trans.png');

const TAGLINE = 'Property management built for landlords with a handful of units';
const NAVY = '#304250'; // sampled from the wordmark
const TEAL = '#008275'; // brand 500

const kb = (n) => `${(n / 1024).toFixed(0)}KB`;

// ── Social card ─────────────────────────────────────────────────────────
// Composed as SVG and rasterised, so the text stays real text until the last
// step. The logo is placed at 700px wide — DOWN from its native width, because
// there is no vector master and anything larger would soften.
async function buildOgImage() {
  // The master carries its own transparent margin; trimming to the ink bounds
  // is what makes the spacing below mean anything.
  const trimmed = await sharp(HORIZONTAL).trim().png().toBuffer();
  const { width, height } = await sharp(trimmed).metadata();

  const W = 1200, H = 630, BAR = 12;
  const logoW = 700;
  const logoH = Math.round((logoW * height) / width);
  const gap = 54;
  const textH = 44;
  // +16 optical: a text box is taller than its glyphs, so geometric centring
  // leaves the composition visibly high in the frame.
  const top = Math.round((H - BAR - (logoH + gap + textH)) / 2) + 16;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <image x="${Math.round((W - logoW) / 2)}" y="${top}" width="${logoW}" height="${logoH}"
         xlink:href="data:image/png;base64,${trimmed.toString('base64')}"/>
  <text x="${W / 2}" y="${top + logoH + gap + 33}" text-anchor="middle"
        font-family="Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="33" fill="${NAVY}">${TAGLINE}</text>
  <rect x="0" y="${H - BAR}" width="${W}" height="${BAR}" fill="${TEAL}"/>
</svg>`;

  const png = new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng();
  const out = path.join(PUBLIC, 'og-image.png');
  fs.writeFileSync(out, png);
  console.log(`og-image.png    ${W}x${H}  ${kb(png.length)}`);
  return { W, H };
}

// ── favicon.ico ─────────────────────────────────────────────────────────
async function buildFavicon() {
  const sizes = [16, 32, 48];
  const buffers = await Promise.all(
    sizes.map((s) => sharp(SQUARE).resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()),
  );
  const ico = await pngToIco(buffers);
  const out = path.join(PUBLIC, 'favicon.ico');
  fs.writeFileSync(out, ico);
  console.log(`favicon.ico     ${sizes.join('/')}  ${kb(ico.length)}`);
}

// ── Monochrome vector ───────────────────────────────────────────────────
async function buildMarkSvg() {
  // Flatten onto white first: we want the SHAPE traced, not the shading.
  const flat = await sharp(SQUARE).flatten({ background: '#ffffff' }).png().toBuffer();
  const traced = await new Promise((res, rej) =>
    potrace.trace(flat, { threshold: 245, color: TEAL, background: 'transparent', turdSize: 4 },
      (err, svg) => (err ? rej(err) : res(svg))));
  const svg = optimize(traced, { multipass: true }).data;
  const out = path.join(PUBLIC, 'stoop-mark.svg');
  fs.writeFileSync(out, svg);
  console.log(`stoop-mark.svg  vector  ${kb(Buffer.byteLength(svg))}`);
}

// ── Shaded vector (slow; opt-in) ────────────────────────────────────────
async function buildMark3dSvg() {
  const flat = await sharp(SQUARE).flatten({ background: '#ffffff' }).png().toBuffer();
  const traced = await new Promise((res, rej) =>
    potrace.posterize(flat, { steps: 4, fillStrategy: 'dominant', turdSize: 6, background: 'transparent' },
      (err, svg) => (err ? rej(err) : res(svg))));

  // posterize returns black paths at rising fill-opacity. The raw ramp sums to
  // well under 1, so the mark renders pastel beside the original; scale the
  // bands to restore saturation, then paint the whole stack one teal.
  const BOOST = 1.85;
  let svg = traced.replace(/fill-opacity="([^"]+)"/g,
    (_, v) => `fill-opacity="${Math.min(1, parseFloat(v) * BOOST).toFixed(3)}"`);
  svg = svg.replace(/<path /g, '<path fill="#007366" ');
  // White plate under the stack: without it the light bands let whatever sits
  // behind the logo bleed through.
  svg = svg.replace(/(<svg[^>]*>)/, '$1<rect width="462" height="462" fill="#fff"/>');

  const out = path.join(PUBLIC, 'stoop-mark-3d.svg');
  const optimised = optimize(svg, { multipass: true }).data;
  fs.writeFileSync(out, optimised);
  console.log(`stoop-mark-3d.svg  vector  ${kb(Buffer.byteLength(optimised))}`);
}

const { W, H } = await buildOgImage();
await buildFavicon();
await buildMarkSvg();
if (process.argv.includes('--trace')) await buildMark3dSvg();
console.log(`\nRemember: og:image:width/height in apps/web/index.html must say ${W}x${H}.`);
