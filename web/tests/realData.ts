/** The committed data files in ../data, loaded once per test file. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultDataDir, loadMatrixData, loadRouteData } from "../../cli/loadData";
import { parseAddresses, type AddressIndex } from "../src/model/address";
import { parseKana, type KanaIndex } from "../src/model/search";

export const DATA_DIR = defaultDataDir();
export const REPO_DIR = join(DATA_DIR, "..");
export const real = loadMatrixData(DATA_DIR);
export const realRoutes = () => loadRouteData(DATA_DIR);
const json = (name: string): unknown => JSON.parse(readFileSync(join(DATA_DIR, name), "utf8"));
export const realKana: KanaIndex = parseKana(json("kana.json"), real);
export const realAddresses = (): AddressIndex => parseAddresses(json("addresses.json"));
