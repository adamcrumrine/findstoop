#!/usr/bin/env node
// deploy-test.mjs
// On develop: stages any uncommitted changes → Haiku commit message → commit →
// push develop → merge develop into stoop-test → push stoop-test → vercel preview

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
const SRC_BRANCH  = "develop";
const DEST_BRANCH = "stoop-test";
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
if (!process.env.ANTHROPIC_API_KEY) die("ANTHROPIC_API_KEY is not set.");

// ── Switch to develop ─────────────────────────────────────────────────────────
const currentBranch = capture("git rev-parse --abbrev-ref HEAD");
if (currentBranch !== SRC_BRANCH) {
  warn(`Switching from '${currentBranch}' to '${SRC_BRANCH}'…`);
  run(`git checkout ${SRC_BRANCH}`);
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

  console.log(`\n${c.bold}Generated commit message:${c.reset}`);
  console.log(`  ${c.yellow}${commitMsg}${c.reset}\n`);

  const choice = await ask("Use this message? [Y/e/n] ");
  if (choice.toLowerCase() === "n") die("Aborted.");
  if (choice.toLowerCase() === "e") {
    commitMsg = await ask("Enter your commit message: ");
    if (!commitMsg) die("Empty commit message. Aborted.");
  }

  run(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
  success(`Committed: ${commitMsg}`);
} else {
  info("No uncommitted changes — skipping commit.");
}

// ── Push develop ──────────────────────────────────────────────────────────────
info(`Pushing ${SRC_BRANCH}…`);
run(`git push origin ${SRC_BRANCH}`);
success(`Pushed origin/${SRC_BRANCH}`);

// ── Merge develop → stoop-test ────────────────────────────────────────────────
info(`Switching to ${DEST_BRANCH}…`);
run(`git checkout ${DEST_BRANCH}`);

info(`Merging ${SRC_BRANCH} into ${DEST_BRANCH}…`);
try {
  run(`git merge ${SRC_BRANCH} --no-edit`);
} catch {
  die(`Merge conflict detected. Resolve conflicts, then run:\n  git push origin ${DEST_BRANCH} && vercel`);
}
success(`Merged ${SRC_BRANCH} → ${DEST_BRANCH}`);

// ── Push stoop-test ───────────────────────────────────────────────────────────
info(`Pushing ${DEST_BRANCH}…`);
run(`git push origin ${DEST_BRANCH}`);
success(`Pushed origin/${DEST_BRANCH}`);

// ── Switch back to develop ────────────────────────────────────────────────────
run(`git checkout ${SRC_BRANCH}`);

// ── Vercel preview deploy ─────────────────────────────────────────────────────
info("Deploying Vercel preview…");
const result = spawnSync("vercel", [], { encoding: "utf8", stdio: "inherit", shell: true });
if (result.status !== 0) die("Vercel deploy failed.");
