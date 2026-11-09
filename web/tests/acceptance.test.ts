/** The acceptance table of BRIEF.md, run on the real M1 data. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { spotCheck } from "../../cli/spotcheck";
import { RankError } from "../core/errors";
import { rank } from "../core/rank";
import { parseClock } from "../core/time";
import type { ParticipantInput, RankResult } from "../core/types";
import { lineStations, makeData } from "./fixtures";
import { real, REPO_DIR } from "./realData";

const ids = (r: RankResult): string[] => r.candidates.map((c) => c.station.id);
const person = (label: string, start: string, home?: string): ParticipantInput =>
  home === undefined
    ? { label, start: { station: start } }
    : { label, start: { station: start }, home: { station: home } };

const GROUP: ParticipantInput[] = [
  person("Aki", "町田"),
  person("Ben", "大宮"),
  person("Chie", "千葉"),
  person("Dai", "横浜"),
  person("Emi", "吉祥寺", "船橋"),
  person("Fumi", "渋谷", "八王子"),
];

describe("acceptance (BRIEF.md)", () => {
  it("identity: two people at station A rank A first with cost 0", () => {
    const r = rank([person("a", "新宿", "新宿"), person("b", "新宿", "新宿")], {}, real);
    expect(r.candidates[0]!.station.id).toBe("shinjuku");
    expect(r.candidates[0]!.objective).toBe(0);
    expect(r.candidates[0]!.total).toBe(0);
  });

  it("permutation invariance: any participant order gives an identical ranking", () => {
    const base = rank(GROUP, {}, real);
    for (const order of [[...GROUP].reverse(), [2, 0, 5, 1, 4, 3].map((i) => GROUP[i]!)]) {
      const r = rank(order, {}, real);
      expect(ids(r)).toEqual(ids(base));
      expect(r.candidates.map((c) => c.objective)).toEqual(base.candidates.map((c) => c.objective));
    }
  });

  it("symmetry of identical people: N copies rank like N = 1", () => {
    const one = [person("x", "吉祥寺", "船橋")];
    const five = Array.from({ length: 5 }, (_, i) => person(`x${i}`, "吉祥寺", "船橋"));
    expect(ids(rank(five, { limit: 50 }, real))).toEqual(ids(rank(one, { limit: 50 }, real)));
  });

  it("home leg counts: homes on opposite sides change the ranking", () => {
    const withHomes = [person("w", "東京", "八王子"), person("e", "東京", "千葉")];
    const homesIgnored = rank(withHomes, { ignoreHome: true }, real);
    const homeIsStart = rank([person("w", "東京"), person("e", "東京")], {}, real);
    const counted = rank(withHomes, {}, real);
    expect(ids(counted)).not.toEqual(ids(homesIgnored));
    expect(ids(counted)).not.toEqual(ids(homeIsStart));
  });

  it("objective extremes: alpha 0 never has a worse worst-case person than alpha 1", () => {
    const fair = rank(GROUP, { alpha: 0 }, real).candidates[0]!;
    const efficient = rank(GROUP, { alpha: 1 }, real).candidates[0]!;
    expect(fair.worst.cost).toBeLessThanOrEqual(efficient.worst.cost);
    expect(efficient.average).toBeLessThanOrEqual(fair.average);
  });

  it("last-train filter: a late end excludes stations that strand the suburban commuter, with a reason", () => {
    const group = [person("Ome commuter", "新宿", "青梅"), person("Local", "渋谷")];
    const end = parseClock("23:45");
    const open = rank(group, { limit: 1000 }, real);
    const late = rank(group, { meetingEnd: end, limit: 1000 }, real);
    expect(late.excluded.length).toBeGreaterThan(0);
    expect(late.candidates.length).toBeGreaterThan(0);
    for (const e of late.excluded) expect(e.reasons.join(" ")).toMatch(/Ome commuter.*last train/);
    for (const c of late.candidates) for (const p of c.people) expect(p.lastTrainOk).not.toBe(false);
    // the excluded stations are exactly the ones whose last train to 青梅 leaves before 23:45
    const stranded = open.candidates.filter((c) => (c.people[0]!.lastDeparture ?? Infinity) < end).map((c) => c.station.id);
    expect(late.excluded.map((e) => e.station.id).sort()).toEqual(stranded.sort());
  });

  it("snapping: a point inside 新宿 station snaps to 新宿 and adds the walk", () => {
    const here = { lat: 35.6905, lng: 139.7003 };
    const r = rank([{ label: "pin", start: here, home: { station: "新宿" } }], { limit: 1000 }, real);
    const snap = r.participants[0]!.start[0]!;
    expect(snap.station.id).toBe("shinjuku");
    expect(snap.walkMinutes).toBeGreaterThan(0);
    expect(snap.walkMinutes).toBeLessThanOrEqual(5);
    expect(r.participants[0]!.start).toHaveLength(3);
    const atShinjuku = r.candidates.find((c) => c.station.id === "shinjuku")!.people[0]!;
    expect(atShinjuku).toMatchObject({ startStation: "shinjuku", outMinutes: 0, walkMinutes: snap.walkMinutes });
    expect(atShinjuku.cost).toBe(snap.walkMinutes);
  });

  it("real-world spot check: 10 held-out pairs within ±5 minutes on at least 9", () => {
    const csv = readFileSync(join(REPO_DIR, "pipeline", "validation", "heldout_reference.csv"), "utf-8");
    const ten = ["h01", "h02", "h03", "h04", "h05", "h06", "h07", "h08", "h09", "h10"];
    const result = spotCheck(real, csv, ten);
    expect(result.rows).toHaveLength(10);
    expect(result.within).toBeGreaterThanOrEqual(9);
  });

  it("performance: 20 participants on the real data re-score far under 100 ms", () => {
    const n = real.nStations;
    const group = Array.from({ length: 20 }, (_, i) => ({
      label: `p${i}`,
      start: { station: real.stations[(i * 389) % n]!.id },
      home: { station: real.stations[(i * 211 + 7) % n]!.id },
    }));
    rank(group, {}, real); // warm-up
    const times = Array.from({ length: 30 }, () => {
      const t0 = performance.now();
      rank(group, { meetingEnd: parseClock("23:00") }, real);
      return performance.now() - t0;
    }).sort((a, b) => a - b);
    // A desktop is several times faster than a mid-range phone, so keep a 5x margin.
    expect(times[15]!).toBeLessThan(20);
  });

  it("performance: 20 participants and 250 candidates (synthetic) re-score under 20 ms", () => {
    const n = 1400;
    const k = 250;
    const big = makeData({
      stations: lineStations(n),
      nCandidates: k,
      out: Array.from({ length: n }, (_, s) => Array.from({ length: k }, (_, c) => (s === c ? 0 : 5 + ((s * 7 + c * 13) % 90)))),
      home: Array.from({ length: k }, (_, c) => Array.from({ length: n }, (_, s) => (s === c ? 0 : 5 + ((s * 11 + c * 3) % 90)))),
    });
    const group = Array.from({ length: 20 }, (_, i) => ({ label: `p${i}`, start: { station: `s${(i * 61) % n}` } }));
    rank(group, {}, big);
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) rank(group, {}, big);
    expect((performance.now() - t0) / 10).toBeLessThan(20);
  });

  it("unroutable input: a station missing from the matrix gives a clear error naming it", () => {
    const run = () => rank([person("a", "小田原"), person("b", "新宿")], {}, real);
    expect(run).toThrow(RankError);
    expect(run).toThrow(/小田原/);
    try {
      run();
    } catch (e) {
      expect((e as RankError).code).toBe("UNKNOWN_STATION");
      expect((e as RankError).message).toMatch(/participant "a"/);
    }
  });
});
