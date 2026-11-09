import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main, parsePerson } from "../../cli/rank";
import { loadMatrixData } from "../../cli/loadData";
import { DATA_DIR, REPO_DIR } from "./realData";

function run(...argv: string[]): { code: number; out: string; err: string } {
  const out: string[] = [];
  const err: string[] = [];
  const code = main(argv, { out: (s) => out.push(s), err: (s) => err.push(s) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

describe("parsePerson", () => {
  it("reads label:start>home with stations or coordinates", () => {
    expect(parsePerson("Aki:新宿>八王子")).toEqual({ label: "Aki", start: { station: "新宿" }, home: { station: "八王子" } });
    expect(parsePerson("Ben:35.69,139.70")).toEqual({ label: "Ben", start: { lat: 35.69, lng: 139.7 } });
    expect(() => parsePerson("nolabel")).toThrow(/label:start/);
  });
});

describe("kaname CLI", () => {
  it("ranks and prints a table", () => {
    const r = run("--data", DATA_DIR, "--person", "Aki:町田", "--person", "Ben:大宮>船橋", "--end", "23:30", "--top", "3");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^ *1 /m);
    expect(r.out).toMatch(/Aki/);
    expect(r.out).toMatch(/Pareto/);
  });

  it("prints JSON with --json", () => {
    const r = run("--data", DATA_DIR, "--person", "a:新宿", "--person", "b:渋谷", "--json", "--top", "2");
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.out) as { candidates: unknown[] };
    expect(parsed.candidates).toHaveLength(2);
  });

  it("reads a scenario file", () => {
    const dir = mkdtempSync(join(tmpdir(), "kaname-"));
    const file = join(dir, "s.json");
    writeFileSync(file, JSON.stringify({
      participants: [{ label: "a", start: { station: "東京" } }, { label: "b", start: { lat: 35.6905, lng: 139.7003 } }],
      options: { alpha: 0, meetingEnd: "23:00" },
    }));
    const r = run("--data", DATA_DIR, "--input", file, "--json");
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).participants[1].start[0].station.id).toBe("shinjuku");
    writeFileSync(file, "{");
    expect(run("--data", DATA_DIR, "--input", file).code).toBe(2);
  });

  it("reports errors clearly with exit code 2", () => {
    const unknown = run("--data", DATA_DIR, "--person", "a:小田原", "--person", "b:新宿");
    expect(unknown.code).toBe(2);
    expect(unknown.err).toMatch(/小田原/);
    expect(run("--data", DATA_DIR).code).toBe(2);
    expect(run("--data", DATA_DIR, "--person", "a:新宿", "--alpha", "x").code).toBe(2);
    expect(run("--data", "/nonexistent", "--person", "a:新宿").code).toBe(2);
    expect(run("--bogus").code).toBe(2);
  });

  it("reads relative paths from the caller's directory and reports a missing file cleanly", () => {
    const out: string[] = [];
    const err: string[] = [];
    const io = { out: (s: string) => out.push(s), err: (s: string) => err.push(s), cwd: REPO_DIR };
    expect(main(["spotcheck", "--refs", "pipeline/validation/heldout_reference.csv"], io)).toBe(0);
    expect(main(["spotcheck", "--refs", "no/such.csv"], io)).toBe(2);
    expect(err.join()).toMatch(/cannot read .*no\/such\.csv/);
    expect(main(["spotcheck"], io)).toBe(2);
  });

  it("prints help", () => {
    const r = run("--help");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/--person/);
  });

  it("runs the spot check", () => {
    const refs = join(REPO_DIR, "pipeline", "validation", "heldout_reference.csv");
    const r = run("spotcheck", "--data", DATA_DIR, "--refs", refs);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/within ±5/);
  });
});

describe("loadMatrixData", () => {
  it("refuses files whose checksum does not match meta.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "kaname-data-"));
    for (const f of ["meta.json", "stations.json", "out_min.u16", "out_xfer.u8", "home_min.u16", "home_xfer.u8"]) {
      writeFileSync(join(dir, f), readBack(f));
    }
    writeFileSync(join(dir, "last_dep.u16"), new Uint8Array(4));
    expect(() => loadMatrixData(dir)).toThrow(/last_dep\.u16/);
  });
});

function readBack(name: string): Buffer {
  return readFileSync(join(DATA_DIR, name));
}
