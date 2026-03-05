# Interactive tooling initialization.

if not status is-interactive
  exit
end

if command -sq mise
  mise activate fish | source
end

if command -sq starship
  starship init fish | source
end

if command -sq tv
  tv init fish | source
end
