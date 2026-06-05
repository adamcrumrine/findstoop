# Go-To-Market: University Off-Campus Housing Channel

## The opening
Every major university runs an off-campus housing office. They aren't landlords —
they're connectors and advisors — and they share one chronic problem: **students sign
bad leases, hit disputes, and come back to the office overwhelmed, and the staff has no
good tools to help them.** That's the wedge.

FindStoop now has the tool: **Renter Check** (`/renter-check`) — a free, co-brandable
page where a student uploads any lease PDF and gets a plain-English breakdown of their
obligations, the red flags, and their Ohio tenant rights (with statute cites).

## Why the office says yes
- **No liability.** It's a productivity/education tool, not legal advice — and it says so
  prominently. They're not endorsing legal counsel, just pointing students at a helper.
- **It reduces their inbound load.** Fewer "I signed something bad" conversations to mediate.
- **It makes their landlord directory more attractive.** Professional landlords want
  professional tools; Renter Check funnels their directory landlords toward FindStoop.
- **It costs them nothing.** Free to students, co-branded to the school.
- **Privacy is defensible.** The uploaded lease is never stored; only the analysis is, and
  it's auto-purged after 90 days.

## The two-sided network effect (why this compounds)
1. The office hands Renter Check to students (top of funnel).
2. A student checks their lease → Renter Check extracts the **landlord's name + email**.
3. If that landlord already uses FindStoop, the student is told so (warm tenant onboard).
4. If not, the **student can invite their landlord** (tenant-initiated — never cold spam).
5. Landlords convert to the paid product; more landlords on-platform makes Renter Check
   more useful to the next student. Flywheel.

The OSU off-campus directory is a concentrated list of exactly the landlords we want.

## The ask (low-commitment, escalating)
1. **Link Renter Check** from the office's resources page as `/renter-check?ref=osu`
   (co-branded with the school's name + "Powered by Stoop"). Zero integration.
2. **Mention FindStoop** to directory landlords as a "professional landlord resource."
3. (Later) A deeper **co-brand / white-label** — "Buckeye Renter Tools" — if they want it
   to feel native to their site.

## The demo that closes it
Run a real predatory lease through Renter Check live. In testing, a deliberately one-sided
Ohio lease produced: all 7 planted red flags caught, severity-ranked, each with the correct
Ohio Revised Code citation (e.g. the all-repairs clause flagged against ORC 5321.04, the
deposit-interest waiver against ORC 5321.16 — it even noticed the deposit was 2× rent). That
specificity is what no generic "ask ChatGPT" can match, and it's what reassures the office.

## Compliance posture to lead with
- **Not legal advice** — stated on upload and results; we never tell a student whether to sign.
- **Ohio-grounded** — citations are real ORC sections a student can verify; non-OH leases get a
  general explanation with a "check your state" note (no invented citations).
- **Privacy** — no file retention, 90-day purge of analyses, no account required.

## Expansion
- **Ohio first**: 13 major universities, each with an off-campus housing office and the same
  problem. One config entry per school flips on a co-branded `?ref=` experience.
- **Warm intros**: off-campus housing offices talk through national associations
  (NCHEC). One Big Ten reference makes the next call warm.
- **Sequence**: OSU (home turf) → Miami, Ohio U, Kent State → out-of-state Big Ten.

## What to build next to support this channel
- L2 funnel is live (lead capture, landlord-match, tenant-initiated invite). The leads land
  in `lease_analyses` (admin-readable) — wire a simple admin "Renter Check leads" view to
  work them.
- Per-school landing copy + (optional) partner logos at `/public/partners/<code>.png`.
- An attribution dashboard keyed on `referral_source` to show each office their impact
  (students helped, landlords invited) — offices love reporting they can show their dean.
