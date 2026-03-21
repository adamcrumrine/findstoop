#!/usr/bin/env node
import { execSync, spawnSync } from "child_process";
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

const SRC_BRANCH  = "develop";
const DEST_BRANCH = "stoop-test";
const c = { reset: "\x1b[0m", bold: "\x1b[1m", cyan: "\x1b[36m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m" };
const info    = (msg) => console.log(`${c.cyan}${c.bold}▶${c.reset} ${msg}`);
const success = (msg) => console.log(`${c.green}${c.bold}✔${c.reset} ${msg}`);
const warn    = (msg) => console.log(`${c.yellow}${c.bold}!${c.reset} ${msg}`);
const die     = (msg) => { console.error(`${c.red}${c.bold}✖${c.reset} ${msg}`); process.exit(1); };
const run     = (cmd) => execSync(cmd, { encoding: "utf8", stdio: "inherit" });
const capture = (cmd) => execSync(cmd, { encoding: "utf8", stdio: "pipe" }).trim();

const currentBranch = capture("git rev-parse --abbrev-ref HEAD");
if (currentBranch !== SRC_BRANCH) { warn(`Switching to '${SRC_BRANCH}'…`); run(`git checkout ${SRC_BRANCH}`); }

info(`Pushing ${SRC_BRANCH}…`);
run(`git push origin ${SRC_BRANCH}`);
success(`Pushed origin/${SRC_BRANCH}`);

info(`Switching to ${DEST_BRANCH}…`);
run(`git checkout ${DEST_BRANCH}`);
info(`Merging ${SRC_BRANCH} → ${DEST_BRANCH}…`);
try { run(`git merge ${SRC_BRANCH} --no-edit`); } catch { die(`Merge conflict. Resolve then: git push origin ${DEST_BRANCH} && vercel`); }
success(`Merged ${SRC_BRANCH} → ${DEST_BRANCH}`);

info(`Pushing ${DEST_BRANCH}…`);
run(`git push origin ${DEST_BRANCH}`);
success(`Pushed origin/${DEST_BRANCH}`);

run(`git checkout ${SRC_BRANCH}`);

info("Deploying Vercel preview…");
const result = spawnSync("vercel", [], { encoding: "utf8", stdio: "inherit", shell: true });
if (result.status !== 0) die("Vercel deploy failed.");
