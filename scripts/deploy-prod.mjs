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

const DEV_BRANCH  = "stoop-test";
const PROD_BRANCH = "stoop-production";
const c = { reset: "\x1b[0m", bold: "\x1b[1m", cyan: "\x1b[36m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m" };
const info    = (msg) => console.log(`${c.cyan}${c.bold}▶${c.reset} ${msg}`);
const success = (msg) => console.log(`${c.green}${c.bold}✔${c.reset} ${msg}`);
const warn    = (msg) => console.log(`${c.yellow}${c.bold}!${c.reset} ${msg}`);
const die     = (msg) => { console.error(`${c.red}${c.bold}✖${c.reset} ${msg}`); process.exit(1); };
const run     = (cmd) => execSync(cmd, { encoding: "utf8", stdio: "inherit" });
const capture = (cmd) => execSync(cmd, { encoding: "utf8", stdio: "pipe" }).trim();
const ask     = (q) => new Promise((res) => { const rl = createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); res(a.trim()); }); });

console.log(`\n${c.bold}${c.yellow}Production deploy${c.reset}`);
console.log(`This will merge ${DEV_BRANCH} → ${PROD_BRANCH} and deploy to findstoop.com\n`);
const confirm = await ask("Continue? [y/N] ");
if (confirm.toLowerCase() !== "y") die("Aborted.");

const currentBranch = capture("git rev-parse --abbrev-ref HEAD");
if (currentBranch !== DEV_BRANCH) { warn(`Switching to '${DEV_BRANCH}'…`); run(`git checkout ${DEV_BRANCH}`); }

info(`Switching to ${PROD_BRANCH}…`);
run(`git checkout ${PROD_BRANCH}`);
info(`Merging ${DEV_BRANCH} → ${PROD_BRANCH}…`);
try { run(`git merge ${DEV_BRANCH} --no-edit`); } catch { die(`Merge conflict. Resolve then: git push origin ${PROD_BRANCH} && vercel --prod`); }
success(`Merged ${DEV_BRANCH} → ${PROD_BRANCH}`);

info(`Pushing ${PROD_BRANCH}…`);
run(`git push origin ${PROD_BRANCH}`);
success(`Pushed origin/${PROD_BRANCH}`);

run(`git checkout develop`);

info("Deploying to Vercel production…");
const result = spawnSync("vercel", ["--prod"], { encoding: "utf8", stdio: "inherit", shell: true });
if (result.status !== 0) die("Vercel deploy failed.");
