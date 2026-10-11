#!/usr/bin/env bash
# Read-only audit. Buckets are review hints, never deletion permission.
# Usage: bash scripts/worktree-audit.sh [repo-path]
set -u
export GIT_OPTIONAL_LOCKS=0

repo="${1:-.}"
if ! git -C "$repo" rev-parse --git-dir >/dev/null 2>&1; then
	printf 'not in a git repo; pass a repo path\n' >&2
	exit 1
fi

# Use existing refs only: fetching would mutate the repository during an audit.
base=$(git -C "$repo" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)
if [ -z "$base" ]; then
	for candidate in origin/main origin/master main master; do
		if git -C "$repo" rev-parse --verify "$candidate^{commit}" >/dev/null 2>&1; then
			base="$candidate"
			break
		fi
	done
fi
printf 'Merge base: %s (local refs only; may be stale). Usage must be checked separately.\n' "${base:-unknown}" >&2

# Optional PR lookup is read-only. Unknown metadata is not a clean bill of health.
prs=""
pr_available=no
if command -v gh >/dev/null 2>&1; then
	if prs=$(cd "$repo" && gh pr list --state all --limit 1000 \
		--json number,state,headRefName \
		--template '{{range .}}{{.headRefName}}{{"\t"}}#{{.number}}/{{.state}}{{"\n"}}{{end}}' 2>/dev/null); then
		pr_available=yes
	fi
fi
[ "$pr_available" = yes ] || printf 'PR metadata unavailable; merge and usage review remains required.\n' >&2

now=$(date +%s)
main_wt=""
printf 'SIZE_KB\tAGE\tMERGED\tDIRTY\tREMOTE\tPR\tBUCKET\tWORKTREE\n'
while IFS= read -r -d '' field; do
	case "$field" in 'worktree '*) wt="${field#worktree }" ;; *) continue ;; esac
	[ -n "$main_wt" ] || main_wt="$wt"
	usage=$(du -sk "$wt" 2>/dev/null || true)
	size="${usage%%$'\t'*}"
	[ -n "$size" ] || size=0
	head=$(git -C "$wt" rev-parse --verify HEAD 2>/dev/null || true)
	head_ts=$(git -C "$wt" log -1 --format=%ct HEAD 2>/dev/null || true)
	age="?"
	if [[ "$head_ts" =~ ^[0-9]+$ ]]; then age="$(( (now - head_ts) / 86400 ))d"; fi
	merged=unknown
	if [ -n "$base" ] && [ -n "$head" ]; then
		if git -C "$repo" merge-base --is-ancestor "$head" "$base" 2>/dev/null; then merged=YES
		else merged=no; fi
	fi

	# Count NUL-delimited status records, including a second path for renames.
	dirty=unknown
	if git -C "$wt" status --porcelain --untracked-files=all >/dev/null 2>&1; then
		tracked=0
		untracked=0
		while IFS= read -r -d '' entry; do
			status="${entry:0:2}"
			case "$status" in
				'??') untracked=$((untracked + 1)) ;;
				*) tracked=$((tracked + 1)) ;;
			esac
			case "$status" in *R*|*C*) IFS= read -r -d '' ignored_path || true ;; esac
		done < <(git -C "$wt" status --porcelain -z --untracked-files=all 2>/dev/null)
		if [ "$tracked" -gt 0 ]; then dirty="wip:$tracked,untracked:$untracked"
		elif [ "$untracked" -gt 0 ]; then dirty="untracked:$untracked"
		else dirty=clean; fi
	fi

	branch=$(git -C "$wt" symbolic-ref --quiet --short HEAD 2>/dev/null || true)
	remote=detached
	if [ -n "$branch" ]; then
		remote=no-remote
		if git -C "$wt" show-ref --verify --quiet "refs/remotes/origin/$branch"; then
			ahead=$(git -C "$wt" rev-list --count "refs/remotes/origin/$branch..HEAD" 2>/dev/null || true)
			behind=$(git -C "$wt" rev-list --count "HEAD..refs/remotes/origin/$branch" 2>/dev/null || true)
			if [ "$ahead" = 0 ] && [ "$behind" = 0 ]; then remote=pushed
			else remote="ahead:${ahead:-?},behind:${behind:-?}"; fi
		fi
	fi
	pr=unknown
	if [ "$pr_available" = yes ]; then
		pr="-"
		while IFS=$'\t' read -r pr_branch pr_state; do
			if [ -n "$branch" ] && [ "$pr_branch" = "$branch" ]; then pr="$pr_state"; break; fi
		done <<< "$prs"
	fi

	# Even a clean merged worktree may contain ignored data or active processes.
	bucket=review
	if [ "$wt" = "$main_wt" ]; then bucket=hold-main
	elif [ "$dirty" != clean ]; then bucket=hold-files
	elif [[ "$pr" == */OPEN ]]; then bucket=hold-open-pr
	elif [ "$merged" = YES ] || [[ "$pr" == */MERGED ]]; then bucket=review-merged
	fi
	# Escape tabs and newlines so unusual paths cannot corrupt the table.
	display_wt="${wt//$'\t'/\\t}"
	display_wt="${display_wt//$'\n'/\\n}"
	printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
		"$size" "$age" "$merged" "$dirty" "$remote" "$pr" "$bucket" "$display_wt"
done < <(git -C "$repo" worktree list --porcelain -z) | sort -t$'\t' -k1,1nr
