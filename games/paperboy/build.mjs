// Bundles the game and its fonts into one self-contained HTML file.
//
//   dist/paperboy.html  -- artifact payload (no <html>/<head>/<body> wrapper)
//   dist/preview.html   -- the same content in a full document, for local runs
//
// Nothing is fetched at runtime: three.js is bundled and the two typefaces are
// subset webfonts inlined as data URIs.

import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const p = (...s) => resolve(here, ...s);

const FONTS = [
  { file: 'anton.woff2', family: 'Anton', weight: 400 },
  { file: 'plex-mono-500.woff2', family: 'IBM Plex Mono', weight: 500 },
  { file: 'plex-mono-700.woff2', family: 'IBM Plex Mono', weight: 700 },
];

async function fontCss() {
  const blocks = [];
  for (const f of FONTS) {
    const b64 = (await readFile(p('assets/fonts', f.file))).toString('base64');
    blocks.push(
      `@font-face {\n` +
      `  font-family: '${f.family}';\n` +
      `  font-style: normal;\n` +
      `  font-weight: ${f.weight};\n` +
      `  font-display: block;\n` +
      `  src: url(data:font/woff2;base64,${b64}) format('woff2');\n` +
      `}`
    );
  }
  return blocks.join('\n');
}

const result = await build({
  entryPoints: [p('src/main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  legalComments: 'none',
  write: false,
  logLevel: 'info',
});

const js = result.outputFiles[0].text;
const shell = await readFile(p('src/shell.html'), 'utf8');

const page = shell.replace('__FONTS__', await fontCss())
  + `\n<script>\n${js}\n</script>\n`;

await mkdir(p('dist'), { recursive: true });
await writeFile(p('dist/paperboy.html'), page);

const preview = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
</head>
<body>
${page}
</body>
</html>
`;
await writeFile(p('dist/preview.html'), preview);

const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(`\n  bundle  ${kb(js)}\n  page    ${kb(page)}\n`);
