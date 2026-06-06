// One-off: make the white BACKGROUND of an RGBA PNG transparent via an
// edge flood-fill (so white inside the mark is preserved). No external deps —
// decodes/encodes PNG with built-in zlib. Usage: node white-to-transparent.cjs in.png out.png
const fs = require('fs'), zlib = require('zlib')

// ── CRC32 (PNG) ──
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const t = Buffer.from(type, 'ascii'); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, crc]) }

function paeth(a, b, c) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c }

function decode(buf) {
  let off = 8, idat = [], W = 0, H = 0, bd = 0, ct = 0
  while (off < buf.length) {
    const len = buf.readUInt32BE(off); const type = buf.slice(off + 4, off + 8).toString('ascii')
    const data = buf.slice(off + 8, off + 8 + len)
    if (type === 'IHDR') { W = data.readUInt32BE(0); H = data.readUInt32BE(4); bd = data[8]; ct = data[9] }
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    off += 12 + len
  }
  if (ct !== 6 || bd !== 8) throw new Error(`unsupported PNG (colortype ${ct}, bitdepth ${bd}); need RGBA8`)
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const bpp = 4, stride = W * bpp
  const px = Buffer.alloc(H * stride)
  for (let y = 0; y < H; y++) {
    const ft = raw[y * (stride + 1)]
    const inRow = y * (stride + 1) + 1, outRow = y * stride
    for (let i = 0; i < stride; i++) {
      const x = raw[inRow + i]
      const a = i >= bpp ? px[outRow + i - bpp] : 0
      const b = y > 0 ? px[outRow - stride + i] : 0
      const c = y > 0 && i >= bpp ? px[outRow - stride + i - bpp] : 0
      let v
      switch (ft) { case 0: v = x; break; case 1: v = x + a; break; case 2: v = x + b; break; case 3: v = x + ((a + b) >> 1); break; case 4: v = x + paeth(a, b, c); break; default: throw new Error('bad filter ' + ft) }
      px[outRow + i] = v & 0xFF
    }
  }
  return { W, H, px }
}

function encode(W, H, px) {
  const stride = W * 4, out = Buffer.alloc(H * (stride + 1))
  for (let y = 0; y < H; y++) { out[y * (stride + 1)] = 0; px.copy(out, y * (stride + 1) + 1, y * stride, y * stride + stride) }
  const idat = zlib.deflateSync(out, { level: 9 })
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

// Edge flood-fill: any near-white, opaque pixel reachable from the border
// becomes transparent. Interior white (enclosed by the mark) is untouched.
function clearWhiteBackground(W, H, px, thr = 244) {
  const isWhite = (idx) => px[idx] >= thr && px[idx + 1] >= thr && px[idx + 2] >= thr && px[idx + 3] > 0
  const seen = new Uint8Array(W * H)
  const stack = []
  const pushIf = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const p = y * W + x; if (seen[p]) return; if (isWhite(p * 4)) { seen[p] = 1; stack.push(p) } }
  for (let x = 0; x < W; x++) { pushIf(x, 0); pushIf(x, H - 1) }
  for (let y = 0; y < H; y++) { pushIf(0, y); pushIf(W - 1, y) }
  let cleared = 0
  while (stack.length) {
    const p = stack.pop(); px[p * 4 + 3] = 0; cleared++
    const x = p % W, y = (p / W) | 0
    pushIf(x + 1, y); pushIf(x - 1, y); pushIf(x, y + 1); pushIf(x, y - 1)
  }
  return cleared
}

// Global mode: clear EVERY near-white opaque pixel (not just edge-connected) —
// for line-art logos with no intentional white fill, so enclosed white (letter
// counters in o/o/p, the house interior) also goes transparent.
function clearWhiteGlobal(W, H, px, thr = 244) {
  let cleared = 0
  for (let i = 0; i < W * H; i++) {
    const o = i * 4
    if (px[o] >= thr && px[o + 1] >= thr && px[o + 2] >= thr && px[o + 3] > 0) { px[o + 3] = 0; cleared++ }
  }
  return cleared
}

const [, , inPath, outPath, mode] = process.argv
const { W, H, px } = decode(fs.readFileSync(inPath))
const cleared = mode === 'global' ? clearWhiteGlobal(W, H, px) : clearWhiteBackground(W, H, px)
fs.writeFileSync(outPath, encode(W, H, px))
console.log(`${inPath} -> ${outPath} [${mode || 'edge'}]: ${W}x${H}, cleared ${cleared} white px (${((cleared / (W * H)) * 100).toFixed(1)}%)`)
