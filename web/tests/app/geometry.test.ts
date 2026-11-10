import { describe, expect, it } from "vitest";
import { findStation } from "../../core/stations";
import { hopPath, routeLegs, routePath, type LngLat } from "../../src/model/geometry";
import type { TrackShapes } from "../../src/model/shapes";
import { real, realShapes } from "../realData";

const st = (name: string) => findStation(real, name);
const railway = (id: string) => real.railways.findIndex((r) => r.id === id);

describe("hopPath", () => {
  it("follows the railway's stations between the two ends", () => {
    const path = hopPath(real, { railway: railway("JR-East.ChuoRapid"), from: st("新宿"), to: st("東京"), seated: false, walk: false });
    // 新宿 四ツ谷 御茶ノ水 神田 東京 on the Chuo Rapid line
    expect(path).toHaveLength(5);
    const tokyo = real.stations[st("東京")]!;
    expect(path.at(-1)![0]).toBeCloseTo(tokyo.stops.find(([r]) => r === railway("JR-East.ChuoRapid"))![1], 5);
  });

  it("goes the short way round a loop line", () => {
    const path = hopPath(real, { railway: railway("JR-East.Yamanote"), from: st("大崎"), to: st("新宿"), seated: false, walk: false });
    // 大崎 五反田 目黒 恵比寿 渋谷 原宿 代々木 新宿, not the 23-station way round
    expect(path).toHaveLength(8);
    const back = hopPath(real, { railway: railway("JR-East.Yamanote"), from: st("品川"), to: st("大崎"), seated: false, walk: false });
    expect(back.length).toBeLessThan(5);
  });

  it("draws a pairing the railway does not list as a straight segment", () => {
    const odd = hopPath(real, { railway: railway("JR-East.Yamanote"), from: st("上野"), to: st("吉祥寺"), seated: false, walk: false });
    expect(odd).toHaveLength(2);
  });
});

describe("routePath", () => {
  it("joins the hops of a route without repeating the shared points", () => {
    const hops = [
      { railway: railway("JR-East.ChuoRapid"), from: st("新宿"), to: st("御茶ノ水"), seated: false, walk: false },
      { railway: railway("JR-East.ChuoSobuLocal"), from: st("御茶ノ水"), to: st("秋葉原"), seated: false, walk: false },
    ];
    const path = routePath(real, hops);
    expect(path[0]).toEqual(hopPath(real, hops[0]!)[0]);
    expect(path.length).toBeLessThanOrEqual(hopPath(real, hops[0]!).length + hopPath(real, hops[1]!).length);
    expect(routePath(real, [])).toEqual([]);
  });

  it("joins a walk between stations with a straight step", () => {
    const keisei = railway("Keisei.Main");
    const yamanote = railway("JR-East.Yamanote");
    const hops = [
      { railway: keisei, from: st("日暮里"), to: st("京成上野"), seated: false, walk: false },
      { railway: yamanote, from: st("上野"), to: st("秋葉原"), seated: false, walk: true },
    ];
    const first = hopPath(real, hops[0]!);
    const second = hopPath(real, hops[1]!);
    const path = routePath(real, hops);
    const i = first.length - 1;
    expect(path[i]).toEqual(first.at(-1));
    expect(path[i + 1]).toEqual(second[0]);
    expect(path).toHaveLength(first.length + second.length);
  });
});

/** Path length in km, flat-earth near Tokyo. */
function km(path: readonly LngLat[]): number {
  return path.slice(1).reduce((sum, [x, y], i) => {
    const [px, py] = path[i]!;
    return sum + Math.hypot((x - px) * 90.4, (y - py) * 110.5);
  }, 0);
}

describe("hopPath along the track", () => {
  const shapes = realShapes()!;
  const chuo = { railway: railway("JR-East.ChuoRapid"), from: st("新宿"), to: st("東京"), seated: false, walk: false };

  it("follows the track between the stations and still starts and ends at the platforms", () => {
    const plain = hopPath(real, chuo);
    const track = hopPath(real, chuo, shapes);
    expect(track.length).toBeGreaterThan(plain.length);
    expect(track[0]).toEqual(plain[0]);
    expect(track.at(-1)).toEqual(plain.at(-1));
    expect(km(track)).toBeGreaterThan(km(plain)); // the track curves round the palace
    expect(km(track)).toBeLessThan(km(plain) * 1.5);
  });

  it("draws the same line backwards for a ride the other way", () => {
    const back = hopPath(real, { ...chuo, from: chuo.to, to: chuo.from }, shapes);
    expect(back).toEqual([...hopPath(real, chuo, shapes)].reverse());
  });

  it("uses the closing pair of a loop line", () => {
    const yamanote = railway("JR-East.Yamanote");
    const line = real.railways[yamanote]!.stations;
    const hop = { railway: yamanote, from: line.at(-1)!, to: line[0]!, seated: false, walk: false };
    expect(hopPath(real, hop)).toHaveLength(2);
    expect(hopPath(real, hop, shapes).length).toBeGreaterThan(2);
  });

  it("draws a pair with no track as a straight line between the platforms", () => {
    const none: TrackShapes = real.railways.map(() => []);
    expect(hopPath(real, chuo, none)).toEqual(hopPath(real, chuo));
  });

  it("takes the nearer stop of a line that visits a station twice", () => {
    // The Oedo line lists 都庁前 at both ends of its loop. A ride to 光が丘 runs out along the branch.
    const oedo = railway("Toei.Oedo");
    const line = real.railways[oedo]!.stations;
    expect(line.filter((s) => s === st("都庁前"))).toHaveLength(2);
    const ride = { railway: oedo, from: st("都庁前"), to: st("光が丘"), seated: false, walk: false };
    expect(hopPath(real, ride)).toHaveLength(Math.abs(line.lastIndexOf(st("都庁前")) - line.indexOf(st("光が丘"))) + 1);
    expect(km(hopPath(real, ride, shapes))).toBeLessThan(20);
  });

  it("reaches the legs and the whole route", () => {
    const legs = routeLegs(real, [chuo], shapes);
    expect(legs[0]!.path).toEqual(hopPath(real, chuo, shapes));
    expect(routePath(real, [chuo], shapes)).toEqual(hopPath(real, chuo, shapes));
  });
});
