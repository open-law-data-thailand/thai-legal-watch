#!/bin/bash
# link-dataset.sh — assemble the root tlw-build expects (meta/ + taxonomy/) out of wherever the
# dataset actually lives on this machine. Symlinks only; nothing is copied.
#
#   infra/link-dataset.sh [root] [meta-dir] [taxonomy-dir]
#
# then put the result in ~/src/.env as TLW_DATA_ROOT=<root>.
set -euo pipefail
ROOT="${1:-$HOME/olw-build/tlw-root}"
META="${2:-${TLW_META_DIR:-/mnt/soc-ratchakitcha/huggingface/soc-ratchakitcha/meta}}"
TAX="${3:-${TLW_TAXONOMY_DIR:-$HOME/olw-build/ontology}}"

[[ -d "$META" ]] || { echo "no meta at $META" >&2; exit 1; }
[[ -d "$TAX" ]] || { echo "no taxonomy at $TAX" >&2; exit 1; }
[[ -f "$TAX/taxonomy.json" ]] || echo "warning: $TAX has no taxonomy.json" >&2

mkdir -p "$ROOT"
ln -sfn "$META" "$ROOT/meta"
ln -sfn "$TAX" "$ROOT/taxonomy"
count_years() { find -L "$1" -mindepth 1 -maxdepth 1 -name '[0-9][0-9][0-9][0-9]' | wc -l; }
echo "$ROOT/meta      -> $META      ($(count_years "$ROOT/meta") years)"
echo "$ROOT/taxonomy  -> $TAX  ($(count_years "$ROOT/taxonomy") years)"
echo
echo "add to ~/src/.env:  TLW_DATA_ROOT=$ROOT"
