# findstoop

## Branches and releases

- `develop` → `stoop-test` → `stoop-production`, always in that order.
- Commit work to `develop` and push it first. Then fast-forward `stoop-test`
  to that commit and push, then fast-forward `stoop-production` and push.
- Never push to `stoop-production` before `stoop-test` has the same commit.
- Pushing `stoop-production` deploys the live site: confirm with the owner
  before committing or pushing.
- The web app's build, test and runtime-check steps are in
  `.claude/skills/verify/SKILL.md`.

## How the live site deploys

- Vercel's GitHub integration deploys `stoop-production` on its own a few
  minutes after a push. No token, CLI or `npm run deploy:prod` is needed.
- The GitHub Actions "Deploy production" workflow is a separate path that
  skips (green, with Install/Build/Deploy skipped) until Vercel secrets are
  added. Its skip does NOT mean the site didn't deploy.
- One Vercel deployment serves `findstoop.com` and every
  `{company}.findstoop.com` landlord portal (e.g. `hawk.findstoop.com`), so
  any of them shows what production is running.

## Database migrations

- Pushing does not apply `supabase/migrations/`. Each new migration must be
  run against the production database separately (Supabase dashboard → SQL
  Editor, or `supabase db push`). Tell the owner when a change ships one.
