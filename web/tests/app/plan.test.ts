import { afterEach, describe, expect, it, vi } from "vitest";
import { rank } from "../../core/rank";
import { decodeBase64, fetchRouteBlock, type AppData } from "../../src/data/load";
import { personColor } from "../../src/model/palette";
import { DEFAULT_PEOPLE, removePerson, toParticipants, updatePerson, type Person } from "../../src/model/scenario";
import { buildMapPeople, fitKey, personRoutes, scoredIndexes, stationIndex } from "../../src/usePlan";
import { real, realRoutes } from "../realData";

const routes = realRoutes();

describe("person numbering and routes", () => {
  it("keeps each person's number and color when someone without a start is skipped", () => {
    const people: Person[] = updatePerson(removePerson(DEFAULT_PEOPLE, "p2"), "p3", { start: null });
    expect(scoredIndexes(people)).toEqual([0, 2]);
    const best = rank(toParticipants(people), {}, real).candidates[0]!;
    const shown = buildMapPeople(real, best, [], people);
    expect(shown.map((p) => p.number)).toEqual([1, 3]);
    expect(shown.map((p) => p.color)).toEqual([personColor(0), personColor(2)]);
    expect(shown[1]!.out.length).toBe(2); // no route block yet: a straight line
  });

  it("reads each person's exact routes from the candidate's blocks", () => {
    const best = rank(toParticipants(DEFAULT_PEOPLE), {}, real).candidates[0]!;
    const k = stationIndex(real, best.station.id);
    const blocks = {
      candidate: k,
      out: routes.outRoutes.slice(routes.outIdx[k]!, routes.outIdx[k + 1]!),
      home: routes.homeRoutes.slice(routes.homeIdx[k]!, routes.homeIdx[k + 1]!),
    };
    const r = personRoutes(real, best, blocks);
    expect(r).toHaveLength(4);
    expect(r[0]!.out.at(-1)!.to).toBe(k);
    expect(personRoutes(real, best, null)[0]).toEqual({ out: [], home: [] });
    expect(personRoutes(real, null, blocks)).toEqual([]);
    expect(fitKey(best)).toContain(best.station.id);
    expect(fitKey(null)).toBe("");
  });

  it("names a station missing from the data", () => {
    expect(() => stationIndex(real, "atlantis")).toThrow(/atlantis/);
  });
});

describe("decodeBase64", () => {
  it("round-trips bytes", () => {
    const raw = Uint8Array.from([0, 1, 254, 255, 128]);
    expect([...decodeBase64(Buffer.from(raw).toString("base64"))]).toEqual([...raw]);
  });
});

describe("fetchRouteBlock", () => {
  const data = { base: "/", routeIndex: { out: Uint32Array.from([0, 3, 3]), home: Uint32Array.from([0, 1, 2]) } } as unknown as AppData;
  const file = new Uint8Array(new Uint16Array([1, 7, 9]).buffer);
  const respond = (status: number, body: Uint8Array, range?: string) =>
    vi.fn(async () => new Response(body.slice(), { status, headers: range ? { "Content-Range": range } : {} }));
  afterEach(() => vi.unstubAllGlobals());

  it("uses a 206 partial response", async () => {
    vi.stubGlobal("fetch", respond(206, file, "bytes 0-5/6"));
    expect([...await fetchRouteBlock(data, "out", 0)]).toEqual([1, 7, 9]);
  });

  it("cuts the block out of a whole-file 200 response", async () => {
    vi.stubGlobal("fetch", respond(200, new Uint8Array([...file, 4, 0])));
    expect([...await fetchRouteBlock(data, "home", 1)]).toEqual([7]);
  });

  it("downloads a whole file only once when the host ignores Range", async () => {
    const noRange = { ...data, base: "/no-range/" } as AppData;
    const f = respond(200, new Uint8Array([...file, 4, 0]));
    vi.stubGlobal("fetch", f);
    expect([...await fetchRouteBlock(noRange, "home", 0)]).toEqual([1]);
    expect([...await fetchRouteBlock(noRange, "home", 1)]).toEqual([7]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("returns an empty block without a request", async () => {
    const f = respond(206, file);
    vi.stubGlobal("fetch", f);
    expect(await fetchRouteBlock(data, "out", 1)).toHaveLength(0);
    expect(f).not.toHaveBeenCalled();
  });

  it("rejects a wrong byte range, a short body and an HTTP error", async () => {
    vi.stubGlobal("fetch", respond(206, file, "bytes 2-7/8"));
    await expect(fetchRouteBlock(data, "out", 0)).rejects.toThrow(/another byte range/);
    vi.stubGlobal("fetch", respond(200, new Uint8Array(2)));
    await expect(fetchRouteBlock(data, "out", 0)).rejects.toThrow(/truncated/);
    vi.stubGlobal("fetch", respond(404, new Uint8Array(0)));
    await expect(fetchRouteBlock(data, "out", 0)).rejects.toThrow(/404/);
  });
});
