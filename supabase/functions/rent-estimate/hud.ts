// HUD Small Area Fair Market Rents (SAFMR) — ZIP-level rent by bedroom count.
// Free, public-domain data; requires a HUD USER access token (Bearer).
//
// Used two ways:
//   • as the baseline when ACS has no usable local sample, and
//   • always as a guardrail floor for the calculation engine.
//
// The FMR API returns either metro-level FMRs (object) or, in SAFMR-designated
// metros, an array of per-ZIP records. We handle both shapes.

import type { BaselineRent } from '../_shared/rentEstimate.ts'

const HUD_TOKEN = Deno.env.get('HUD_USER_TOKEN') ?? ''
// FMRs are published per fiscal year; bump annually (HUD posts ~late summer).
const HUD_YEAR = 2025

const BEDROOM_KEY: Record<number, string> = {
  0: 'Efficiency', 1: 'One-Bedroom', 2: 'Two-Bedroom', 3: 'Three-Bedroom', 4: 'Four-Bedroom',
}

export interface HudRents {
  /** Rent for the subject's bedroom count (used as baseline and/or floor). */
  bedroomRent: number | null
}

// deno-lint-ignore no-explicit-any
function readBedroom(record: any, bedrooms: number): number | null {
  const b = Math.min(4, Math.max(0, Math.round(bedrooms)))
  const key = BEDROOM_KEY[b]
  const v = record?.[key]
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function fetchHud(zip: string, bedrooms: number): Promise<HudRents | null> {
  if (!HUD_TOKEN || !zip) return null
  try {
    const res = await fetch(`https://www.huduser.gov/hudapi/public/fmr/data/${zip}?year=${HUD_YEAR}`, {
      headers: { Authorization: `Bearer ${HUD_TOKEN}` },
    })
    if (!res.ok) return null
    const json = await res.json()
    const basic = json?.data?.basicdata
    if (!basic) return null

    // SAFMR metro → array of per-ZIP rows; pick the matching ZIP. Else object.
    // deno-lint-ignore no-explicit-any
    const record = Array.isArray(basic)
      ? basic.find((r: any) => String(r.zip_code) === String(zip)) ?? basic[0]
      : basic
    return { bedroomRent: readBedroom(record, bedrooms) }
  } catch {
    return null
  }
}

/** Convert a HUD bedroom rent into a baseline (lower priority than ACS). */
export function hudBaseline(hud: HudRents | null): BaselineRent | null {
  if (!hud?.bedroomRent) return null
  return { value: hud.bedroomRent, moe: null, source: 'safmr', vintageYear: HUD_YEAR }
}
