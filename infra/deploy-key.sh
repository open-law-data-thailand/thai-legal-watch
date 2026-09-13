#!/bin/bash
# deploy-key.sh — make this machine able to `git pull` without a human at the keyboard.
#
# cron has no ssh agent, so agent forwarding (which works when you ssh in yourself) is not
# available to the nightly. This creates a key that lives only on this machine and prints the
# public half for you to paste into GitHub. Read-only is enough: the box never pushes.
set -euo pipefail
KEY="${1:-$HOME/.ssh/tlw_deploy}"

if [[ ! -f "$KEY" ]]; then
  ssh-keygen -t ed25519 -N '' -C "thai-legal-watch deploy key ($(hostname))" -f "$KEY" >/dev/null
  echo "created $KEY"
fi
grep -q "Host github.com-tlw" "$HOME/.ssh/config" 2>/dev/null || cat >> "$HOME/.ssh/config" <<CFG

Host github.com-tlw
  HostName github.com
  User git
  IdentityFile $KEY
  IdentitiesOnly yes
CFG
chmod 600 "$HOME/.ssh/config"

cat <<TXT

Paste this into GitHub → the repository → Settings → Deploy keys → Add deploy key.
Leave "Allow write access" UNCHECKED.

$(cat "$KEY.pub")

Then point the checkout at it:
  git -C ~/src/thai-legal-watch remote set-url origin git@github.com-tlw:open-law-data-thailand/thai-legal-watch.git
  git -C ~/src/thai-legal-watch ls-remote origin >/dev/null && echo "pull works from cron"
TXT
