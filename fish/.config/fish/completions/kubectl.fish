# Generated dynamically to avoid stale vendored files.

if command -sq kubectl
  kubectl completion fish 2>/dev/null | source
end
