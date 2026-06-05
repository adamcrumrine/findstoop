# Renter Check — Tenant Lease Explainer

The tenant-side companion to FindStoop's landlord document automation. Where the landlord
engine **generates** structured documents, Renter Check **ingests an arbitrary lease and
explains it** — the inverse, and the top of the university go-to-market funnel
(see [gtm-university-channel.md](./gtm-university-channel.md)).

## What it does
Public, no-login page at `/renter-check`: a renter uploads any lease PDF and gets a
plain-English breakdown of obligations, red flags, and Ohio tenant rights (with ORC cites),
plus questions to ask before signing. General information, not legal advice.

## Architecture (≈80% reused FindStoop infrastructure)
```
/renter-check (public, own shell, ?ref= co-brand)
  → fileToBase64 in the browser (PDF never leaves as a file we keep)
  → explain-lease edge fn  [verify_jwt=false, IP rate-limited, 15MB cap]
      • Claude Sonnet reads the PDF (document block), grounded in OH statute
      • returns the structured LeaseAnalysis JSON
      • persists a lease_analyses row + runs landlord-match
      • returns analysis_id + capability token + landlord_on_platform
  → results render (summary, money/dates, severity-ranked red flags w/ cites,
    rights, questions) + disclaimer + funnel
  → renter-lead edge fn  [token-gated]
      • email_summary  → emails the renter their summary (lead capture)
      • invite_landlord → tenant-initiated invite to the landlord
```
Reuses: the Anthropic + `logApiCall`/`anthropicCost` pattern from `extract-lease-fields`,
`_shared/rateLimit.ts`, `_shared/cors.ts`, `_shared/screeningAuth.ts` (capability tokens),
`ApplyLayout`-style bare shell, the `OhioTenantRights` / `leaseTemplates` statutory content.

## Milestones (all built)
- **L1 — the tool**: `explain-lease` + `RenterCheck` page + Ohio grounding + disclaimers.
  Live-tested: a predatory OH lease yielded all 7 planted red flags with correct ORC cites.
- **L2 — the funnel**: `lease_analyses` lead store (deny-all RLS, capability tokens, 90-day
  purge), landlord-match against existing managers, `renter-lead` for email-summary +
  tenant-initiated landlord invite. Live-verified: persistence + match populate; lead store
  private to service-role/admin; renter-lead token + validation gates enforced.
- **L3 — white-label**: `renterPartners.ts` registry → `?ref=osu` co-brands the header
  ("Provided by … · Powered by Stoop"). One entry per school.

## Data model
`lease_analyses` (migration `20260603000002`): stores the extracted analysis (never the PDF),
landlord/property, `referral_source`, `matched_manager_id`, `tenant_email`, invite/email
timestamps. **RLS is deny-all** for anon/authenticated — only the service role (edge
functions) and admins touch it. `delete_stale_lease_analyses()` purges rows > 90 days
(wire into `cron-lifecycle-daily`).

## Privacy & compliance (non-negotiable)
- Uploaded PDF is **never persisted**; only the analysis is, and it's purged after 90 days.
- **Not legal advice** on upload + results; never advises whether to sign.
- Ohio-grounded citations; non-OH leases get general guidance, no invented cites.
- Landlord outreach is **tenant-initiated only** — we never cold-email landlords.

## Deploy checklist
1. Apply migration `20260603000002_lease_analyses.sql`.
2. Deploy functions **with `--no-verify-jwt`**: `explain-lease`, `renter-lead`.
3. Ensure secrets are set: `ANTHROPIC_API_KEY` (analysis), `RESEND_API_KEY` + `RESEND_FROM_EMAIL`
   (lead/invite emails). Note: the Resend SDK throws at construction if the key is unset — the
   function will crash at boot without it (same as every existing email function).
4. Wire `delete_stale_lease_analyses()` into the daily lifecycle cron.
5. The `/renter-check` page ships with the normal frontend deploy.

## Known gaps / next
- The full email round-trip (Resend send) is build-verified but not exercised end-to-end
  (to avoid sending real mail in testing).
- Multi-state: the explainer can scale to other states faster than the landlord generator
  (general guidance + "check your state"), but per-state statutory grounding is OH-only today.
- An admin "Renter Check leads" view + `referral_source` attribution dashboard would let each
  partner school see their impact.
