/**
 * kaname CLI: rank meeting stations from the command line, or run the spot check.
 *
 *   npm --prefix web run cli -- --person "Aki:町田" --person "Ben:大宮>船橋" --end 23:30
 *   npm --prefix web run cli -- spotcheck --refs pipeline/validation/heldout_reference.csv
 */
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isRecord } from "../web/core/data";
import { RankError } from "../web/core/errors";
import { rank } from "../web/core/rank";
import { formatClock, parseClock } from "../web/core/time";
import type { CandidateResult, LocationInput, ParticipantInput, RankOptions, RankResult } from "../web/core/types";
import { defaultDataDir, loadMatrixData } from "./loadData";
import { SPOT_TOLERANCE_MIN, spotCheck, spotCheckPassed } from "./spotcheck";

export interface CliIO {
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
  /** Directory that relative paths are read from. Default: where the user ran npm (INIT_CWD). */
  readonly cwd?: string;
}

const HELP = `kaname: rank Tokyo meeting stations by everyone's full evening by train

usage: rank [options] --person LABEL:START[>HOME] ...
       rank spotcheck --refs FILE.csv [--data DIR]

  --person SPEC   repeatable. START and HOME are a station (id, 日本語 or English name)
                  or "lat,lng". Without >HOME the person goes home to START.
  --input FILE    JSON {"participants": [...], "options": {...}} instead of --person
  --alpha A       efficient (1) to fair (0), default 0.5
  --lambda L      minutes added to the score per change of train, default 10
  --end HH:MM     meeting end; drops stations where someone misses the last train home
  --top N         how many stations to show, default 10
  --ignore-home   score the outbound leg only
  --json          print the full result as JSON
  --data DIR      data folder, default the repo's data/
  --refs FILE     spotcheck: reference CSV (id,origin,destination,query_time,ref_minutes)
`;

class UsageError extends Error {}

interface Args {
  readonly command: "rank" | "spotcheck" | "help";
  readonly people: readonly ParticipantInput[];
  readonly input: string | null;
  readonly options: RankOptions;
  readonly json: boolean;
  readonly data: string;
  readonly refs: string | null;
}

function location(text: string): LocationInput {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : { station: text.trim() };
}

/** "Aki:新宿>八王子" -> {label, start, home}. */
export function parsePerson(spec: string): ParticipantInput {
  const colon = spec.indexOf(":");
  if (colon <= 0 || colon === spec.length - 1) throw new UsageError(`--person "${spec}": expected label:start[>home]`);
  const label = spec.slice(0, colon).trim();
  const parts = spec.slice(colon + 1).split(">");
  if (parts.length > 2) throw new UsageError(`--person "${spec}": use one > between start and home`);
  const [start, home] = parts;
  if (!start?.trim() || (home !== undefined && !home.trim())) {
    throw new UsageError(`--person "${spec}": the start or home is empty`);
  }
  return home === undefined ? { label, start: location(start) } : { label, start: location(start), home: location(home) };
}

function number(flag: string, value: string | undefined): number {
  const n = Number(value);
  if (value === undefined || value.trim() === "" || !Number.isFinite(n)) throw new UsageError(`${flag} needs a number`);
  return n;
}

function value(argv: readonly string[], i: number, flag: string): string {
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) throw new UsageError(`${flag} needs a value`);
  return v;
}

const OPTION_FLAGS: Record<string, (v: string) => RankOptions> = {
  "--alpha": (v) => ({ alpha: number("--alpha", v) }),
  "--lambda": (v) => ({ lambda: number("--lambda", v) }),
  "--top": (v) => ({ limit: number("--top", v) }),
  "--end": (v) => ({ meetingEnd: parseClock(v) }),
};

function parseArgs(argv: readonly string[]): Args {
  let args: Args = { command: "rank", people: [], input: null, options: {}, json: false, data: defaultDataDir(), refs: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const opt = OPTION_FLAGS[a];
    if (a === "spotcheck" && i === 0) args = { ...args, command: "spotcheck" };
    else if (a === "--help" || a === "-h") return { ...args, command: "help" };
    else if (a === "--json") args = { ...args, json: true };
    else if (a === "--ignore-home") args = { ...args, options: { ...args.options, ignoreHome: true } };
    else if (opt) args = { ...args, options: { ...args.options, ...opt(value(argv, i++, a)) } };
    else if (a === "--person") args = { ...args, people: [...args.people, parsePerson(value(argv, i++, a))] };
    else if (a === "--input") args = { ...args, input: value(argv, i++, a) };
    else if (a === "--data") args = { ...args, data: value(argv, i++, a) };
    else if (a === "--refs") args = { ...args, refs: value(argv, i++, a) };
    else throw new UsageError(`unknown argument ${a}. Try --help`);
  }
  return args;
}

