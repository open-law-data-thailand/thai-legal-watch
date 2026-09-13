# shellcheck shell=bash
# Sourced by deploy.sh and nightly.sh. A cron shell gets /usr/bin/node, which on the build box is
# v18 — too old for Vite 8 — while the version the project needs sits under nvm. Load nvm if it is
# there, then refuse to continue on anything older than 20 rather than failing deep inside a build.
NEED_NODE_MAJOR=20

if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt "$NEED_NODE_MAJOR" ]]; then
  for nvm in "$HOME/.nvm/nvm.sh" "/usr/local/nvm/nvm.sh"; do
    # shellcheck disable=SC1090
    [[ -s "$nvm" ]] && { . "$nvm" >/dev/null; nvm use --silent node >/dev/null 2>&1 || nvm use --silent default >/dev/null 2>&1; break; }
  done
fi

command -v node >/dev/null || { echo "node is not installed — the site needs Node >= $NEED_NODE_MAJOR" >&2; exit 1; }
have=$(node -p 'process.versions.node.split(".")[0]')
[[ "$have" -ge "$NEED_NODE_MAJOR" ]] || {
  echo "node $(node -v) is too old — Vite needs >= $NEED_NODE_MAJOR. Install it, or nvm install --lts." >&2
  exit 1
}
