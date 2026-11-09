import { describe, expect, it } from "vitest";
import { findStation } from "../../core/stations";
import { hopPath, routePath } from "../../src/model/geometry";
import { real } from "../realData";

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
