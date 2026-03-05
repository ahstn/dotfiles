# Generated dynamically to avoid stale vendored files.

if command -sq docker
  docker completion fish 2>/dev/null | source
end
