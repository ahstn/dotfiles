import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import source from "./opencode.jsonc"

type Effect = "allow" | "ask" | "deny"
type Rule = { action: string; resource: string; effect: Effect }

type Reference = { repository?: string; branch?: string; path?: string; description: string }
type Config = {
  $schema: string; permissions: Rule[]; references: Record<string, Reference>;
  formatter: { prettier: { disabled: boolean } }; warming: boolean;
  websearch: { provider: string }; skills: string[];
  permission?: unknown; server?: unknown; providers?: unknown;
}
// Bun's .jsonc module loader predates Bun.JSONC.parse (added in 1.3.6).
const config = source as Config

// Model only the documented whole-value wildcard matching and shell's trailing
// ` *` shorthand. No shell, SQL, or MCP arguments are executed or parsed here.
function matches(pattern: string, value: string, shell = false): boolean {
  const source = pattern
    .split("")
    .map((character) => {
      if (character === "*") return ".*"
      if (character === "?") return "."
      return character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    })
    .join("")
  if (new RegExp(`^${source}$`, "s").test(value)) return true
  return shell && pattern.endsWith(" *") && matches(pattern.slice(0, -2), value)
}

function effect(action: string, resource: string): Effect {
  let result: Effect = "ask"
  for (const rule of config.permissions as Rule[]) {
    // Config loading expands leading ~ for path permissions, but not shell text.
    const pattern = ["external_directory", "read", "edit"].includes(action)
      ? rule.resource.replace(/^~(?=\/|$)/, () => homedir())
      : rule.resource
    if (matches(rule.action, action) && matches(pattern, resource, action === "shell")) {
      result = rule.effect
    }
  }
  return result
}

