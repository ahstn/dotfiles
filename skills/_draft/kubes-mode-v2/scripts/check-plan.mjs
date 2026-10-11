#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const RULE = "Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are checked or marked n/a with a reason. Live verification is required for user-facing surfaces.";
const TICK_PROMPT = "Re-read the plan, applicable playbooks, and armed goal. Audit execution against them and fix drift. Check active work by observable evidence; stop or replace stuck work when authorized. Report only newly observed tracked changes, new or cleared blockers, and decisions requiring the operator. If nothing changed, send no status message.";
const PROGRAM_HEADINGS = ["Arm the program", "Assign owners and dependencies", "PR mechanics", "Verdict and merge", "Live verification setup"];
const APPENDICES = ["Appendix A. Prototype evidence", "Appendix B. Alternatives rejected", "Appendix C. Risks", "Appendix D. Links and reading list"];
const SUB_BLOCKS = ["Depends on.", "Files.", "Build.", "You see.", "Verify, unit.", "Verify, live.", "Verify, perf.", "Review gate.", "Merge."];
const PERF_ITEMS = ["Metric.", "Probe.", "Baseline.", "Rule."];
const BOX = /^\s*- \[[ xX]\] (.+)$/;
const file = process.argv[2];
if (!file || process.argv.length !== 3) {
	console.error("Usage: node scripts/check-plan.mjs <plan.md>");
	process.exit(2);
}
let raw;
try {
	raw = fs.readFileSync(file, "utf8").split(/\r?\n/);
} catch (error) {
	console.error(`${file}: ${error.message}`);
	process.exit(2);
}
const problems = [];
const fail = (n, message) => problems.push(`${file}:${n}: ${message}`);
let start = 0;
if (raw[0] === "---") {
	const end = raw.indexOf("---", 1);
	if (end === -1) fail(1, "unclosed frontmatter");
	else start = end + 1;
}
const lines = [];
let fence = null;
for (let i = start; i < raw.length; i++) {
	const text = raw[i];
	const marker = text.match(/^\s*(`{3,}|~{3,})/);
	const code = fence !== null || marker !== null;
	if (marker) {
		if (!fence) fence = marker[1];
		else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
	}
	lines.push({ n: i + 1, text, code });
	if (/<[^>\n]+>/.test(text)) fail(i + 1, "unfilled angle-bracket placeholder");
}
if (fence) fail(raw.length, "unclosed code fence");
const sections = [];
for (const line of lines) {
	if (!line.code && line.text.startsWith("## ")) {
		sections.push({ title: line.text.slice(3).trim(), n: line.n, body: [] });
	} else if (sections.length) sections.at(-1).body.push(line);
}
const find = (title) => sections.find((s) => s.title === title);
const textOf = (section) => section.body.filter((l) => !l.code).map((l) => l.text).join("\n");
const boxes = (body) => body.filter((l) => !l.code && BOX.test(l.text)).map((l) => ({ n: l.n, text: l.text.match(BOX)[1] }));
const isNA = (box) => /^n\/a\.\s+\S/i.test(box.text);
const h1s = lines.filter((l) => !l.code && /^# /.test(l.text));
if (h1s.length !== 1) fail(1, "expected exactly one H1 title");
for (const title of ["How to read this", "Program checklist", "Close the program", ...APPENDICES]) {
	const matches = sections.filter((s) => s.title === title);
	if (matches.length !== 1) fail(1, `expected exactly one "## ${title}" section`);
}
const how = find("How to read this");
if (how) {
	if (sections[0] !== how) fail(how.n, "How to read this must be the first H2 section");
	if (h1s.length === 1) {
		const intro = lines.filter((l) => l.n > h1s[0].n && l.n < how.n && l.text.trim());
		if (intro.length >= 10) fail(h1s[0].n, "intro must be under ten lines");
	}
	for (const marker of ["One box is one unit of work", "names the evidence", "Check a box only when its evidence exists", "playbooks/", RULE]) {
		if (!textOf(how).includes(marker)) fail(how.n, `How to read this lacks "${marker}"`);
	}
}
const program = find("Program checklist");
if (program) {
	if (sections[1] !== program) fail(program.n, "Program checklist must follow How to read this");
	const headings = program.body.filter((l) => !l.code && l.text.startsWith("### ")).map((l) => l.text.slice(4).trim());
	if (headings.join("|") !== PROGRAM_HEADINGS.join("|")) fail(program.n, `program headings must be ${PROGRAM_HEADINGS.join("; ")} in order`);
	for (const marker of ["explicit go", "/goal", "30-minute audit tick", TICK_PROMPT]) {
		if (!textOf(program).includes(marker)) fail(program.n, `Program checklist lacks "${marker}"`);
	}
	let heading = null;
	const counts = new Map();
	for (const line of program.body) {
		if (!line.code && line.text.startsWith("### ")) heading = line.text.slice(4).trim();
		else if (!line.code && BOX.test(line.text) && heading) counts.set(heading, (counts.get(heading) ?? 0) + 1);
	}
	for (const title of PROGRAM_HEADINGS) if (!counts.get(title)) fail(program.n, `${title} has no checklist box`);
}
const close = find("Close the program");
const programIndex = sections.indexOf(program);
const closeIndex = sections.indexOf(close);
const prs = programIndex >= 0 && closeIndex > programIndex ? sections.slice(programIndex + 1, closeIndex) : [];
if (!prs.length) fail(1, "no PR sections between Program checklist and Close the program");
const ids = new Set();
for (const pr of prs) {
	const id = pr.title.match(/\(([^()]+)\)$/)?.[1];
	if (!id) fail(pr.n, "PR section title must end in (PR id)");
	else if (ids.has(id)) fail(pr.n, `duplicate PR id ${id}`);
	else ids.add(id);
	const blocks = [];
	for (const line of pr.body) {
		if (line.code) continue;
		const match = line.text.match(/^\*\*([^*]+)\*\*(.*)$/);
		if (match && SUB_BLOCKS.includes(match[1])) blocks.push({ name: match[1], n: line.n, rest: match[2].trim(), body: [] });
		else if (blocks.length) blocks.at(-1).body.push(line);
	}
	if (blocks.map((b) => b.name).join("|") !== SUB_BLOCKS.join("|")) fail(pr.n, `sub-blocks must be ${SUB_BLOCKS.join("; ")} in order`);
	const block = (name) => blocks.find((b) => b.name === name);
	const depends = block("Depends on.");
	if (depends && !depends.rest) fail(depends.n, "Depends on names nothing");
	for (const name of ["Files.", "Build.", "You see.", "Verify, unit.", "Merge."]) {
		const b = block(name);
		if (b && !boxes(b.body).length) fail(b.n, `${name} has no box`);
	}
	for (const name of ["Verify, unit.", "Verify, live.", "Verify, perf."]) {
		const b = block(name);
		if (b && b.rest !== RULE) fail(b.n, `${name} must contain exactly the verification rule`);
	}
	const unit = block("Verify, unit.");
	if (unit) {
		for (const box of boxes(unit.body)) {
			if (/^n\/a\b/i.test(box.text) && !isNA(box)) fail(box.n, "unit n/a needs a specific reason after 'n/a.'");
		}
	}
	const live = block("Verify, live.");
	if (live) {
		const items = boxes(live.body);
		const scope = items[0];
		const userFacing = scope && /^Scope\. user-facing\b/.test(scope.text);
		const notUserFacing = scope && /^Scope\. not-user-facing\b/.test(scope.text);
		if ((!userFacing && !notUserFacing) || !/^Scope\. (?:user-facing|not-user-facing)[,.: ]+\S/.test(scope?.text ?? "")) fail(live.n, "live starts with Scope. user-facing or not-user-facing and an explanation");
		const scenarios = items.slice(1);
		if (!scenarios.length) fail(live.n, "live needs scenario boxes or an n/a reason");
		if (scenarios.some(isNA)) {
			if (!notUserFacing || scenarios.length !== 1) fail(live.n, "live n/a is allowed only as the sole non-scope box for a not-user-facing unit");
		} else {
			for (const item of scenarios) {
				if (!/^Scenario\. \S/.test(item.text) || !/Save `[^`]+`/.test(item.text) || !/Pass when \S/.test(item.text)) fail(item.n, "live scenario needs Scenario., Save `artifact path`, and Pass when predicate");
			}
		}
	}
	const perf = block("Verify, perf.");
	if (perf) {
		const items = boxes(perf.body);
		if (!(items.length === 1 && isNA(items[0]))) {
			if (items.map((b) => b.text.split(" ")[0]).join("|") !== PERF_ITEMS.join("|")) fail(perf.n, "perf needs Metric., Probe., Baseline., Rule. boxes or one n/a. reason box");
			for (const item of items) if (!/^\S+\.\s+\S/.test(item.text)) fail(item.n, "perf box needs filled content");
		}
	}
	const review = block("Review gate.");
	if (review) {
		const items = boxes(review.body);
		if (/^None\.\s+\S/.test(review.rest)) {
			if (items.length) fail(review.n, "Review gate None must not have boxes");
		} else if (!review.rest || !items.length || !/operator/i.test(review.rest + textOf({ body: review.body }))) fail(review.n, "Review gate needs operator approval boxes, or None. with a reason");
	}
	console.log(`${pr.title}  boxes=${boxes(pr.body).length}`);
}
if (close) {
	if (!boxes(close.body).length) fail(close.n, "Close the program has no box");
	const tail = sections.slice(closeIndex + 1);
	if (tail.map((s) => s.title).join("|") !== APPENDICES.join("|")) fail(close.n, "appendices must follow Close the program in skeleton order");
	for (const appendix of tail) if (!textOf(appendix).trim()) fail(appendix.n, "appendix is empty");
}
console.log(`${prs.length} PR sections, ${problems.length} problems`);
for (const problem of problems) console.error(problem);
process.exit(problems.length ? 1 : 0);
