# Compatibility layer for tools that invoke bash (e.g. GUI apps).
# - Ensure local user bin is on PATH
# - Activate mise so shims/tools are available
case ":$PATH:" in
	*":$HOME/.local/bin:"*) ;;
	*) export PATH="$HOME/.local/bin:$PATH" ;;
esac

if [ -x "$HOME/.local/bin/mise" ]; then
	eval "$("$HOME/.local/bin/mise" activate bash)"
fi

# Load ~/.bashrc for login shells.
if [ -f "$HOME/.bashrc" ]; then
  . "$HOME/.bashrc"
fi
