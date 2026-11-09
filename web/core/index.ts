/** kaname scoring engine: pure functions, no DOM, shared by the CLI and the web app. */
export { parseData, normalizeName, UNREACHABLE, SAME_STATION, NO_TRANSFERS, MATRIX_FILES } from "./data";
export type { MatrixData, StationRecord, RailwayRecord, Buffers } from "./data";
export { RankError } from "./errors";
export type { RankErrorCode } from "./errors";
export { rank, paretoSet, DEFAULT_ALPHA, DEFAULT_LAMBDA, DEFAULT_LIMIT } from "./rank";
export { MAX_PARTICIPANTS } from "./participants";
export { findStation, snapToStations, walkMinutes, MAX_SNAP_M } from "./stations";
export { parseRoutes, routeFor, routeInBlock } from "./routes";
export type { RouteData, RouteHop } from "./routes";
export { parseClock, formatClock } from "./time";
export type * from "./types";