function readText(file: string): string {
  try {
    return readFileSync(file, "utf-8");
  } catch (e) {
    throw new UsageError(`cannot read ${file}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function readScenario(file: string): { people: ParticipantInput[]; options: RankOptions } {
  let raw: unknown;
  try {
    raw = JSON.parse(readText(file)) as unknown;
  } catch (e) {
    if (e instanceof UsageError) throw e;
    throw new UsageError(`${file} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!isRecord(raw) || !Array.isArray(raw.participants)) throw new UsageError(`${file}: expected {"participants": [...]}`);
  return { people: raw.participants as ParticipantInput[], options: scenarioOptions(raw.options, file) };
}

const SCENARIO_OPTIONS: Record<string, "number" | "boolean" | "clock"> = {
  alpha: "number", lambda: "number", limit: "number", ignoreHome: "boolean", meetingEnd: "clock",
};

/** Only known option names with the right types; a misspelled name must not switch a filter off silently. */
function scenarioOptions(raw: unknown, file: string): RankOptions {
  if (raw === undefined) return {};
  if (!isRecord(raw)) throw new UsageError(`${file}: options must be an object`);
  let out: RankOptions = {};
  for (const [key, v] of Object.entries(raw)) {
    const kind = SCENARIO_OPTIONS[key];
    if (kind === undefined) throw new UsageError(`${file}: unknown option "${key}" (known: ${Object.keys(SCENARIO_OPTIONS).join(", ")})`);
    if (kind === "clock" && typeof v === "string") out = { ...out, meetingEnd: parseClock(v) };
    else if (kind !== "clock" && typeof v === kind) out = { ...out, [key]: v };
    else throw new UsageError(`${file}: option "${key}" must be ${kind === "clock" ? 'a time like "23:30"' : `a ${kind}`}`);
  }
  return out;
}

const pad = (s: string | number, w: number) => String(s).padStart(w);

const changes = (n: number) => `${n} change${n === 1 ? "" : "s"}`;

/** A score is the plain trip plus the transfer penalty; the lines show both, so the penalty is visible. */
function candidateLines(c: CandidateResult): string[] {
  const head = `${pad(c.rank, 3)}  ${c.station.ja} ${c.station.en} (${c.station.lines} lines)  ` +
    `objective ${c.objective.toFixed(1)}  average score ${c.average.toFixed(1)}  worst score ${c.worst.cost} (${c.worst.label})  spread ${c.spread}`;
  const people = c.people.map((p) => {
    const last = p.lastDeparture === null ? "" : `  last train ${formatClock(p.lastDeparture)}`;
    const trip = p.outMinutes + p.homeMinutes + p.walkMinutes;
    return `       ${p.label}: ${p.outMinutes} there (${changes(p.outTransfers)}) + ${p.homeMinutes} back (${changes(p.homeTransfers)})` +
      ` + ${p.walkMinutes} walk = ${trip} min, score ${p.cost}${last}`;
  });
  return [head, ...people];
}

function printResult(r: RankResult, io: CliIO): void {
  if (r.candidates.length === 0) io.out("No station gets everyone home. Try an earlier meeting end.");
  r.candidates.flatMap(candidateLines).forEach(io.out);
  if (r.excluded.length > 0) {
    io.out(`\nExcluded (${r.excluded.length}):`);
    r.excluded.slice(0, 10).forEach((e) => io.out(`  ${e.station.ja} ${e.station.en}: ${e.reasons.join("; ")}`));
    if (r.excluded.length > 10) io.out(`  ... and ${r.excluded.length - 10} more`);
  }
  const pareto = r.pareto.map((p) => `${p.station.ja} ${p.average.toFixed(1)}/${p.worst}`).join(", ");
  io.out(`\nPareto set (average/worst): ${pareto}`);
}

function runSpotcheck(args: Args, io: CliIO): number {
  if (args.refs === null) throw new UsageError("spotcheck needs --refs FILE.csv");
  const result = spotCheck(loadMatrixData(args.data), readText(args.refs));
  for (const r of result.rows) {
    const ours = r.ours === null ? "not in the matrix" : `${r.ours} Δ ${r.delta! >= 0 ? "+" : ""}${r.delta}`;
    io.out(`${r.id.padStart(4)} ${r.origin}→${r.destination} ref ${r.ref} ours ${ours}`);
  }
  const skipped = result.rows.length - result.compared;
  io.out(`within ±${SPOT_TOLERANCE_MIN} min: ${result.within}/${result.compared}` + (skipped ? ` (${skipped} not in the matrix)` : ""));
  return spotCheckPassed(result) ? 0 : 1;
}

function runRank(args: Args, io: CliIO): number {
  const scenario = args.input === null ? null : readScenario(args.input);
  const people = scenario ? scenario.people : args.people;
  if (people.length === 0) throw new UsageError("add at least one --person (or --input FILE)");
  const result = rank(people, { ...scenario?.options, ...args.options }, loadMatrixData(args.data));
  if (args.json) io.out(JSON.stringify(result, null, 2));
  else printResult(result, io);
  return result.candidates.length > 0 ? 0 : 1;
}

/** Relative paths are relative to where the user ran the command, not to web/. */
function withPaths(args: Args, cwd: string): Args {
  const abs = (p: string) => (isAbsolute(p) ? p : resolve(cwd, p));
  return { ...args, data: abs(args.data), input: args.input && abs(args.input), refs: args.refs && abs(args.refs) };
}

export function main(argv: readonly string[], io: CliIO): number {
  try {
    const args = withPaths(parseArgs(argv), io.cwd ?? process.env.INIT_CWD ?? process.cwd());
    if (args.command === "help") {
      io.out(HELP);
      return 0;
    }
    return args.command === "spotcheck" ? runSpotcheck(args, io) : runRank(args, io);
  } catch (e) {
    if (e instanceof UsageError || e instanceof RankError) {
      io.err(`error: ${e.message}`);
      return 2;
    }
    throw e;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // `| head` closes stdout early: stop quietly instead of printing a stack trace.
  process.stdout.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code === "EPIPE") process.exit(0);
    throw e;
  });
  process.exitCode = main(process.argv.slice(2), {
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  });
}
