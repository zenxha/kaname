/** The Claude Code hook in .claude/hooks/log-check.mjs: a code commit must log a decision or a lesson, or say why not. */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { REPO_DIR } from "./realData";

const HOOK = join(REPO_DIR, ".claude", "hooks", "log-check.mjs");
const repos: string[] = [];

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "kaname-hook-"));
  repos.push(dir);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir });
  git("init", "-q");
  git("config", "user.name", "test");
  git("config", "user.email", "test@example.org");
  return dir;
}

function commit(dir: string, subject: string, files: readonly string[]): void {
  for (const f of files) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), `${subject}\n`);
  }
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", subject], { cwd: dir });
}

function runHook(dir: string, command: string) {
  const input = JSON.stringify({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command }, cwd: dir });
  const r = spawnSync(process.execPath, [HOOK], { input, encoding: "utf8" });
  return { code: r.status, message: r.stderr };
}

afterEach(() => {
  for (const dir of repos.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("the decision and lesson hook", () => {
  it("asks for a lesson after a fix that changed code and logged nothing", () => {
    const dir = repo();
    commit(dir, "fix: stop the add button at the limit", ["web/src/a.ts"]);
    const r = runHook(dir, 'git add . && git commit -q -m "fix: stop the add button at the limit"');
    expect(r.code).toBe(2);
    expect(r.message).toContain("LESSONS.md");
    expect(r.message).toContain("fix: stop the add button at the limit");
  });

  it("reports each commit once, even when a later command mentions git commit", () => {
    const dir = repo();
    commit(dir, "fix: once", ["web/src/a.ts"]);
    expect(runHook(dir, 'git commit -m "fix: once"').code).toBe(2);
    expect(runHook(dir, "cat <<'EOF' > notes.md\nrun git add . && git commit\nEOF").code).toBe(0);
    commit(dir, "fix: twice", ["web/src/b.ts"]);
    expect(runHook(dir, 'git commit -m "fix: twice"').code).toBe(2);
  });

  it("asks for a decision after a feature that changed code and logged nothing", () => {
    const dir = repo();
    commit(dir, "feat: add a slider", ["pipeline/src/x.py"]);
    const r = runHook(dir, "git commit -m 'feat: add a slider'");
    expect(r.code).toBe(2);
    expect(r.message).toContain("DECISIONS.md");
  });

  it("stays quiet when the commit logs a decision or a lesson", () => {
    const dir = repo();
    commit(dir, "fix: x", ["web/core/a.ts", "LESSONS.md"]);
    expect(runHook(dir, 'git commit -m "fix: x"').code).toBe(0);
    commit(dir, "feat: y", ["web/src/b.ts", "DECISIONS.md"]);
    expect(runHook(dir, 'git commit -m "feat: y"').code).toBe(0);
  });

  it("stays quiet for docs, tests, chores and commands that are not a commit", () => {
    const dir = repo();
    commit(dir, "docs: x", ["README.md"]);
    expect(runHook(dir, 'git commit -m "docs: x"').code).toBe(0);
    commit(dir, "fix: only a test", ["web/tests/a.test.ts"]);
    expect(runHook(dir, 'git commit -m "fix: only a test"').code).toBe(0);
    commit(dir, "fix: z", ["web/src/c.ts"]);
    expect(runHook(dir, "git -c credential.helper= push origin develop").code).toBe(0);
    expect(runHook(dir, "git log --oneline -1").code).toBe(0);
  });

  it("stays quiet when the commit did not happen", () => {
    const dir = repo();
    const old = new Date(Date.now() - 3_600_000).toISOString();
    mkdirSync(join(dir, "web", "src"), { recursive: true });
    writeFileSync(join(dir, "web", "src", "old.ts"), "old\n");
    execFileSync("git", ["add", "."], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "fix: old"], { cwd: dir, env: { ...process.env, GIT_COMMITTER_DATE: old } });
    expect(runHook(dir, 'git commit -m "fix: new"').code).toBe(0);
    const empty = mkdtempSync(join(tmpdir(), "kaname-hook-"));
    repos.push(empty);
    expect(runHook(empty, 'git commit -m "fix: new"').code).toBe(0);
  });
});
