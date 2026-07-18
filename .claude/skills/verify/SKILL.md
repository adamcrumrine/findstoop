---
name: verify
description: Build/launch/drive recipe for verifying findstoop web changes at runtime.
---

# Verifying findstoop web changes

## Build & launch

- `npm install` at the repo root (workspaces). Typecheck with the workspace
  TS: `cd apps/web && ../../node_modules/.bin/tsc --noEmit` — global `npx tsc`
  is a newer major and errors on `baseUrl` deprecation.
- No real Supabase backend is available in CI/remote sessions. For a runnable
  dev server: `cd apps/web && cp .env.test .env.local && npx vite --port 5199
  --strictPort`. The placeholder Supabase URL means auth-gated routes can't be
  logged into; components that fetch will get network errors (harmless if you
  stub routes in Playwright).
- Remove `.env.local` afterwards — real values would live there.

## Driving UI components behind auth

Auth-gated pages can't be reached without a backend. Instead, mount the
component under test on a temporary route:

1. Create `apps/web/src/pages/dev/__Harness.tsx` rendering the component with
   stub props. To reproduce ManagerLayout stacking (fixed bottom nav z-20 over
   a `relative z-10` content column), copy those wrapper classes into the
   harness.
2. Register `<Route path="/__harness" element={...} />` at the top of
   `App.tsx`'s `<Routes>`.
3. Drive with playwright-core (install in the scratchpad, not the repo);
   Chromium executable is `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
   (the bare `/opt/pw-browsers/chromium` dir has no binary). Launch with
   `--no-sandbox`. Mobile viewport: 390×844, `isMobile: true`.
   Stub Supabase: `page.route('**placeholder.supabase.co**', ...)`.
4. Delete the harness and revert `App.tsx` before committing.

## Gotchas

- The repo's `npm run lint` config predates the hoisted ESLint v10 (flat
  config) — lint fails on config discovery, not on your code.
- Unit tests: `cd apps/web && npm test` (vitest, pure logic, fast).
