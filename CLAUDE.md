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
