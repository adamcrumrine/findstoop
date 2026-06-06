// One-off: regenerate favicons + PWA app icons from the square Stoop logo.
// Zero deps — decodes/encodes PNG with built-in zlib and resamples with an
// alpha-premultiplied area filter (clean edges on the transparent logo, good
// downscales for the 16/32px favicons). Run: node scripts/generate-icons.cjs
const fs = require('fs'), zlib = require('zlib'), path = require('path')

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
const crc32 = (buf) => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 }
const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const t = Buffer.from(type, 'ascii'); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([l, t, data, c]) }
const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c }

function decode(buf) {
  let off = 8, idat = [], W = 0, H = 0, bd = 0, ct = 0
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.slice(off + 4, off + 8).toString('ascii'), data = buf.slice(off + 8, off + 8 + len)
    if (type === 'IHDR') { W = data.readUInt32BE(0); H = data.readUInt32BE(4); bd = data[8]; ct = data[9] }
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    off += 12 + len
  }
  if (ct !== 6 || bd !== 8) throw new Error(`need RGBA8 (got colortype ${ct}, bitdepth ${bd})`)
  const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = 4, stride = W * bpp, px = Buffer.alloc(H * stride)
  for (let y = 0; y < H; y++) {
    const ft = raw[y * (stride + 1)], inRow = y * (stride + 1) + 1, outRow = y * stride
    for (let i = 0; i < stride; i++) {
      const x = raw[inRow + i], a = i >= bpp ? px[outRow + i - bpp] : 0, b = y > 0 ? px[outRow - stride + i] : 0, c = y > 0 && i >= bpp ? px[outRow - stride + i - bpp] : 0
      let v; switch (ft) { case 0: v = x; break; case 1: v = x + a; break; case 2: v = x + b; break; case 3: v = x + ((a + b) >> 1); break; case 4: v = x + paeth(a, b, c); break; default: throw new Error('bad filter ' + ft) }
      px[outRow + i] = v & 0xFF
    }
  }
  return { W, H, px }
}

function encode(W, H, px) {
  const stride = W * 4, out = Buffer.alloc(H * (stride + 1))
  for (let y = 0; y < H; y++) { out[y * (stride + 1)] = 0; px.copy(out, y * (stride + 1) + 1, y * stride, y * stride + stride) }
  const idat = zlib.deflateSync(out, { level: 9 }), ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

// Alpha-premultiplied area resample (handles up/downscale; premultiply avoids
// color fringing from transparent pixels).
function resize(srcW, srcH, src, dstW, dstH) {
  const dst = Buffer.alloc(dstW * dstH * 4), sx = srcW / dstW, sy = srcH / dstH
  for (let dy = 0; dy < dstH; dy++) {
    const y0 = dy * sy, y1 = (dy + 1) * sy, iy0 = Math.floor(y0), iy1 = Math.min(srcH - 1, Math.ceil(y1) - 1)
    for (let dx = 0; dx < dstW; dx++) {
      const x0 = dx * sx, x1 = (dx + 1) * sx, ix0 = Math.floor(x0), ix1 = Math.min(srcW - 1, Math.ceil(x1) - 1)
      let r = 0, g = 0, b = 0, a = 0, wsum = 0
      for (let yy = iy0; yy <= iy1; yy++) {
        const wy = Math.min(y1, yy + 1) - Math.max(y0, yy); if (wy <= 0) continue
        for (let xx = ix0; xx <= ix1; xx++) {
          const wx = Math.min(x1, xx + 1) - Math.max(x0, xx); if (wx <= 0) continue
          const w = wx * wy, i = (yy * srcW + xx) * 4, al = src[i + 3] / 255
          r += src[i] * al * w; g += src[i + 1] * al * w; b += src[i + 2] * al * w; a += src[i + 3] * w; wsum += w
        }
      }
      const di = (dy * dstW + dx) * 4
      if (wsum > 0) {
        const aa = a / wsum, alpha = aa / 255
        dst[di] = alpha > 0 ? Math.min(255, Math.round(r / wsum / alpha)) : 0
        dst[di + 1] = alpha > 0 ? Math.min(255, Math.round(g / wsum / alpha)) : 0
        dst[di + 2] = alpha > 0 ? Math.min(255, Math.round(b / wsum / alpha)) : 0
        dst[di + 3] = Math.round(aa)
      }
    }
  }
  return dst
}

const root = path.resolve(__dirname, '..', 'apps', 'web', 'public')
const { W, H, px } = decode(fs.readFileSync(path.join(root, 'stoop_logo_square_trans.png')))
const targets = [
  ['favicon-16x16.png', 16], ['favicon-32x32.png', 32], ['apple-touch-icon.png', 180],
  ['icons/icon-72x72.png', 72], ['icons/icon-96x96.png', 96], ['icons/icon-128x128.png', 128],
  ['icons/icon-144x144.png', 144], ['icons/icon-152x152.png', 152], ['icons/icon-192x192.png', 192],
  ['icons/icon-384x384.png', 384], ['icons/icon-512x512.png', 512],
]
fs.mkdirSync(path.join(root, 'icons'), { recursive: true })
for (const [rel, size] of targets) {
  fs.writeFileSync(path.join(root, rel), encode(size, size, resize(W, H, px, size, size)))
  console.log(`wrote ${rel} (${size}x${size})`)
}
console.log(`source: ${W}x${H}`)
