#!/usr/bin/env node
/**
 * Claude Code PostToolUse hook for Bash. After a feat, fix, perf or refactor commit that changes code
 * but neither DECISIONS.md nor LESSONS.md, it exits with 2. Claude then reads the message on stderr
 * and logs a decision or a lesson, or says in one line why none applies.
 *
 * Everything else exits with 0: other commands, docs and test commits, a commit that did not
 * happen (HEAD is older than RECENT_S), and a commit it already reported. The last reported commit
 * is kept in the git folder, so a later command that only mentions "git commit" stays quiet.
 * Tests: web/tests/logHook.test.ts.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const RECENT_S = 120;
const COMMIT = /\bgit(?:\s+-c\s+\S+)*\s+commit\b/;
const CODE = /^(?:web\/(?:src|core|scripts|static)\/|web\/[^/]+\.(?:ts|json|html)$|cli\/|pipeline\/(?:src|config)\/|pipeline\/[^/]+\.(?:sh|toml)$)/;
const LOGS = new Set(["DECISIONS.md", "LESSONS.md"]);
const ASKS = {
  fix: "If the bug taught something, add a LESSONS.md story (what happened, what we did, lesson, where to look). If the fix made a non-obvious choice, add a DECISIONS.md row.",
  feat: "If the change made a non-obvious choice, add a DECISIONS.md row with its reason. If something went wrong on the way and taught something, add a LESSONS.md story.",
};

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function reported(cwd) {
  return resolve(cwd, git(cwd, "rev-parse", "--git-path", "kaname-log-check"));
}

function alreadyReported(cwd, sha) {
  try {
    return readFileSync(reported(cwd), "utf8").trim() === sha;
  } catch {
    return false;
  }
}

/** The message for the newest commit, or null when it needs none. */
function check(cwd) {
  const [sha, time, subject] = git(cwd, "log", "-1", "--format=%h%x00%ct%x00%s").split("\0");
  if (Date.now() / 1000 - Number(time) > RECENT_S || alreadyReported(cwd, sha)) return null;
  const type = /^(\w+)(?:\([^)]*\))?!?:/.exec(subject)?.[1];
  if (!["feat", "fix", "perf", "refactor"].includes(type)) return null;
  const files = git(cwd, "diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "HEAD").split("\n");
  if (files.some((f) => LOGS.has(f)) || !files.some((f) => CODE.test(f))) return null;
  writeFileSync(reported(cwd), `${sha}\n`);
  return [
    `Commit ${sha} (${subject}) changed code but neither DECISIONS.md nor LESSONS.md.`,
    ASKS[type === "fix" ? "fix" : "feat"],
    "Commit the entry as a docs: follow-up. If neither applies, say so in one line and continue.",
  ].join(" ");
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return 0;
  }
  const command = input?.tool_input?.command;
  if (typeof command !== "string" || !COMMIT.test(command)) return 0;
  let message;
  try {
    message = check(input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd());
  } catch {
    return 0; // not a repo, or no commit yet
  }
  if (message === null) return 0;
  process.stderr.write(`${message}\n`);
  return 2;
}

process.exitCode = main();
