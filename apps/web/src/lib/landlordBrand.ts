// Per-landlord runtime branding — layers a landlord's accent color on top of
// the build-time brand (lib/brand.ts) while a tenant is in their portal.
//
// The landlord picks ONE hex color (profiles.brand_color); we derive the full
// 50–900 ramp from it by holding hue/saturation and mapping lightness per
// step, then darken the 500/600 steps until they clear WCAG AA against white
// (4.5:1) — so white-on-500 buttons and 600-on-white links stay readable for
// ANY color the landlord picks. The ramp is written to the same --brand-*
// custom properties applyBrandTheme() sets at boot, so every Tailwind
// `brand-*` utility re-colors automatically. clearLandlordBrand() restores
// the build brand's own palette.

import { BRAND } from './brand'

export type BrandStep = keyof typeof BRAND.colors // '50' | '100' | … | '900'

type Rgb = [number, number, number]
type Hsl = [number, number, number] // h 0–360, s 0–1, l 0–1

// Lightness target per ramp step — tuned to roughly match the shape of the
// hand-built ramps in brand.ts (pale wash at 50, near-black at 900).
const STEP_LIGHTNESS: Record<BrandStep, number> = {
  '50': 0.96,
  '100': 0.9,
  '200': 0.8,
  '300': 0.68,
  '400': 0.55,
  '500': 0.42,
  '600': 0.34,
  '700': 0.27,
  '800': 0.19,
  '900': 0.12,
}

/** WCAG AA contrast floor for the text-carrying steps (500 buttons, 600 links). */
const AA_CONTRAST = 4.5

const WHITE: Rgb = [255, 255, 255]

/** True for a 6-digit hex color like "#2E5984" — the only shape we persist. */
export function isValidBrandHex(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex)
}

export function hexToRgb(hex: string): Rgb {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

/** Space-separated RGB triplet ("0 130 117") → "#008275". For color inputs. */
export function tripletToHex(triplet: string): string {
  const [r, g, b] = triplet.split(' ').map(Number)
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

function rgbToHsl([r, g, b]: Rgb): Hsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l] // achromatic
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
  else if (max === gn) h = ((bn - rn) / d + 2) * 60
  else h = ((rn - gn) / d + 4) * 60
  return [h, s, l]
}

function hslToRgb([h, s, l]: Hsl): Rgb {
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v] // achromatic
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number): number => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const hn = h / 360
  return [
    Math.round(channel(hn + 1 / 3) * 255),
    Math.round(channel(hn) * 255),
    Math.round(channel(hn - 1 / 3) * 255),
  ]
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance([r, g, b]: Rgb): number {
  const lin = (c: number): number => {
    const cn = c / 255
    return cn <= 0.03928 ? cn / 12.92 : Math.pow((cn + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast ratio between two colors, 1–21. Symmetric. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * Derive a full 50–900 accent ramp (space-separated RGB triplets, ready for
 * the --brand-* custom properties) from one hex color.
 *
 * Hue/saturation come from the picked color; lightness follows STEP_LIGHTNESS.
 * The 500 and 600 steps are then darkened in small lightness decrements until
 * white text on them clears 4.5:1 — high-luminance picks (yellows, pastels)
 * would otherwise produce unreadable buttons. Each step is also clamped just
 * below the previous one so the ramp stays monotonically darker even after a
 * big AA correction at 500.
 */
export function deriveBrandRamp(hex: string): Record<BrandStep, string> {
  if (!isValidBrandHex(hex)) throw new Error(`Invalid brand color: ${hex}`)
  const [h, s] = rgbToHsl(hexToRgb(hex))

  const ramp = {} as Record<BrandStep, string>
  let prevL = 1
  for (const [step, target] of Object.entries(STEP_LIGHTNESS) as Array<[BrandStep, number]>) {
    // Keep the ramp descending: never lighter than the step before it.
    let l = Math.min(target, prevL - 0.02)
    let rgb = hslToRgb([h, s, l])
    if (step === '500' || step === '600') {
      while (contrastRatio(rgb, WHITE) < AA_CONTRAST && l > 0) {
        l = Math.max(0, l - 0.01)
        rgb = hslToRgb([h, s, l])
      }
    }
    prevL = l
    ramp[step] = rgb.join(' ')
  }
  return ramp
}

// Minimal element shape so the pure DOM writes are testable without jsdom.
interface StylableRoot {
  style: { setProperty(property: string, value: string): void }
}

/**
 * Push a landlord's derived palettes into the document, overriding the build
 * brand's variables:
 *   • `accent` → --brand-* (buttons, links, the surfaces that were Stoop teal)
 *   • `primary` → --primary-* (portal header, footer, bottom nav — broad shading)
 *
 * `primary` is optional: when absent or invalid it falls back to `accent`, so a
 * landlord who picks a single color still fully brands both roles (unchanged
 * from the one-color behavior). Invalid accent is ignored entirely (the build
 * brand stays in place) so a bad row can never blank the tenant portal.
 */
export function applyLandlordBrand(
  accent: string,
  primary?: string | null,
  root: StylableRoot = document.documentElement,
) {
  if (!isValidBrandHex(accent)) return
  const accentRamp = deriveBrandRamp(accent)
  for (const [step, triplet] of Object.entries(accentRamp)) {
    root.style.setProperty(`--brand-${step}`, triplet)
  }
  // Decorative hero gradient — 500 → 400, mirroring the build brands' shape.
  root.style.setProperty('--brand-grad-from', accentRamp['500'])
  root.style.setProperty('--brand-grad-to', accentRamp['400'])

  const primaryRamp = primary && isValidBrandHex(primary) ? deriveBrandRamp(primary) : accentRamp
  for (const [step, triplet] of Object.entries(primaryRamp)) {
    root.style.setProperty(`--primary-${step}`, triplet)
  }
}

/** Restore the active build brand's own palette (same values applyBrandTheme sets at boot). */
export function clearLandlordBrand(root: StylableRoot = document.documentElement) {
  for (const [step, triplet] of Object.entries(BRAND.colors)) {
    root.style.setProperty(`--brand-${step}`, triplet)
    root.style.setProperty(`--primary-${step}`, triplet)
  }
  root.style.setProperty('--brand-grad-from', BRAND.gradient[0])
  root.style.setProperty('--brand-grad-to', BRAND.gradient[1])
}
