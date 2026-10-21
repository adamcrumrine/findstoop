import { describe, it, expect } from 'vitest'
import * as web from '@findstoop/shared/lib/screeningPricing'
// The copy Stripe actually charges. Pure TS, no Deno APIs, so it imports here.
import * as edge from '../../../../supabase/functions/_shared/screeningPricing'

const STATES = ['OH', 'TX', 'VT', 'RI', 'CO', 'MN', 'OR', 'WI', 'MD', 'VA', 'oh', '', null]

describe('screening pricing', () => {
  it('the page and the charge agree in every state', () => {
    expect(edge.TENABILITY_PRICE).toBe(web.TENABILITY_PRICE)
    expect(edge.TENABILITY_PRO_PRICE).toBe(web.TENABILITY_PRO_PRICE)
    for (const s of STATES) expect(edge.screeningPricesFor(s)).toEqual(web.screeningPricesFor(s))
  })

  it('charges $15 / $35 where there is no state limit', () => {
    expect(web.screeningPricesFor('OH')).toEqual({ available: true, standard: 15, pro: 35, capped: false })
    expect(web.screeningPricesFor('oh')).toEqual({ available: true, standard: 15, pro: 35, capped: false })
  })

  it('caps Pro at $25 in Wisconsin and Maryland', () => {
    expect(web.screeningPricesFor('WI')).toEqual({ available: true, standard: 15, pro: 25, capped: true })
    expect(web.screeningPricesFor('MD')).toEqual({ available: true, standard: 15, pro: 25, capped: true })
  })

  it('offers no applicant-paid screening where fees are banned or cost-limited', () => {
    for (const s of ['VT', 'RI', 'CO', 'MN', 'OR']) {
      expect(web.screeningPricesFor(s).available).toBe(false)
    }
  })
})
