/**
 * Skill autocomplete for pi.
 *
 * Press `$` in the editor to open an autocomplete menu of loaded skills.
 * Selecting a skill inserts the skill name wrapped in backticks, e.g. `code-review`.
 *
 * This uses pi's own discovered slash commands via `pi.getCommands()`, so it automatically
 * respects global/project skill discovery, including settings.json `skills` paths.
 */

import {
	CustomEditor,
	type ExtensionAPI,
	type SlashCommandInfo,
} from "@mariozechner/pi-coding-agent";
import { matchesKey, type AutocompleteItem, type AutocompleteProvider } from "@mariozechner/pi-tui";

const SKILL_COMMAND_PREFIX = "skill:";
const SKILL_TRIGGER = "$";

function extractSkillPrefix(textBeforeCursor: string): string | null {
	const match = textBeforeCursor.match(/(?:^|[\s([{\"'])((?:\$)[a-z0-9-]*)$/i);
	return match?.[1] ?? null;
}

function getSkillName(command: SlashCommandInfo): string | null {
	if (command.source !== "skill") return null;
	return command.name.startsWith(SKILL_COMMAND_PREFIX)
		? command.name.slice(SKILL_COMMAND_PREFIX.length)
		: command.name;
}

function scoreSkill(name: string, query: string): number {
	const lowerName = name.toLowerCase();
	const lowerQuery = query.toLowerCase();

	if (!lowerQuery) return 0;
	if (lowerName === lowerQuery) return 0;
	if (lowerName.startsWith(lowerQuery)) return 1;
	if (lowerName.includes(lowerQuery)) return 2;
	return 3;
}

function buildSkillItems(commands: SlashCommandInfo[]): AutocompleteItem[] {
	return commands
		.filter((command): command is SlashCommandInfo => command.source === "skill")
		.map((command) => {
			const skillName = getSkillName(command);
			if (!skillName) return null;

			const scope = command.sourceInfo.scope;
			const scopeLabel = scope === "temporary" ? "session" : scope;
			const description = [command.description, `[${scopeLabel}]`].filter(Boolean).join(" ");

			return {
				value: `\`${skillName}\``,
				label: skillName,
				description,
			} satisfies AutocompleteItem;
		})
		.filter((item): item is AutocompleteItem => item !== null)
		.sort((a, b) => a.label.localeCompare(b.label));
}

class SkillAutocompleteProvider implements AutocompleteProvider {
	constructor(
		private readonly base: AutocompleteProvider,
		private readonly getSkillItems: () => AutocompleteItem[],
	) { }

	getSuggestions(lines: string[], cursorLine: number, cursorCol: number) {
		const currentLine = lines[cursorLine] ?? "";
		const textBeforeCursor = currentLine.slice(0, cursorCol);
		const prefix = extractSkillPrefix(textBeforeCursor);

		if (!prefix) {
			return this.base.getSuggestions(lines, cursorLine, cursorCol);
		}

		const query = prefix.slice(SKILL_TRIGGER.length);
		const items = this.getSkillItems()
			.filter((item) => {
				if (!query) return true;
				const label = item.label.toLowerCase();
				const needle = query.toLowerCase();
				return label.startsWith(needle) || label.includes(needle);
			})
			.sort((a, b) => {
				const scoreDiff = scoreSkill(a.label, query) - scoreSkill(b.label, query);
				if (scoreDiff !== 0) return scoreDiff;
				return a.label.localeCompare(b.label);
			});

		if (items.length === 0) return null;

		return { items, prefix };
	}

	applyCompletion(lines: string[], cursorLine: number, cursorCol: number, item: AutocompleteItem, prefix: string) {
		if (!prefix.startsWith(SKILL_TRIGGER)) {
			return this.base.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
		}

		const currentLine = lines[cursorLine] ?? "";
		const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
		const afterCursor = currentLine.slice(cursorCol);
		const newLines = [...lines];
		newLines[cursorLine] = `${beforePrefix}${item.value}${afterCursor}`;

		return {
			lines: newLines,
			cursorLine,
			cursorCol: beforePrefix.length + item.value.length,
		};
	}
}

class SkillAutocompleteEditor extends CustomEditor {
	constructor(
		tui: ConstructorParameters<typeof CustomEditor>[0],
		theme: ConstructorParameters<typeof CustomEditor>[1],
		keybindings: ConstructorParameters<typeof CustomEditor>[2],
		private readonly wrapProvider: (provider: AutocompleteProvider) => AutocompleteProvider,
	) {
		super(tui, theme, keybindings);
	}

	override setAutocompleteProvider(provider: AutocompleteProvider): void {
		super.setAutocompleteProvider(this.wrapProvider(provider));
	}

	override handleInput(data: string): void {
		super.handleInput(data);

		if (this.isShowingAutocomplete()) return;
		if (!this.shouldRetriggerSkillAutocomplete(data)) return;
		if (!this.getCurrentSkillPrefix()) return;

		(this as unknown as { tryTriggerAutocomplete?: () => void }).tryTriggerAutocomplete?.();
	}

	private shouldRetriggerSkillAutocomplete(data: string): boolean {
		return (
			data === SKILL_TRIGGER ||
			/^[a-z0-9-]$/i.test(data) ||
			matchesKey(data, "backspace") ||
			matchesKey(data, "delete")
		);
	}

	private getCurrentSkillPrefix(): string | null {
		const { line, col } = this.getCursor();
		const currentLine = this.getLines()[line] ?? "";
		return extractSkillPrefix(currentLine.slice(0, col));
	}
}

export default function skillAutocompleteExtension(pi: ExtensionAPI) {
	const getSkillItems = () => buildSkillItems(pi.getCommands());

	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setEditorComponent((tui, theme, keybindings) =>
			new SkillAutocompleteEditor(
				tui,
				theme,
				keybindings,
				(baseProvider) => new SkillAutocompleteProvider(baseProvider, getSkillItems),
			),
		);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		ctx.ui.setEditorComponent(undefined);
	});
}
