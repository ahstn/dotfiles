## Main entrypoint for interactive fish shells.
## Fish automatically sources `conf.d/*.fish` before this file.

if status is-interactive
  # Keep startup quiet.
  set -g fish_greeting
end
