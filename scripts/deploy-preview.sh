#!/usr/bin/env bash
# deploy-preview.sh
# Stages changes → asks Claude Haiku for a commit message → commits →
# pushes to develop → deploys Vercel preview.

set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────────
BRANCH="develop"
MODEL="claude-haiku-4-5-20251001"
API_URL="https://api.anthropic.com/v1/messages"

# ── Colour helpers ────────────────────────────────────────────────────────────
bold=$(tput bold 2>/dev/null || echo "")
reset=$(tput sgr0 2>/dev/null || echo "")
cyan="\033[36m"
green="\033[32m"
yellow="\033[33m"
red="\033[31m"
nc="\033[0m"

info()    { echo -e "${cyan}${bold}▶${reset} $*"; }
success() { echo -e "${green}${bold}✔${reset} $*"; }
warn()    { echo -e "${yellow}${bold}!${reset} $*"; }
die()     { echo -e "${red}${bold}✖${reset} $*" >&2; exit 1; }

# ── Preflight checks ──────────────────────────────────────────────────────────
[[ -z "${ANTHROPIC_API_KEY:-}" ]] && die "ANTHROPIC_API_KEY is not set. Export it in your shell or add it to ~/.bashrc."

command -v git    >/dev/null 2>&1 || die "git not found"
command -v curl   >/dev/null 2>&1 || die "curl not found"
command -v jq     >/dev/null 2>&1 || die "jq not found (brew install jq / apt install jq)"
command -v vercel >/dev/null 2>&1 || die "vercel CLI not found (npm i -g vercel)"

# ── Must be on the right branch ───────────────────────────────────────────────
current_branch=$(git rev-parse --abbrev-ref HEAD)
if [[ "$current_branch" != "$BRANCH" ]]; then
  warn "Currently on '$current_branch', switching to '$BRANCH'…"
  git checkout "$BRANCH"
fi

# ── Check for changes ─────────────────────────────────────────────────────────
if git diff --quiet && git diff --cached --quiet && [[ -z "$(git ls-files --others --exclude-standard)" ]]; then
  die "No changes detected. Nothing to commit."
fi

info "Staging all changes…"
git add -A

# ── Build diff for the prompt (cap at 8 KB to stay within token limits) ───────
diff_text=$(git diff --cached --stat && echo "---" && git diff --cached | head -c 8000)

# ── Ask Claude Haiku for a commit message ─────────────────────────────────────
info "Asking Claude Haiku for a commit message…"

payload=$(jq -n \
  --arg model "$MODEL" \
  --arg diff  "$diff_text" \
  '{
    model: $model,
    max_tokens: 256,
    messages: [{
      role: "user",
      content: ("Write a concise git commit message for the following diff.\n" +
                "Rules:\n" +
                "- Use conventional commits format (feat/fix/chore/refactor/docs/style/test).\n" +
                "- Subject line ≤ 72 chars, imperative mood, no period.\n" +
                "- Output ONLY the commit message — no explanation, no markdown fences.\n\n" +
                "Diff:\n" + $diff)
    }]
  }')

response=$(curl -sS "$API_URL" \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d "$payload")

commit_msg=$(echo "$response" | jq -r '.content[0].text // empty')

[[ -z "$commit_msg" ]] && die "Haiku returned an empty message. Raw response:\n$(echo "$response" | jq .)"

echo ""
echo -e "${bold}Generated commit message:${reset}"
echo -e "  ${yellow}${commit_msg}${nc}"
echo ""

# ── Confirm or edit ───────────────────────────────────────────────────────────
read -r -p "Use this message? [Y/e/n] " choice
case "$choice" in
  [eE])
    commit_msg=$(echo "$commit_msg" | "${EDITOR:-vi}")
    ;;
  [nN])
    die "Aborted by user."
    ;;
esac

# ── Commit ────────────────────────────────────────────────────────────────────
info "Committing…"
git commit -m "$commit_msg"
success "Committed: $commit_msg"

# ── Push to develop ───────────────────────────────────────────────────────────
info "Pushing to origin/$BRANCH…"
git push origin "$BRANCH"
success "Pushed to origin/$BRANCH"

# ── Vercel preview deploy ─────────────────────────────────────────────────────
info "Deploying Vercel preview…"
vercel_output=$(vercel 2>&1)
echo "$vercel_output"

preview_url=$(echo "$vercel_output" | grep -oP 'https://\S+\.vercel\.app' | tail -1)
[[ -n "$preview_url" ]] && success "Preview URL: $preview_url"
