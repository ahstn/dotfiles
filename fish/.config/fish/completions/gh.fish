# Generated dynamically to avoid stale vendored files.

if command -sq gh
  gh completion -s fish 2>/dev/null | source
end
