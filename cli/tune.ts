/**
 * Tuning study for the default slider position (α) and the transfer penalty (λ).
 *
 *   npm --prefix web run tune -- [--groups 1000] [--seed 1]
 *
 * It samples realistic evening groups and ranks each one with many values of α and λ. A person starts
 * at a meeting candidate (a station with at least two lines, a proxy for where people are after work)
 * and goes home to a random town point from data/addresses.json. Town points are densest where most
 * people live, so homes follow the population without a population table. The output shows what each
 * value costs on the average and on the longest trip, and how often it changes the winner.
 *
 * Known bias: starts are uniform over the candidates, not weighted by ridership. A person whom the
 * engine cannot plan with the rest of the group is drawn again, which leans homes toward places with
 * good evening trains.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { MatrixData } from "../web/core/data";
import { RankError } from "../web/core/errors";
import { DEFAULT_ALPHA, DEFAULT_LAMBDA, rank } from "../web/core/rank";
import type { CandidateResult, ParticipantInput } from "../web/core/types";
import { parseAddresses, type Town } from "../web/src/model/address";
import { defaultDataDir, loadMatrixData } from "./loadData";

export interface TuneGroup {
  readonly people: readonly ParticipantInput[];
}

const MIN_SIZE = 2;
const MAX_SIZE = 8;
/** Draws for one person before the study gives up, so data that plans nobody cannot hang it. */
const MAX_DRAWS = 200;

/** mulberry32: a small, seeded random number generator, so a study can be run again exactly. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function plannable(data: MatrixData, people: readonly ParticipantInput[]): boolean {
  try {
    return rank(people, { limit: 1 }, data).candidates.length > 0;
  } catch (e) {
    if (e instanceof RankError) return false;
    throw e;
  }
}

function samplePerson(data: MatrixData, towns: readonly Town[], next: () => number, label: string): ParticipantInput {
  const start = data.stations[Math.floor(next() * data.nCandidates)]!;
  const town = towns[Math.floor(next() * towns.length)]!;
  return { label, start: { station: start.id }, home: { lng: town.at[0], lat: town.at[1] } };
}

/** A person that the engine can plan together with `others`: a train home, and a station for all. */
function drawPerson(data: MatrixData, towns: readonly Town[], next: () => number, label: string,
  others: readonly ParticipantInput[]): ParticipantInput {
  for (let i = 0; i < MAX_DRAWS; i++) {
    const p = samplePerson(data, towns, next, label);
    if (plannable(data, [...others, p])) return p;
  }
  throw new Error(`could not sample a person that the engine can plan, in ${MAX_DRAWS} draws`);
}

/** `count` groups of 2 to 8 people, each one a group that the engine can plan. */
export function sampleGroups(data: MatrixData, towns: readonly Town[], seed: number, count: number): TuneGroup[] {
  const next = random(seed);
  return Array.from({ length: count }, () => {
    const size = MIN_SIZE + Math.floor(next() * (MAX_SIZE - MIN_SIZE + 1));
    const people = Array.from({ length: size }).reduce<readonly ParticipantInput[]>(
      (group, _, i) => [...group, drawPerson(data, towns, next, `p${i + 1}`, group)], []);
    return { people };
  });
}

function winner(data: MatrixData, g: TuneGroup, alpha: number, lambda: number): CandidateResult {
  const top = rank(g.people, { alpha, lambda, limit: 1 }, data).candidates[0];
  if (top === undefined) throw new Error("a sampled group has no feasible station");
  return top;
}

const mean = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

export interface AlphaRow {
  readonly alpha: number;
  /** Minutes on the average trip above the lowest average any station gives, mean over groups. */
  readonly avgExtra: number;
  /** Minutes on the longest trip above the lowest any station gives, mean over groups. */
  readonly worstExtra: number;
  /** Share of groups with the same winner as the default α. */
  readonly sameAs: number;
}

