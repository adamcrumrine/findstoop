// BLS recency trend. ACS rent is 1-2 years stale; we trend it forward to today
// using the CPI "Rent of primary residence" index (series CUUR0000SEHA, US city
// average, NSA). Free; an optional BLS_API_KEY raises the daily quota.
//
// Fails soft: if BLS is unreachable, fall back to a fixed assumed annual growth
// so the estimate always has a recency factor.

import type { RecencyTrend } from '../_shared/rentEstimate.ts'

const BLS_KEY = Deno.env.get('BLS_API_KEY') ?? ''
const SERIES = 'CUUR0000SEHA' // CPI-U, Rent of primary residence, NSA
const ASSUMED_ANNUAL_GROWTH = 0.04 // fallback when BLS is down

interface BlsObservation { year: string; period: string; value: string } // period = 'M01'..'M12'

/**
 * Recency factor = latest CPI-rent index ÷ index at (roughly) the ACS vintage.
 * We anchor the "from" point at January of the ACS vintage year — a reasonable
 * stand-in for the survey's central tendency without overcomplicating it.
 */
export async function fetchRecency(acsVintageYear: number): Promise<RecencyTrend> {
  const nowYear = new Date().getUTCFullYear()
  try {
    const body = {
      seriesid: [SERIES],
      startyear: String(acsVintageYear),
      endyear: String(nowYear),
      ...(BLS_KEY ? { registrationkey: BLS_KEY } : {}),
    }
    const res = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error('bls http')
    const json = await res.json()
    const obs: BlsObservation[] = json?.Results?.series?.[0]?.data ?? []
    if (!obs.length) throw new Error('bls empty')

    // Data is newest-first. Latest available observation:
    const latest = Number(obs[0].value)
    // "From" anchor: January of the vintage year (or the earliest we have).
    const fromObs = obs.find((o) => o.year === String(acsVintageYear) && o.period === 'M01')
      ?? obs[obs.length - 1]
    const from = Number(fromObs.value)
    if (!from || !latest) throw new Error('bls parse')

    const asOf = `${obs[0].year}-${obs[0].period.replace('M', '').padStart(2, '0')}-01`
    return { factor: latest / from, asOf }
  } catch {
    // Fallback: assume steady growth over the elapsed years.
    const years = Math.max(0, nowYear - acsVintageYear)
    return { factor: Math.pow(1 + ASSUMED_ANNUAL_GROWTH, years), asOf: `${nowYear}-01-01` }
  }
}
