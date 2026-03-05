#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Capture a local GH CLI help snapshot for research workflows.

Usage:
  bash scripts/refresh_gh_help_snapshot.sh [--out-dir PATH]

Options:
  --out-dir PATH   Output directory. Default: /tmp/gh-help-snapshot-<timestamp>
  --help           Show this help
EOF
}

OUT_DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out-dir)
      if [[ $# -lt 2 ]]; then
        echo "Error: --out-dir requires a value" >&2
        exit 2
      fi
      OUT_DIR="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Error: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh is not installed or not on PATH" >&2
  exit 1
fi

if [[ -z "${OUT_DIR}" ]]; then
  OUT_DIR="/tmp/gh-help-snapshot-$(date +%Y%m%d-%H%M%S)"
fi

mkdir -p "${OUT_DIR}"

COMMANDS=(
  "gh --help"
  "gh api --help"
  "gh search --help"
  "gh search code --help"
  "gh search prs --help"
  "gh search repos --help"
  "gh pr --help"
  "gh pr list --help"
  "gh pr view --help"
  "gh pr diff --help"
  "gh pr create --help"
  "gh repo --help"
  "gh repo view --help"
  "gh repo list --help"
  "gh help formatting"
)

INDEX_FILE="${OUT_DIR}/_index.tsv"
printf "command\tfile\tstatus\n" > "${INDEX_FILE}"

for cmd in "${COMMANDS[@]}"; do
  safe_name="$(echo "${cmd}" | tr ' ' '_' | tr -d '-' | tr -cd '[:alnum:]_')"
  out_file="${OUT_DIR}/${safe_name}.txt"

  {
    echo "### ${cmd}"
    echo
    eval "${cmd}"
  } > "${out_file}" 2>&1

  printf "%s\t%s\tok\n" "${cmd}" "${out_file}" >> "${INDEX_FILE}"
done

{
  echo "gh_version=$(gh --version | head -n 1)"
  echo "generated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "${OUT_DIR}/_meta.txt"

echo "Wrote GH help snapshot to: ${OUT_DIR}"
echo "Index: ${INDEX_FILE}"
