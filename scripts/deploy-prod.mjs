#!/usr/bin/env node
// deploy-prod.mjs
// On develop: stages any uncommitted changes → Haiku commit message → commit →
// push develop → merge develop into main → push main → vercel --prod

import { execSync, spawnSync } from "child_process";
import { createInterface } from "readline";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Load .env.local from repo root
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/);
    if (match) process.env[match[1]] ??= match[2].replace(/^["']|["']$/g, "");
  }
}

// ── Config ────────────────────────────────────────────────────────────────────
const DEV_BRANCH  = "stoop-test";
const PROD_BRANCH = "stoop-production";
const MODEL       = "claude-haiku-4-5-20251001";
const API_URL     = "https://api.anthropic.com/v1/messages";

// ── Helpers ───────────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m", bold: "\x1b[1m",
  cyan: "\x1b[36m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m",
};

const info    = (msg) => console.log(`${c.cyan}${c.bold}▶${c.reset} ${msg}`);
const success = (msg) => console.log(`${c.green}${c.bold}✔${c.reset} ${msg}`);
const warn    = (msg) => console.log(`${c.yellow}${c.bold}!${c.reset} ${msg}`);
const die     = (msg) => { console.error(`${c.red}${c.bold}✖${c.reset} ${msg}`); process.exit(1); };

const run     = (cmd) => execSync(cmd, { encoding: "utf8", stdio: "inherit" });
const capture = (cmd) => execSync(cmd, { encoding: "utf8", stdio: "pipe" }).trim();

const ask = (question) =>
  new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });

// ── Preflight ─────────────────────────────────────────────────────────────────
if (!process.env.ANTHROPIC_API_KEY) {
  die("ANTHROPIC_API_KEY is not set.");
}

// ── Confirm intent ────────────────────────────────────────────────────────────
console.log(`\n${c.bold}${c.yellow}Production deploy${c.reset}`);
console.log(`This will:\n  1. Commit any uncommitted changes on ${DEV_BRANCH}\n  2. Push ${DEV_BRANCH}\n  3. Merge ${DEV_BRANCH} → ${PROD_BRANCH} and push\n  4. Deploy to Vercel production\n`);
const confirm = await ask("Continue? [y/N] ");
if (confirm.toLowerCase() !== "y") die("Aborted.");

// ── Switch to develop ─────────────────────────────────────────────────────────
const currentBranch = capture("git rev-parse --abbrev-ref HEAD");
if (currentBranch !== DEV_BRANCH) {
  warn(`Switching from '${currentBranch}' to '${DEV_BRANCH}'…`);
  run(`git checkout ${DEV_BRANCH}`);
}

// ── Commit uncommitted changes if any ────────────────────────────────────────
const hasChanges = capture("git status --porcelain") !== "";

if (hasChanges) {
  info("Uncommitted changes detected — staging…");
  run("git add -A");

  const stat    = capture("git diff --cached --stat");
  const rawDiff = capture("git diff --cached");
  const diff    = `${stat}\n---\n${rawDiff}`.slice(0, 8000);

  info("Asking Claude Haiku for a commit message…");

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 256,
      messages: [{
        role: "user",
        content:
          "Write a concise git commit message for the following diff.\n" +
          "Rules:\n" +
          "- Use conventional commits format (feat/fix/chore/refactor/docs/style/test).\n" +
          "- Subject line ≤ 72 chars, imperative mood, no period.\n" +
          "- Output ONLY the commit message — no explanation, no markdown fences.\n\n" +
          `Diff:\n${diff}`,
      }],
    }),
  });

  if (!response.ok) die(`Anthropic API error ${response.status}: ${await response.text()}`);

  const json = await response.json();
  let commitMsg = json.content?.[0]?.text?.trim();
  if (!commitMsg) die("Haiku returned an empty message.");

  info(`Commit message: ${c.yellow}${commitMsg}${c.reset}`);

  run(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
  success(`Committed: ${commitMsg}`);
} else {
  info("No uncommitted changes — skipping commit.");
}

// ── Push develop ──────────────────────────────────────────────────────────────
info(`Pushing ${DEV_BRANCH}…`);
run(`git push origin ${DEV_BRANCH}`);
success(`Pushed origin/${DEV_BRANCH}`);

// ── Merge develop → main ──────────────────────────────────────────────────────
info(`Switching to ${PROD_BRANCH}…`);
run(`git checkout ${PROD_BRANCH}`);

info(`Merging ${DEV_BRANCH} into ${PROD_BRANCH}…`);
try {
  run(`git merge ${DEV_BRANCH} --no-edit`);
} catch {
  die(`Merge conflict detected. Resolve conflicts, then run:\n  git push origin ${PROD_BRANCH} && vercel --prod`);
}
success(`Merged ${DEV_BRANCH} → ${PROD_BRANCH}`);

// ── Push main ─────────────────────────────────────────────────────────────────
info(`Pushing ${PROD_BRANCH}…`);
run(`git push origin ${PROD_BRANCH}`);
success(`Pushed origin/${PROD_BRANCH}`);

// ── Switch back to develop ────────────────────────────────────────────────────
run(`git checkout develop`);

// ── Vercel production deploy ──────────────────────────────────────────────────
info("Deploying to Vercel production…");
const result = spawnSync("vercel", ["--prod"], { encoding: "utf8", stdio: "inherit", shell: true });
if (result.status !== 0) die("Vercel deploy failed.");
