#!/usr/bin/env node
// One-time backfill of Avail "received payments" history into FindStoop.
//
// Scope (per 2026-05-29 decisions):
//   • Current tenants only — a payment is imported only if its (address, unit,
//     tenant name) matches a CURRENT lease + tenant already in FindStoop.
//     Churned/past tenants are reported as unmatched and skipped.
//   • Security deposits are skipped (refundable liability, not income).
//   • Fees are reported but NOT imported by default (ambiguous: late fee vs
//     card convenience fee). Pass --fees to include them as type 'other'.
//   • status: finalized | cash/check -> completed ; processing -> processing ;
//     failure / $0 -> skipped.
//
// DRY RUN by default (no writes). Pass --apply to insert.
// Dedup: each row is tagged stripe_payment_id = 'avail:<txn>' (or a synthetic
// key for cash/check), and existing 'avail:%' rows are skipped on re-run.
//
//   node scripts/backfill-avail-payments.mjs [csvPath]          # dry run
//   node scripts/backfill-avail-payments.mjs [csvPath] --apply  # write rent
//   node scripts/backfill-avail-payments.mjs [csvPath] --apply --fees
//
// Requires: `npm i pg --no-save` (ops-only Postgres client; not an app dep).
// Reads VITE_SUPABASE_URL + SUPABASE_DB_PASSWORD from .env.local and connects
// via supabase/.temp/pooler-url. The CSV holds tenant PII — keep it gitignored.

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const pathArg = process.argv.slice(2).find((a) => !a.startsWith('--'))
const CSV_PATH = pathArg
  ? resolve(process.cwd(), pathArg)
  : resolve(__dirname, '2026-05-29-received-payments-report.csv')
const APPLY = process.argv.includes('--apply')
const INCLUDE_FEES = process.argv.includes('--fees')

// ── env ────────────────────────────────────────────────────────────────
const env = {}
for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
}
// Connect straight to Postgres (the project's legacy JWT API keys are disabled,
// so we use the DB password + the pooler, same creds as `supabase db push`).
const DB_PASSWORD = env.SUPABASE_DB_PASSWORD
if (!DB_PASSWORD) { console.error('Missing SUPABASE_DB_PASSWORD in .env.local'); process.exit(1) }
const poolerUrl = readFileSync(resolve(ROOT, 'supabase/.temp/pooler-url'), 'utf8').trim()
const connStr = poolerUrl.replace('@', `:${encodeURIComponent(DB_PASSWORD)}@`)
const pool = new pg.Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false } })
const q = (text, params) => pool.query(text, params)

