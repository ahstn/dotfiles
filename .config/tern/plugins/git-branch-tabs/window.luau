--!strict
-- Tern 0.8.4's vertical sidebar ignores chrome.tab_title. Name only tabs
-- that had no manual name, recording ownership so reload and restore are safe.
type Entry = { cwd: string, label: string?, pending: boolean, checked: number }
local entries: { [number]: Entry } = {}

-- Keep the full title accessible, but draw its branch as a separate CSS box.
-- These sidebar classes are from Tern 0.8.4's bundled styles.
tern.css("branch-rows", [[
#sidebar .tn-vt .nav-row[title*="\A branch: "] {
	position: relative;
	height: 48px;
	min-height: 48px;
}
#sidebar .tn-vt .nav-row[title*="\A branch: "] .lbl {
	white-space: pre;
	line-height: 19px;
	height: 19px;
	overflow: hidden;
	align-self: flex-start;
	margin-top: 6px;
}
#sidebar .tn-vt .nav-row[title*="\A branch: "]::after {
	position: absolute;
	left: 37px;
	right: 12px;
	bottom: 6px;
	font-size: 11px;
	line-height: 16px;
	color: var(--t3);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	pointer-events: none;
}
]])

local lastBranchStyles = ""

local function cssString(value: string): string
	return '"' .. string.gsub(value, '[%z\1-\31\127"\\]', function(char)
		return string.format("\\%x ", string.byte(char))
	end) .. '"'
end

local function key(tab: TabInfo): string
	return "tab." .. tostring(tab.id)
end

local function managed(tab: TabInfo): boolean
	local previous = tern.kv.get(key(tab))
	if tab.name == nil or tab.name == previous then
		return true
	end
	-- A manual rename always wins, including after a plugin reload.
	if previous ~= nil then
		tern.kv.set(key(tab), nil)
	end
	return false
end

local function apply(cx: WindowCx)
	local enabled = tern.kv.get("enabled") ~= false
	local branches: { [string]: boolean } = {}
	for _, tab in cx.session:tabs() do
		if not managed(tab) then
			continue
		end
		local entry = entries[tab.pane]
		local label: string? = nil
		if enabled and entry and entry.cwd == tab.cwd and entry.label and entry.label ~= "" then
			local title = tab.title
			if title == "" then
				title = string.match(tab.cwd or "", "([^/]+)/*$") or tab.program
			end
			label = title .. "\nbranch: " .. entry.label
			branches[entry.label] = true
		end
		if label ~= tab.name then
			-- Persist ownership before renaming, so reload can identify our names.
			tern.kv.set(key(tab), label)
			cx.layout:name_tab(tab.id, label)
		end
	end
	-- Longer matches follow shorter ones so main/topic wins over main.
	local names: { string } = {}
	for branch in branches do
		table.insert(names, branch)
	end
	table.sort(names, function(a, b)
		return if #a == #b then a < b else #a < #b
	end)
	local rules: { string } = {}
	for _, branch in names do
		table.insert(rules, "#sidebar .tn-vt .nav-row[title*=" .. cssString("\nbranch: " .. branch)
			.. "]::after { content: " .. cssString("branch: " .. branch) .. "; }")
	end
	local styles = table.concat(rules, "\n")
	if styles ~= lastBranchStyles then
		lastBranchStyles = styles
		tern.css("branch-values", styles)
	end
end

local function refresh(cx: WindowCx)
	if tern.kv.get("enabled") == false then
		apply(cx)
		return
	end
	local present: { [number]: boolean } = {}
	for _, tab in cx.session:tabs() do
		local pane = tab.pane
		local cwd = tab.cwd or ""
		if not managed(tab) or cwd == "" then
			continue
		end
		present[pane] = true
		local entry = entries[pane]
		if entry == nil or entry.cwd ~= cwd then
			entry = { cwd = cwd, label = nil, pending = false, checked = -math.huge }
			entries[pane] = entry
		end
		local current = entry :: Entry
		if current.pending or tern.now() - current.checked < 250 then
			continue
		end
		current.pending = true
		current.checked = tern.now()
		-- Resolving by pane ID rejects remote panes, even if their path exists locally.
		local ok = pcall(function()
			cx.git:repo(pane):next(function(repo: GitRepo?, _err: string?, callbackCx: WindowCx?)
				if entries[pane] ~= current then
					return
				end
				current.pending = false
				current.label = nil
				if repo then
					current.label = repo.branch
					if (current.label == nil or current.label == "") and repo.head then
						current.label = "detached:" .. string.sub(repo.head, 1, 7)
					end
				end
				if callbackCx then
					apply(callbackCx)
				end
			end)
		end)
		if not ok then
			current.pending = false
			current.label = nil
		end
	end
	for pane in entries do
		if not present[pane] then
			entries[pane] = nil
		end
	end
	apply(cx)
end

tern.command({
	id = "restore",
	title = "Git branch tabs: restore original titles",
	run = function(cx: WindowCx)
		tern.kv.set("enabled", false)
		apply(cx)
	end,
})

tern.command({
	id = "enable",
	title = "Git branch tabs: enable",
	run = function(cx: WindowCx)
		tern.kv.set("enabled", true)
		refresh(cx)
	end,
})

for _, event in { "focus", "cwd", "command_finished", "agent_finished", "tab_created" } do
	tern.on(event, function(_ev: any, cx: WindowCx)
		refresh(cx)
	end)
end

tern.on("tab_closed", function(ev: TabEvent, cx: WindowCx)
	tern.kv.set("tab." .. tostring(ev.tab), nil)
	refresh(cx)
end)

-- Start after reload as well as launch; window_start need not run on reload.
local function poll(cx: WindowCx?)
	if cx then
		refresh(cx)
	end
	tern.timer(5000, poll)
end
tern.timer(0, poll)
