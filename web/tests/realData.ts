/** The committed data files in ../data, loaded once per test file. */
import { join } from "node:path";
import { defaultDataDir, loadMatrixData, loadRouteData } from "../../cli/loadData";

export const DATA_DIR = defaultDataDir();
export const REPO_DIR = join(DATA_DIR, "..");
export const real = loadMatrixData(DATA_DIR);
export const realRoutes = () => loadRouteData(DATA_DIR);
