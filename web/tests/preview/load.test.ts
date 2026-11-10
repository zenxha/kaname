/** The server loads the same packed files the app loads, through the site's own asset store. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { routeFor, routeInBlock } from "../../core/routes";
import { dataVersion, loadPreviewData, routeBlock, type AssetFetch } from "../../preview/load";
import { answerFor } from "../../preview/plan";
import { packData } from "../../scripts/pack";
import { DATA_DIR, real, realRoutes } from "../realData";

const packed = packData(DATA_DIR);

/** The built site: packed files from the packer, every other file from data/. */
const site: AssetFetch = async (path) => {
  const name = path.replace(/^\//, "");
  const gz = packed.get(name);
  if (gz) return new Response(new Uint8Array(gz));
  try {
    return new Response(readFileSync(join(DATA_DIR, name)));
  } catch {
    return new Response("not found", { status: 404 });
  }
};

describe("loadPreviewData", () => {
  it("gives the same answer as the app's data", async () => {
    const data = await loadPreviewData(site);
    expect(data.matrix.nStations).toBe(real.nStations);
    expect(data.matrix.nCandidates).toBe(real.nCandidates);
    expect(data.shapes).not.toBeNull();
    expect(answerFor(data.matrix, "?p=seiseki-sakuragaoka_Shizuku&p=shibamata_Tora")?.station.ja).toBe("神田");
  });

  it("takes a file that the host already unpacked as it is", async () => {
    const unpacked: AssetFetch = async (path) => {
      const name = path.replace(/^\//, "");
      return name.startsWith("packed/") ? new Response(readFileSync(join(DATA_DIR, name.slice("packed/".length, -".gz".length)))) : site(path);
    };
    expect((await loadPreviewData(unpacked)).matrix.nStations).toBe(real.nStations);
  });

  it("fails with the name of a missing file", async () => {
    const broken: AssetFetch = async (path) => (path.endsWith("stations.json") ? new Response("", { status: 404 }) : site(path));
    await expect(loadPreviewData(broken)).rejects.toThrow("stations.json");
  });
});

describe("routeBlock", () => {
  it("reads one meeting station's routes from its packed file", async () => {
    const k = real.byId.get("kanda")!;
    const tora = real.byId.get("shibamata")!;
    const block = await routeBlock(site, k);
    expect(routeInBlock(block, "out", k, tora, real.nStations)).toEqual(routeFor(realRoutes(), "out", k, tora));
  });
});

describe("dataVersion", () => {
  it("changes when any data file changes, so a new deploy draws new pictures", async () => {
    const meta = { files: { "a.u16": { sha256: "aa" }, "b.json": { sha256: "bb" } } };
    const changed = { files: { "a.u16": { sha256: "aa" }, "b.json": { sha256: "bc" } } };
    expect(dataVersion(meta)).toMatch(/^[0-9a-f]{8}$/);
    expect(dataVersion(meta)).toBe(dataVersion({ files: { "b.json": { sha256: "bb" }, "a.u16": { sha256: "aa" } } }));
    expect(dataVersion(changed)).not.toBe(dataVersion(meta));
    expect((await loadPreviewData(site)).version).toMatch(/^[0-9a-f]{8}$/);
  });
});
