#!/usr/bin/env node
import { execSync, spawnSync } from "child_process";
import { createInterface } from "readline";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/);
    if (match) process.env[match[1]] ??= match[2].replace(/^["']|["']$/g, "");
  }
}

const BRANCH  = "develop";
const MODEL   = "claude-haiku-4-5-20251001";
const API_URL = "https://api.anthropic.com/v1/messages";

const c = { reset: "\x1b[0m", bold: "\x1b[1m", cyan: "\x1b[36m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m" };
const info    = (msg) => console.log(`${c.cyan}${c.bold}▶${c.reset} ${msg}`);
const success = (msg) => console.log(`${c.green}${c.bold}✔${c.reset} ${msg}`);
const warn    = (msg) => console.log(`${c.yellow}${c.bold}!${c.reset} ${msg}`);
const die     = (msg) => { console.error(`${c.red}${c.bold}✖${c.reset} ${msg}`); process.exit(1); };
const run     = (cmd) => execSync(cmd, { encoding: "utf8", stdio: "inherit" });
const capture = (cmd) => execSync(cmd, { encoding: "utf8", stdio: "pipe" }).trim();
const ask     = (q) => new Promise((res) => { const rl = createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); res(a.trim()); }); });

if (!process.env.ANTHROPIC_API_KEY) die("ANTHROPIC_API_KEY is not set.");

const currentBranch = capture("git rev-parse --abbrev-ref HEAD");
if (currentBranch !== BRANCH) { warn(`Switching to '${BRANCH}'…`); run(`git checkout ${BRANCH}`); }

if (capture("git status --porcelain") === "") die("No changes detected.");

info("Staging all changes…");
run("git add -A");

const diff = `${capture("git diff --cached --stat")}\n---\n${capture("git diff --cached")}`.slice(0, 8000);
info("Asking Claude Haiku for a commit message…");

const response = await fetch(API_URL, {
  method: "POST",
  headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
  body: JSON.stringify({ model: MODEL, max_tokens: 256, messages: [{ role: "user", content: `Write a concise git commit message for the following diff.\nRules:\n- Use conventional commits format.\n- Subject line ≤ 72 chars, imperative mood, no period.\n- Output ONLY the commit message.\n\nDiff:\n${diff}` }] }),
});
if (!response.ok) die(`API error ${response.status}`);
const json = await response.json();
const commitMsg = json.content?.[0]?.text?.trim();
if (!commitMsg) die("Haiku returned empty.");

info(`Commit message: ${c.yellow}${commitMsg}${c.reset}`);
run(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
success(`Committed: ${commitMsg}`);

info(`Pushing ${BRANCH}…`);
run(`git push origin ${BRANCH}`);
success(`Pushed origin/${BRANCH}`);

console.log("");
const runTest = await ask("Deploy to stoop-test? [Y/n] ");
if (runTest.toLowerCase() !== "n") {
  spawnSync("npm", ["run", "deploy:test"], { stdio: "inherit", shell: true });
}
