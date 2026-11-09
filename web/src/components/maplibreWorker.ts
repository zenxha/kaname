/** MapLibre 6 looks for its worker next to its own module, which bundling moves. Point it at a
 * worker that Vite bundles (with its imports) for both the dev server and the production build. */
import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

setWorkerUrl(workerUrl);