// ── tiny CSV parser (handles quoted fields with commas) ──────────────────
function parseCsv(text) {
  const rows = []
  let field = '', row = [], inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      if (field !== '' || row.length) { row.push(field); rows.push(row); row = []; field = '' }
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

// ── normalizers ──────────────────────────────────────────────────────────
const normAddr = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const normUnit = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const nameTokens = (s) => (s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((t) => t.length > 1)
function nameMatches(csvName, dbName) {
  const a = nameTokens(csvName), b = nameTokens(dbName)
  if (!a.length || !b.length) return false
  const aL = a[a.length - 1], bL = b[b.length - 1]
  if (aL !== bL) return false                 // last name must match
  return a[0][0] === b[0][0]                   // + first initial
}

async function main() {
  if (!existsSync(CSV_PATH)) { console.error('CSV not found at', CSV_PATH); process.exit(1) }
  const rows = parseCsv(readFileSync(CSV_PATH, 'utf8'))
  const header = rows.shift().map((h) => h.trim())
  const idx = Object.fromEntries(header.map((h, i) => [h, i]))

  // ── load prod portfolio (service role bypasses RLS) ───────────────────
  const props = (await q('select id,name,address,city,state,zip from properties')).rows
  const units = (await q('select id,property_id,unit_number from units')).rows
  const leases = (await q('select id,unit_id,tenant_id,status,start_date,end_date from leases')).rows
  const lts = (await q('select lease_id,tenant_id from lease_tenants')).rows
  const profiles = (await q('select id,full_name,role from profiles')).rows
  const nameById = Object.fromEntries((profiles || []).map((p) => [p.id, p.full_name]))
  const unitsByProp = {}
  for (const u of units || []) (unitsByProp[u.property_id] ??= []).push(u)
  // current leases per unit (prefer active/upcoming over ended)
  const leasesByUnit = {}
  for (const l of leases || []) (leasesByUnit[l.unit_id] ??= []).push(l)
  const coTenantsByLease = {}
  for (const lt of lts || []) (coTenantsByLease[lt.lease_id] ??= []).push(lt.tenant_id)

  // tenants on the CURRENT lease(s) of a unit
  function currentTenantsForUnit(unitId) {
    const ls = (leasesByUnit[unitId] || [])
    const active = ls.filter((l) => l.status === 'active' || l.status === 'upcoming')
    const pick = active.length ? active : ls
    const out = []
    for (const l of pick) {
      const ids = new Set([l.tenant_id, ...(coTenantsByLease[l.id] || [])].filter(Boolean))
      for (const tid of ids) out.push({ leaseId: l.id, tenantId: tid, name: nameById[tid] || '' })
    }
    return out
  }

  function findUnit(addr, unitNum) {
    const a = normAddr(addr)
    const matchProps = (props || []).filter((p) => {
      const pa = normAddr(p.address)
      return pa === a || pa.includes(a) || a.includes(pa)
    })
    for (const p of matchProps) {
      const us = unitsByProp[p.id] || []
      if (us.length === 1) return us[0]                          // single-unit property
      const u = us.find((x) => normUnit(x.unit_number) === normUnit(unitNum))
      if (u) return u
    }
    return null
  }

  const cat = { rentImport: [], feeImport: [], unmatched: [], skippedDeposit: 0, skippedFailure: 0, skippedZero: 0 }

  for (const r of rows) {
    const rec = {
      tenant: r[idx.from_tenant_name]?.trim(),
      addr: r[idx.street_address]?.trim(),
      unit: r[idx.unit_number]?.trim(),
      paidOn: r[idx.payee_paid_on]?.trim(),
      amount: parseFloat(r[idx.amount_money] || '0'),
      status: r[idx.status]?.trim(),
      txn: r[idx.transaction_nbr]?.trim(),
      charge: (r[idx.charge_type]?.trim() || 'rent'),
    }
    if (!rec.amount || rec.status === 'failure') { rec.status === 'failure' ? cat.skippedFailure++ : cat.skippedZero++; continue }
    if (rec.charge === 'security_deposit') { cat.skippedDeposit++; continue }

    const unit = findUnit(rec.addr, rec.unit)
    if (!unit) { cat.unmatched.push({ ...rec, reason: 'no property/unit in FindStoop' }); continue }
    const tenants = currentTenantsForUnit(unit.id)
    const hit = tenants.find((t) => nameMatches(rec.tenant, t.name))
    if (!hit) { cat.unmatched.push({ ...rec, reason: 'tenant not on current lease (churned)' }); continue }

    const payOn = rec.paidOn
    // Use the actual paid date as due_date so two payments in the same month
    // (e.g. a split rent payment) don't collide on the unique rent index.
    const due = payOn || null
    const dedupId = `avail:${rec.txn || `cc:${normAddr(rec.addr)}:${normUnit(rec.unit)}:${payOn}:${rec.amount}`}`
    const payment = {
      lease_id: hit.leaseId,
      tenant_id: hit.tenantId,
      amount: rec.amount,
      type: rec.charge === 'rent' ? 'rent' : 'other',
      status: rec.status === 'processing' ? 'processing' : 'completed',
      paid_at: rec.status === 'processing' ? null : (payOn ? `${payOn}T12:00:00Z` : null),
      due_date: due,
      stripe_payment_id: dedupId,
      memo: rec.charge === 'rent' ? 'Imported from Avail' : `Imported from Avail (${rec.charge})`,
    }
    ;(rec.charge === 'rent' ? cat.rentImport : cat.feeImport).push(payment)
  }

  // ── report ────────────────────────────────────────────────────────────
  const sum = (arr) => arr.reduce((s, p) => s + Number(p.amount), 0)
  const byTenant = {}
  for (const p of cat.rentImport) { const n = nameById[p.tenant_id]; byTenant[n] = (byTenant[n] || 0) + Number(p.amount) }
  console.log('\n===== AVAIL BACKFILL DRY RUN =====' + (APPLY ? ' (APPLY MODE)' : ''))
  console.log(`Rent payments matched to current tenants : ${cat.rentImport.length}  ($${sum(cat.rentImport).toLocaleString()})`)
  console.log(`Fee payments matched                     : ${cat.feeImport.length}  ($${sum(cat.feeImport).toLocaleString()})  [${INCLUDE_FEES ? 'WILL IMPORT' : 'excluded — pass --fees'}]`)
  console.log(`Skipped — security deposits              : ${cat.skippedDeposit}`)
  console.log(`Skipped — failures                       : ${cat.skippedFailure}`)
  console.log(`Skipped — $0                             : ${cat.skippedZero}`)
  console.log(`Unmatched (churned / not in FindStoop)   : ${cat.unmatched.length}`)
  console.log('\nMatched rent by current tenant:')
  for (const [n, amt] of Object.entries(byTenant).sort((a, b) => b[1] - a[1])) console.log(`   ${n}: $${amt.toLocaleString()}`)
  // sample of unmatched reasons
  const reasonCounts = {}
  for (const u of cat.unmatched) reasonCounts[u.reason] = (reasonCounts[u.reason] || 0) + 1
  console.log('\nUnmatched breakdown:'); for (const [r, c] of Object.entries(reasonCounts)) console.log(`   ${r}: ${c}`)

  if (!APPLY) { console.log('\nDry run only. Re-run with --apply to insert the matched rent.\n'); await pool.end(); return }

  // ── apply ─────────────────────────────────────────────────────────────
  const toInsert = INCLUDE_FEES ? [...cat.rentImport, ...cat.feeImport] : cat.rentImport
  // dedup against existing avail imports
  const existing = (await q("select stripe_payment_id from payments where stripe_payment_id like 'avail:%'")).rows
  const seen = new Set(existing.map((e) => e.stripe_payment_id))
  const fresh = toInsert.filter((p) => !seen.has(p.stripe_payment_id))
  console.log(`\nInserting ${fresh.length} payments (${toInsert.length - fresh.length} already imported, skipped)...`)
  let ok = 0, conflict = 0
  for (const p of fresh) {
    const res = await q(
      `insert into payments (lease_id,tenant_id,amount,type,status,paid_at,due_date,stripe_payment_id,memo)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict do nothing`,
      [p.lease_id, p.tenant_id, p.amount, p.type, p.status, p.paid_at, p.due_date, p.stripe_payment_id, p.memo],
    )
    if (res.rowCount === 1) ok++; else conflict++
  }
  console.log(`Done. Inserted ${ok} payments (${conflict} skipped on conflict).\n`)
  await pool.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
