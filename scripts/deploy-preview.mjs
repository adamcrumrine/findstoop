#!/usr/bin/env node
// deploy-preview.mjs
// Stages changes → asks Claude Haiku for a commit message → commits →
// pushes to develop → deploys Vercel preview.

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
const BRANCH = "develop";
const MODEL = "claude-haiku-4-5-20251001";
const API_URL = "https://api.anthropic.com/v1/messages";

// ── Helpers ───────────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

const info = (msg) => console.log(`${c.cyan}${c.bold}▶${c.reset} ${msg}`);
const success = (msg) => console.log(`${c.green}${c.bold}✔${c.reset} ${msg}`);
const warn = (msg) => console.log(`${c.yellow}${c.bold}!${c.reset} ${msg}`);
const die = (msg) => { console.error(`${c.red}${c.bold}✖${c.reset} ${msg}`); process.exit(1); };

const run = (cmd, opts = {}) =>
  execSync(cmd, { encoding: "utf8", stdio: opts.silent ? "pipe" : "inherit", ...opts });

const capture = (cmd) => execSync(cmd, { encoding: "utf8", stdio: "pipe" }).trim();

const ask = (question) =>
  new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });

// ── Preflight ─────────────────────────────────────────────────────────────────
if (!process.env.ANTHROPIC_API_KEY) {
  die("ANTHROPIC_API_KEY is not set. Export it in your shell or add it to your environment.");
}

// ── Check for changes ─────────────────────────────────────────────────────────
const hasChanges =
  capture("git status --porcelain") !== "";

if (!hasChanges) die("No changes detected. Nothing to commit.");

// ── Branch check ──────────────────────────────────────────────────────────────
const currentBranch = capture("git rev-parse --abbrev-ref HEAD");
if (currentBranch !== BRANCH) {
  warn(`Currently on '${currentBranch}', switching to '${BRANCH}'…`);
  run(`git checkout ${BRANCH}`);
}

// ── Stage all changes ─────────────────────────────────────────────────────────
info("Staging all changes…");
run("git add -A");

// ── Build diff for prompt (cap at 8 KB) ───────────────────────────────────────
const stat = capture("git diff --cached --stat");
const rawDiff = capture("git diff --cached");
const diff = `${stat}\n---\n${rawDiff}`.slice(0, 8000);

// ── Ask Claude Haiku ──────────────────────────────────────────────────────────
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

if (!response.ok) {
  const err = await response.text();
  die(`Anthropic API error ${response.status}: ${err}`);
}

const json = await response.json();
let commitMsg = json.content?.[0]?.text?.trim();
if (!commitMsg) die(`Haiku returned an empty message. Full response:\n${JSON.stringify(json, null, 2)}`);

// ── Confirm or edit ───────────────────────────────────────────────────────────
console.log(`\n${c.bold}Generated commit message:${c.reset}`);
console.log(`  ${c.yellow}${commitMsg}${c.reset}\n`);

const choice = await ask("Use this message? [Y/e/n] ");

if (choice.toLowerCase() === "n") die("Aborted by user.");
if (choice.toLowerCase() === "e") {
  commitMsg = await ask("Enter your commit message: ");
  if (!commitMsg) die("Empty commit message. Aborted.");
}

// ── Commit ────────────────────────────────────────────────────────────────────
info("Committing…");
run(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
success(`Committed: ${commitMsg}`);

// ── Push to develop ───────────────────────────────────────────────────────────
info(`Pushing to origin/${BRANCH}…`);
run(`git push origin ${BRANCH}`);
success(`Pushed to origin/${BRANCH}`);

// ── Vercel preview deploy ─────────────────────────────────────────────────────
info("Deploying Vercel preview…");
const result = spawnSync("vercel", [], { encoding: "utf8", stdio: "inherit", shell: true });
if (result.status !== 0) die("Vercel deploy failed.");
