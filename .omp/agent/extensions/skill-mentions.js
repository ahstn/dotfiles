import path from "node:path";

const SKILL_PREFIX = "skill:";
const MENTION = /(?:^|\s)\$([\w-]*)$/;

function matches(query, name) {
  let index = 0;
  for (const character of name.toLowerCase()) {
    if (character === query[index]) index++;
    if (index === query.length) return true;
  }
  return index === query.length;
}

export default function skillMentions(pi) {
  // OMP only auto-opens its built-in triggers (/, @, ^, #). Route `$` through
  // the editor's Tab path, which asks getForceFileSuggestions for a popup.
  class SkillEditor extends pi.pi.CustomEditor {
    handleInput(data) {
      super.handleInput(data);
      if (data !== "$" || this.isShowingAutocomplete()) return;
      const { line, col } = this.getCursor();
      if (MENTION.test(this.getLines()[line].slice(0, col))) super.handleInput("\t");
    }
  }

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;

    ctx.ui.setEditorComponent((tui, theme, keybindings) => new SkillEditor(tui, theme, keybindings));
    ctx.ui.addAutocompleteProvider((current) => ({
      getSuggestions(lines, cursorLine, cursorCol, signal) {
        return suggestSkills(lines, cursorLine, cursorCol, () =>
          current.getSuggestions(lines, cursorLine, cursorCol, signal),
        );
      },
      getForceFileSuggestions(lines, cursorLine, cursorCol, signal) {
        return suggestSkills(lines, cursorLine, cursorCol, () =>
          current.getForceFileSuggestions?.(lines, cursorLine, cursorCol, signal) ?? null,
        );
      },
      applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
        if (!prefix.startsWith("$")) return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
        const start = cursorCol - prefix.length;
        const updated = [...lines];
        updated[cursorLine] = lines[cursorLine].slice(0, start) + item.value + lines[cursorLine].slice(cursorCol);
        return { lines: updated, cursorLine, cursorCol: start + item.value.length };
      },
      getInlineHint: current.getInlineHint?.bind(current),
      trySyncSlashCompletion: current.trySyncSlashCompletion?.bind(current),
      trySyncInlineReplace: current.trySyncInlineReplace?.bind(current),
      shouldTriggerFileCompletion: current.shouldTriggerFileCompletion?.bind(current),
    }));

    function suggestSkills(lines, cursorLine, cursorCol, fallback) {
      const before = lines[cursorLine].slice(0, cursorCol);
      const mention = MENTION.exec(before);
      if (!mention) return fallback();

      const query = mention[1].toLowerCase();
      const items = pi.getCommands()
        .filter((command) => command.source === "skill" && command.name.startsWith(SKILL_PREFIX) && command.path)
        .map((command) => {
          const name = command.name.slice(SKILL_PREFIX.length);
          return {
            value: `[${name}](${path.resolve(command.path)})`,
            label: name,
            description: command.description,
          };
        })
        .filter((item) => matches(query, item.label))
        .sort((a, b) => a.label.localeCompare(b.label));

      return items.length ? { items, prefix: `$${mention[1]}` } : null;
    }
  });
}
