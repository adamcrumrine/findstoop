// Vacancy cost ticker — puts a daily dollar figure on a vacant unit so the
// cost of sitting still is never abstract: "$49/day walking out the door —
// vacant 12 days = $591 total". Amber is the vacancy status color everywhere
// else in the app (unit pills, dashboard insight), so the ticker matches.

import { TrendingDown } from 'lucide-react'
import type { VacancyCost } from '../../lib/turnover'

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US')

/** "$49/day walking out the door — vacant 12 days = $591 total" */
export function vacancyTickerCopy(cost: VacancyCost): string {
  const daily = `${usd(cost.dailyLoss)}/day walking out the door`
  if (cost.vacantDays <= 0) return `${daily} starting today`
  const days = `${cost.vacantDays} day${cost.vacantDays === 1 ? '' : 's'}`
  const since = cost.neverLeased ? `never leased — ${days} and counting` : `vacant ${days}`
  return `${daily} — ${since} = ${usd(cost.totalLoss)} total`
}

export default function VacancyCostTicker({ cost, className }: { cost: VacancyCost; className?: string }) {
  return (
    <p className={`inline-flex items-start gap-1.5 text-xs font-medium text-amber-700 ${className ?? ''}`}>
      <TrendingDown className="w-3.5 h-3.5 mt-px shrink-0" strokeWidth={1.75} />
      <span>{vacancyTickerCopy(cost)}</span>
    </p>
  )
}