export function alphaSweep(data: MatrixData, groups: readonly TuneGroup[], alphas: readonly number[], lambda: number): AlphaRow[] {
  const best = groups.map((g) => ({
    avg: winner(data, g, 1, lambda).average,
    worst: winner(data, g, 0, lambda).worst.cost,
    base: winner(data, g, DEFAULT_ALPHA, lambda).station.id,
  }));
  return alphas.map((alpha) => {
    const won = groups.map((g) => winner(data, g, alpha, lambda));
    return {
      alpha,
      avgExtra: mean(won.map((w, i) => w.average - best[i]!.avg)),
      worstExtra: mean(won.map((w, i) => w.worst.cost - best[i]!.worst)),
      sameAs: mean(won.map((w, i) => (w.station.id === best[i]!.base ? 1 : 0))),
    };
  });
}

export interface LambdaRow {
  readonly lambda: number;
  /** Train and walk minutes for each person, there and back, without the penalty. Mean over groups. */
  readonly minutes: number;
  /** Changes of train for each person, there and back. Mean over groups. */
  readonly transfers: number;
  /** Share of groups with the same winner as the default λ. */
  readonly sameAs: number;
}

export function lambdaSweep(data: MatrixData, groups: readonly TuneGroup[], lambdas: readonly number[], alpha: number): LambdaRow[] {
  const base = groups.map((g) => winner(data, g, alpha, DEFAULT_LAMBDA).station.id);
  return lambdas.map((lambda) => {
    const won = groups.map((g) => winner(data, g, alpha, lambda));
    return {
      lambda,
      minutes: mean(won.map((w) => mean(w.people.map((p) => p.outMinutes + p.homeMinutes + p.walkMinutes)))),
      transfers: mean(won.map((w) => mean(w.people.map((p) => p.outTransfers + p.homeTransfers)))),
      sameAs: mean(won.map((w, i) => (w.station.id === base[i] ? 1 : 0))),
    };
  });
}

const fixed = (x: number, d = 1): string => x.toFixed(d);
const pct = (x: number): string => `${Math.round(x * 100)}%`;

export function report(data: MatrixData, groups: readonly TuneGroup[]): string[] {
  const alphas = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
  const lambdas = [0, 2.5, 5, 7.5, 10, 15];
  return [
    `${groups.length} groups of ${MIN_SIZE} to ${MAX_SIZE} people, λ = ${DEFAULT_LAMBDA}`,
    "",
    "| α | extra average min | extra longest min | same winner as α = 0.5 |",
    "| --- | --- | --- | --- |",
    ...alphaSweep(data, groups, alphas, DEFAULT_LAMBDA).map((r) => `| ${r.alpha} | ${fixed(r.avgExtra)} | ${fixed(r.worstExtra)} | ${pct(r.sameAs)} |`),
    "",
    `α = ${DEFAULT_ALPHA}`,
    "",
    `| λ | minutes per person | transfers per person | same winner as λ = ${DEFAULT_LAMBDA} |`,
    "| --- | --- | --- | --- |",
    ...lambdaSweep(data, groups, lambdas, DEFAULT_ALPHA).map((r) => `| ${r.lambda} | ${fixed(r.minutes)} | ${fixed(r.transfers, 2)} | ${pct(r.sameAs)} |`),
  ];
}

function flag(args: readonly string[], name: string, fallback: number): number {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const value = Number(args[i + 1]);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} needs a whole number above 0`);
  return value;
}

function main(args: readonly string[]): void {
  const dir = defaultDataDir();
  const data = loadMatrixData(dir);
  const towns = parseAddresses(JSON.parse(readFileSync(join(dir, "addresses.json"), "utf8"))).towns;
  const groups = sampleGroups(data, towns, flag(args, "--seed", 1), flag(args, "--groups", 1000));
  process.stdout.write(`${report(data, groups).join("\n")}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main(process.argv.slice(2));
