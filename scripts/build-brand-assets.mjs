// Copy and derive the web app's Stoop brand assets from the logo kit.
//
// The kit in assets/logo-pack is the source of truth (see its README). Every
// file this script writes into apps/web/public is DERIVED: replace files in
// the kit and re-run; never hand-edit the outputs, or the next run silently
// reverts you.
//
//   stoop_logo_horizontal.svg        primary lockup with clear space (UI)
//   stoop_logo_horizontal_dark.svg   reversed lockup with clear space
//   stoop_logo_square.svg            the mark alone (spinner, modals)
//   stoop_logo_horizontal_trans.png  raster copies of the above under their
//   stoop_logo_horizontal_trans_dark.png  long-standing names, for JSON-LD and
//   stoop_logo_square_trans.png      anything outside the app that links them
//   favicon.ico, favicon.svg, favicon-16x16.png, favicon-32x32.png
//   apple-touch-icon.png
//   icons/icon-*.png                 PWA icons, from the kit's Android icon
//   icons/icon-maskable-512x512.png  PWA maskable icon
//   icons/icon.svg                   white app icon, vector
//   og-image.png                     1200x630 social card
//
// Usage: node scripts/build-brand-assets.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { Resvg } from '@resvg/resvg-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'apps/web/public');
const KIT = path.join(ROOT, 'assets/logo-pack');

const kit = (p) => path.join(KIT, p);
const svg = (p) => fs.readFileSync(kit(p), 'utf8');
const PRIMARY = svg('svg/horizontal/stoop-horizontal-color.svg');
const REVERSED = svg('svg/horizontal/stoop-horizontal-reversed.svg');
const MARK = svg('svg/mark/stoop-mark-color.svg');

const kb = (n) => `${(n / 1024).toFixed(0)}KB`;
const write = (rel, buf) => {
  const file = path.join(PUBLIC, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  console.log(`${rel.padEnd(40)} ${kb(buf.length)}`);
};
const copy = (from, to) => write(to, fs.readFileSync(kit(from)));

const render = (src, width) => Buffer.from(new Resvg(src, { fitTo: { mode: 'width', value: width } }).render().asPng());

// The kit's lockups are cropped tight to the ink. Every call site sizes the
// logo by height (h-8, h-10, h-14…), tuned for artwork that carried its own
// clear space, so the in-app copies get it back: 15% of the height above and
// below.
const withClearSpace = (src, ratio = 0.15) =>
  src.replace(/viewBox="([^"]+)"/, (_, vb) => {
    const [x, y, w, h] = vb.split(/\s+/).map(Number);
    const pad = (h * ratio) / (1 - 2 * ratio);
    const r = (n) => +n.toFixed(2);
    return `viewBox="${r(x)} ${r(y - pad)} ${r(w)} ${r(h + 2 * pad)}"`;
  });

// The mark is wider than tall; centre it on a transparent square.
async function squarePng(src, size, padding = 0.08) {
  const inner = Math.round(size * (1 - 2 * padding));
  const edge = Math.round(size * padding);
  return sharp(render(src, inner))
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: edge, bottom: size - inner - edge, left: edge, right: size - inner - edge, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

// ── UI logos ────────────────────────────────────────────────────────────
write('stoop_logo_horizontal.svg', Buffer.from(withClearSpace(PRIMARY)));
write('stoop_logo_horizontal_dark.svg', Buffer.from(withClearSpace(REVERSED)));
write('stoop_logo_square.svg', Buffer.from(MARK));
write('stoop_logo_horizontal_trans.png', render(withClearSpace(PRIMARY), 1600));
write('stoop_logo_horizontal_trans_dark.png', render(withClearSpace(REVERSED), 1600));
write('stoop_logo_square_trans.png', await squarePng(MARK, 512));

// ── Favicons, touch and PWA icons: the kit's own ────────────────────────
copy('web/favicon.ico', 'favicon.ico');
copy('web/favicon.svg', 'favicon.svg');
copy('web/favicon-16.png', 'favicon-16x16.png');
copy('web/favicon-32.png', 'favicon-32x32.png');
copy('web/apple-touch-icon.png', 'apple-touch-icon.png');
copy('web/maskable-512.png', 'icons/icon-maskable-512x512.png');
copy('web/android-chrome-192.png', 'icons/icon-192x192.png');
copy('web/android-chrome-512.png', 'icons/icon-512x512.png');
// Sizes the kit doesn't ship, scaled down from its 512.
for (const s of [72, 96, 128, 144, 152, 384]) {
  write(`icons/icon-${s}x${s}.png`, await sharp(kit('web/android-chrome-512.png')).resize(s, s).png().toBuffer());
}
copy('app-icon/stoop-app-icon-white.svg', 'icons/icon.svg');

// ── Social card ─────────────────────────────────────────────────────────
copy('social/stoop-og-image-light-1200x630.png', 'og-image.png');
console.log('\nRemember: og:image:width/height in apps/web/index.html must say 1200x630.');