describe("configuration structure", () => {
  test("uses native V2 rules with default allow and no embedded credentials", () => {
    expect(config.$schema).toBe("https://opencode.ai/config.json")
    expect(config.permissions[0]).toEqual({ action: "*", resource: "*", effect: "allow" })
    expect(config.permission).toBeUndefined()
    expect(config.server).toBeUndefined()
    expect(config.providers).toBeUndefined()
    expect(config.warming).toBe(false)
    expect(config.formatter.prettier.disabled).toBe(true)
    const seen = new Set<string>()
    for (const rule of config.permissions as Rule[]) {
      expect(Object.keys(rule).sort()).toEqual(["action", "effect", "resource"])
      expect(["allow", "ask", "deny"]).toContain(rule.effect)
      const key = `${rule.action}\0${rule.resource}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })

  test("references upstream V2 and the local personal dotfiles checkout", () => {
    expect(Object.keys(config.references).sort()).toEqual(["axum", "dotfiles", "opencode", "tanstack-router"])
    expect(config.references.axum.repository).toBe("tokio-rs/axum")
    expect(config.references["tanstack-router"].repository).toBe("TanStack/router")
    expect(config.references.opencode.repository).toBe("anomalyco/opencode")
    expect(config.references.opencode.branch).toBeUndefined()
    expect(config.references.dotfiles.path).toBe("~/git/dotfiles")
    for (const reference of Object.values(config.references) as { description: string }[]) {
      expect(reference.description.length).toBeGreaterThan(0)
    }
  })

  test("explicitly selects Exa without embedding a search credential", () => {
    expect(config.websearch).toEqual({ provider: "exa" })
  })

  test("loads shared skills directly from the dotfiles source", () => {
    expect(config.skills).toEqual(["~/git/dotfiles/skills"])
  })

  test("uses the native V2 external_directory action and trusted path exceptions", () => {
    expect(config.permissions.filter((rule: Rule) => rule.action === "external_directory")).toEqual([
      { action: "external_directory", resource: "*", effect: "ask" },
      { action: "external_directory", resource: "~/git/dotfiles/*", effect: "allow" },
      { action: "external_directory", resource: "~/.cache/github/*", effect: "allow" },
    ])
    expect(config.permissions.some((rule: Rule) => rule.action === "external-directory")).toBe(false)
  })

  test("mise deploys only the config file, not the entire runtime directory", () => {
    const mise = Bun.TOML.parse(readFileSync(new URL("../../mise.toml", import.meta.url), "utf8")) as {
      dotfiles: Record<string, { source: string }>
    }
    expect(mise.dotfiles["~/.config/opencode/opencode.jsonc"].source).toBe(".config/opencode/opencode.jsonc")
    expect(mise.dotfiles["~/.config/opencode"]).toBeUndefined()
  })
})

const allowed = [
  "git status", "git diff --cached", "git add -- config.jsonc", "git commit -m 'chore: config'",
  "git push origin feature", "git reset --soft HEAD~1", "git checkout -b feature main",
  "git switch feature/login", "git branch --list", "git worktree list", "git stash list",
  "mise run lint", "mise exec -- bun test", "kubectl get pods", "kubectl describe deploy api",
  "helm status api", "helm template api ./chart", "aws --profile personal secretsmanager describe-secret --secret-id api",
  "aws ssm get-parameter --name /app/name", "op vault list", "op run -- node server.js",
  "infisical run -- npm start", "doppler run -- node server.js", "snow object list database",
  "gh pr view 1", "gh issue list", "systemctl status api", "kill -1 1234", "kill 10 -9",
  "git tag --list", "gh release view v1", "gh release list", "aws secretsmanager list-secrets",
]

const approval = [
  // core.filesystem, including argument-order and recursive-force variations.
  "rm -rf ./cache", "rm -fr ./cache", "rm --force --recursive ./cache", "rm -Rf ./cache",
  "rm -R -f ./cache", "rm -r ./cache", "rm -f report.txt", "rmdir ./empty", "unlink report.txt",
  "truncate --size=-1G database.bin", "truncate -s 0 audit.log", "find . -delete", "dd if=input of=output",
  // core.git; plain operations stay allowed, destructive variants require approval.
  "git reset --hard", "git --no-pager reset main --hard", "git -C /repo reset --hard",
  "git --git-dir=/repo/.git reset --hard", "git reset --merge main", "git checkout main -- src/lib.rs",
  "git checkout -- src/lib.rs", "git checkout --force main", "git checkout -f main", "git checkout -B main",
  "git switch --discard-changes main", "git switch --force-create main", "git switch -C main",
  "git restore src/lib.rs", "git clean -f", "git clean -nf", "git branch -D old", "git branch -df old",
  "git branch --delete --force old", "git push origin --delete old", "git push origin :old",
  "git push --mirror origin", "git push origin +main", "git push --force-with-lease origin main",
  "git push origin -f main", "git worktree remove --force ../dirty", "git worktree add -B main ../new",
  "git submodule update --force", "git rm --force old.txt", "git mv --force old new",
  "git checkout-index --force --all", "git read-tree --reset -u HEAD", "git prune",
  "git gc --prune=now", "git repack --cruft --cruft-expiration=now -d", "git reflog expire --expire=now --all",
  "git send-pack --force origin main", "git http-push --force origin main", "git stash drop", "git stash clear",
  // Kubernetes and Helm, including aliases, global options, and intentional dry-run approval.
  "kubectl --context prod delete deploy api", "kubectl delete ns prod", "kubectl delete pods --all",
  "kubectl delete pod api --force", "kubectl delete -f old.yaml", "kubectl drain node-1",
  "kubectl cordon node-1", "kubectl taint node-1 maintenance=true:NoExecute",
  "kubectl scale deployment/api --replicas=0", "kubectl scale deployment/api --replicas 0",
  "kubectl apply -f app.yaml --force", "kubectl apply --prune -f app.yaml", "kubectl replace --force -f app.yaml",
  "kubectl auth reconcile -f rbac.yaml --remove-extra-subjects", "kubectl delete ns prod --dry-run=client",
  "helm --namespace prod uninstall api", "helm del api", "helm un api", "helm delete api", "helm rollback api 2",
  "helm upgrade api ./chart --force-replace", "helm upgrade api ./chart --reset-values",
  "helm install api ./chart --cleanup-on-fail", "helm upgrade api ./chart --rollback-on-failure",
  // AWS/1Password state mutation and revocation.
  "aws --region us-east-1 secretsmanager delete-secret --secret-id api",
  "aws secretsmanager delete-resource-policy --secret-id api",
  "aws secretsmanager remove-regions-from-replication --secret-id api",
  "aws secretsmanager update-secret --secret-id api", "aws secretsmanager rotate-secret --secret-id api",
  "aws secretsmanager cancel-rotate-secret --secret-id api", "aws secretsmanager update-secret-version-stage --secret-id api",
  "aws secretsmanager stop-replication-to-replica --secret-id api", "aws secretsmanager put-secret-value --secret-id api",
  "aws ssm delete-parameters --names /app/api", "aws ssm put-parameter --name /app/api --overwrite",
  "aws ssm delete-resource-policy --resource-arn arn:example", "op item delete api", "op vault delete Production",
  "op document edit Architecture --file architecture.pdf", "op user delete alice", "op group delete dev",
  "op connect token delete token-id", "op item move api --vault Archive", "op user suspend alice",
  "op group user revoke dev alice", "op vault user revoke Production alice", "op vault group revoke Production dev",
  "op connect group revoke server dev", "op connect vault revoke server Production", "op connect server delete production",
  // Snowflake SQL is deliberately coarse, including safe queries.
  "snow sql -q 'SELECT 1'", "snow sql --query='DROP DATABASE app'", "snow sql -f migration.sql", "snow sql",
  "snow object drop database app", "snow stage remove @archive/path", "snow git drop analytics", "snow dcm purge",
  "snow dbt deploy analytics --force", "snow dbt execute analytics build", "snow stage copy local @stage --overwrite",
  "snow streamlit deploy app --prune", "snow notebook deploy app --replace", "snow spcs compute-pool stop-all pool",
  "snow spcs service suspend api", "snow app teardown app", "snow app version drop app v1", "snow snowpark drop fn",
  "snow dbt drop analytics", "snow stage execute @stage/query.sql", "snow git execute repo/query.sql",
  // GitHub CLI equivalents and API bypass prevention through conservative approval.
  "gh pr merge 7", "gh pr close 7", "gh issue close 7", "gh run cancel 7", "gh run delete 7",
  "gh project delete 7", "gh label delete obsolete", "gh api repos/acme/api -X DELETE", "gh api user",
  // Verified PR-review gaps: ambiguous path restoration, direct refs, remote
  // mutators, rollback aliases, and access grants must all request approval.
  "git checkout .", "git checkout src/file.ts", "git checkout HEAD src/file.ts", "git checkout feature/login",
  "git checkout -b feature main --force", "git tag -d v1", "git tag --delete v1", "git update-ref -d refs/heads/main",
  "git update-ref --stdin", "git symbolic-ref --delete refs/heads/old",
  "aws secretsmanager create-secret --name /app/api", "aws secretsmanager put-resource-policy --secret-id api",
  "aws secretsmanager replicate-secret-to-regions --secret-id api", "aws secretsmanager restore-secret --secret-id api",
  "aws secretsmanager tag-resource --secret-id api", "aws secretsmanager untag-resource --secret-id api",
  "aws ssm put-parameter --name /app/api --type SecureString --value example",
  "kubectl rollout undo deployment/api", "kubectl --context prod rollout undo statefulset/db",
  "helm upgrade api ./chart --atomic", "helm --namespace prod install api ./chart --atomic",
  "op vault user grant --vault Production --user alice --permissions view_items",
  "op vault group grant --vault Production --group dev --permissions export_items",
  "gh release delete v1 --yes", "gh release delete-asset v1 archive.zip --yes", "gh release edit v1 --draft",
  "gh repo archive acme/api --yes", "gh repo rename renamed --repo acme/api", "gh issue delete 7 --yes",
  "gh project item-delete 7 --id item", "gh gist delete gist-id", "gh codespace delete --codespace demo",
]

const blocked = [
  "shutdown", "reboot", "poweroff", "halt", "systemctl poweroff", "systemctl start reboot.target",
  "systemctl kexec", "init 6", "telinit 0", "mkfs.ext4 /dev/sdb", "kill -9 1", "kill 1 -9",
  "kill -9 -1", "shred secrets.txt", "dd if=image.raw of=/dev/disk4", "wipefs --all /dev/sdb",
  "wipefs -a /dev/sdb", "wipefs --offset 0 /dev/sdb", "diskutil partitionDisk disk4 GPT APFS Data 0b",
  "diskutil eraseVolume APFS Data disk4", "diskutil deleteVolume disk4", "gh repo delete acme/api --yes",
  "op read op://prod/api/key", "op item get api", "op document get Architecture", "op inject -i template.env",
  "op environment read production", "op connect token create server", "op service-account create deploy",
  "op signin --raw", "op account add --raw", "infisical secrets get API_KEY --plain", "infisical export",
  "infisical dynamic-secrets lease create db", "doppler secrets download", "doppler secrets",
  "vault kv get secret/prod/api", "vault read secret/prod/api", "vault login token", "vault token create",
  "vault operator init", "vault operator rekey", "vault operator generate-root",
  "aws secretsmanager get-secret-value --secret-id api", "aws secretsmanager batch-get-secret-value --secret-id-list api",
  "aws secretsmanager get-random-password", "aws ssm get-parameter --name /app/api --with-decryption",
  "aws ssm --with-decryption get-parameters --names /app/api",
  "aws configure export-credentials --profile prod", "aws --profile prod configure export-credentials --format env",
  "systemctl suspend", "systemctl hibernate", "systemctl hybrid-sleep", "systemctl suspend-then-hibernate",
  "systemctl start suspend.target", "systemctl start hibernate.target", "systemctl start hybrid-sleep.target",
  "systemctl start suspend-then-hibernate.target", "systemctl start sleep.target",
  "diskutil zeroDisk /dev/disk4", "diskutil randomDisk 2 /dev/disk4", "diskutil secureErase 0 /dev/disk4", "diskutil reformat disk4",
]

describe("permission resource examples (never executed)", () => {
  for (const [expected, commands] of [["allow", allowed], ["ask", approval], ["deny", blocked]] as const) {
    for (const command of commands) {
      test(`${expected}: ${command}`, () => expect(effect("shell", command)).toBe(expected))
    }
  }

  for (const [expected, commands] of [["ask", approval], ["deny", blocked]] as const) {
    for (const command of commands) {
      test(`${expected}: common wrapper around ${command}`, () => {
        for (const prefix of ["sudo ", "env MODE=test ", "mise exec -- ", "/usr/bin/"]) {
          expect(effect("shell", `${prefix}${command}`)).toBe(expected)
        }
      })
    }
  }

  test("GitHub MCP names include server variants and conservatively gate grouped writers", () => {
    for (const server of ["github", "github_mcp_server", "personal_github"]) {
      expect(effect(`${server}_delete_repository`, "*")).toBe("deny")
      for (const tool of ["delete_file", "merge_pull_request", "issue_write", "projects_write", "label_write", "push_files", "create_branch", "create_repository", "create_pull_request", "fork_repository", "create_gist", "future_writer", "get_future_unknown_tool"]) {
        expect(effect(`${server}_${tool}`, "*")).toBe("ask")
      }
      expect(effect(`${server}_list_issues`, "*")).toBe("allow")
      expect(effect(`${server}_get_file_contents`, "*")).toBe("allow")
      expect(effect(`${server}_search_code`, "*")).toBe("allow")
    }
    expect(effect("unrelated_delete_repository", "*")).toBe("allow")
  })

  test("non-shell operations retain the requested default allow", () => {
    for (const action of ["read", "edit", "grep", "execute", "websearch", "skill"]) {
      expect(effect(action, "*")).toBe("allow")
    }
    expect(effect("read", "/outside/project/.env")).toBe("allow")
  })

  test("allows the two trusted external boundaries, including nested paths", () => {
    for (const suffix of ["git/dotfiles/*", "git/dotfiles/skills/github-yeet/*", ".cache/github/*", ".cache/github/anomalyco/opencode/*"]) {
      expect(effect("external_directory", `${homedir()}/${suffix}`)).toBe("allow")
    }
  })

  test("asks for other external directories and similarly named siblings", () => {
    for (const resource of ["*", "/outside/project/*", `${homedir()}/git/dotfiles-private/*`, `${homedir()}/.cache/github-private/*`]) {
      expect(effect("external_directory", resource)).toBe("ask")
    }
  })

  test("GitHub reference cache is readable but file edits are denied", () => {
    const target = `${homedir()}/.cache/github/anomalyco/opencode/README.md`
    expect(effect("external_directory", `${homedir()}/.cache/github/anomalyco/opencode/*`)).toBe("allow")
    expect(effect("read", target)).toBe("allow")
    expect(effect("edit", target)).toBe("deny")
    expect(effect("edit", `${homedir()}/.cache/github-private/README.md`)).toBe("allow")
  })
})
