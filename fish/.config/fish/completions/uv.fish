# Generated dynamically to avoid stale vendored files.
# This intentionally overrides fish's built-in uv completions.

if command -sq uv
  uv generate-shell-completion fish 2>/dev/null | source
end
