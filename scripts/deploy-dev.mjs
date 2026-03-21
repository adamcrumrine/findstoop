#!/usr/bin/env node
// deploy-dev.mjs
// Stages changes on develop → Haiku commit message → commit → push develop
// Then optionally runs deploy:test

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
const BRANCH  = "develop";
const MODEL   = "claude-haiku-4-5-20251001";
const API_URL = "https://api.anthropic.com/v1/messages";

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
if (currentBranch !== BRANCH) {
  warn(`Switching from '${currentBranch}' to '${BRANCH}'…`);
  run(`git checkout ${BRANCH}`);
}

// ── Check for changes ─────────────────────────────────────────────────────────
if (capture("git status --porcelain") === "") die("No changes detected. Nothing to commit.");

// ── Stage ─────────────────────────────────────────────────────────────────────
info("Staging all changes…");
run("git add -A");

// ── Ask Claude Haiku ──────────────────────────────────────────────────────────
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

// ── Commit & push ─────────────────────────────────────────────────────────────
run(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
success(`Committed: ${commitMsg}`);

info(`Pushing ${BRANCH}…`);
run(`git push origin ${BRANCH}`);
success(`Pushed origin/${BRANCH}`);

// ── Optionally run deploy:test ────────────────────────────────────────────────
console.log("");
const runTest = await ask("Deploy to stoop-test? [Y/n] ");
if (runTest.toLowerCase() !== "n") {
  spawnSync("npm", ["run", "deploy:test"], { stdio: "inherit", shell: true });
}
