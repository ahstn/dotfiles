import type { BuildSystemPromptOptions, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const PROMPT_FILE_NAME = "custom-system-prompt.md";

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function fileExists(path: string): boolean {
	try {
		return existsSync(path) && statSync(path).isFile();
	} catch {
		return false;
	}
}

function getAgentDir(): string {
	return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

function getPromptCandidates(cwd: string, isProjectTrusted: boolean): string[] {
	const agentDir = getAgentDir();
	const candidates = [
		...(isProjectTrusted
			? [join(cwd, PROMPT_FILE_NAME), join(cwd, ".pi", PROMPT_FILE_NAME)]
			: []),
		join(dirname(agentDir), PROMPT_FILE_NAME),
		join(agentDir, PROMPT_FILE_NAME),
	];

	return [...new Set(candidates)];
}

function readCustomPrompt(cwd: string, isProjectTrusted: boolean): string | undefined {
	const path = getPromptCandidates(cwd, isProjectTrusted).find(fileExists);
	if (!path) return undefined;

	const content = readFileSync(path, "utf8").trim();
	return content || undefined;
}

function buildToolList(pi: ExtensionAPI, options: BuildSystemPromptOptions): string {
	const snippets = options.toolSnippets ?? {};
	const activeTools = new Set(pi.getActiveTools());
	const tools = pi.getAllTools().filter((tool) => activeTools.has(tool.name));
	const toolList = tools
		.map((tool) => `- ${tool.name}: ${snippets[tool.name] ?? tool.description}`)
		.join("\n");

	return toolList || "(none)";
}

function buildGuidelines(options: BuildSystemPromptOptions): string {
	const guidelines = new Set<string>();

	for (const guideline of options.promptGuidelines ?? []) {
		const trimmed = guideline.trim();
		if (trimmed) guidelines.add(trimmed);
	}

	guidelines.add("Be concise in your responses");
	guidelines.add("Show file paths clearly when working with files");

	return [...guidelines].map((guideline) => `- ${guideline}`).join("\n");
}

function buildContextSection(options: BuildSystemPromptOptions): string {
	if (!options.contextFiles?.length) return "";

	const files = options.contextFiles
		.map(
			(file) => `<project_instructions path="${file.path}">\n${file.content}\n</project_instructions>`,
		)
		.join("\n\n");

	return `\n\n<project_context>\n\nProject-specific instructions and guidelines:\n\n${files}\n\n</project_context>`;
}

function buildSkillsSection(options: BuildSystemPromptOptions, hasReadTool: boolean): string {
	if (!hasReadTool) return "";

	const skills = options.skills?.filter((skill) => !skill.disableModelInvocation) ?? [];
	if (skills.length === 0) return "";

	const renderedSkills = skills
		.map(
			(skill) => `  <skill>\n    <name>${escapeXml(skill.name)}</name>\n    <description>${escapeXml(skill.description)}</description>\n    <location>${escapeXml(skill.filePath)}</location>\n  </skill>`,
		)
		.join("\n");

	return `\n\nThe following skills provide specialized instructions for specific tasks.
Use the read tool to load a skill's file when the task matches its description.
When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.

<available_skills>\n${renderedSkills}\n</available_skills>`;
}

function buildSystemPrompt(pi: ExtensionAPI, customPrompt: string, options: BuildSystemPromptOptions): string {
	const date = new Date().toISOString().slice(0, 10);
	const cwd = options.cwd.replace(/\\/g, "/");
	const activeTools = new Set(pi.getActiveTools());
	const appendSection = options.appendSystemPrompt ? `\n\n${options.appendSystemPrompt}` : "";

	return `${customPrompt}

Available tools:
${buildToolList(pi, options)}

In addition to the tools above, you may have access to other custom tools depending on the project.

Guidelines:
${buildGuidelines(options)}${appendSection}${buildContextSection(options)}${buildSkillsSection(options, activeTools.has("read"))}

Current date: ${date}
Current working directory: ${cwd}`;
}

export default function customSystemPrompt(pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event, ctx) => {
		const customPrompt = readCustomPrompt(ctx.cwd, ctx.isProjectTrusted());
		if (!customPrompt) return;

		return {
			systemPrompt: buildSystemPrompt(pi, customPrompt, event.systemPromptOptions),
		};
	});
}
