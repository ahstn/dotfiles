# Generated dynamically to avoid stale vendored files.
# This intentionally overrides fish's built-in npm completions.

if command -sq npm
  npm completion --shell=fish 2>/dev/null | source
end
