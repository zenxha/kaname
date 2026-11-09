import react from "@vitejs/plugin-react";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { defineConfig, type Plugin } from "vite";

/** The public address. Link previews need absolute image URLs. Override with KANAME_SITE_URL. */
const SITE_URL = (process.env.KANAME_SITE_URL ?? "https://kaname-1l6.pages.dev").replace(/\/+$/, "");
const STATIC = join(import.meta.dirname, "static");
const TYPES: Readonly<Record<string, string>> = { ".png": "image/png", ".svg": "image/svg+xml" };

/**
 * The site's own files (link preview image, icons, host headers) live in web/static, because the
 * public folder is the pipeline's data/. This copies them into the build and serves them in dev,
 * and writes the site address into index.html.
 */
function siteFiles(): Plugin {
  const files = readdirSync(STATIC);
  return {
    name: "kaname-site-files",
    transformIndexHtml: (html) => html.replaceAll("%SITE_URL%", SITE_URL),
    generateBundle() {
      for (const name of files) this.emitFile({ type: "asset", fileName: name, source: readFileSync(join(STATIC, name)) });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = (req.url ?? "").split("?")[0]!.replace(/^\//, "");
        const type = TYPES[extname(name)];
        if (!files.includes(name) || type === undefined) return next();
        res.setHeader("Content-Type", type);
        res.end(readFileSync(join(STATIC, name)));
      });
    },
  };
}

// The app reads the pipeline's files from the repo's data/ folder, served as static files.
export default defineConfig({
  plugins: [react(), siteFiles()],
  base: "./",
  publicDir: "../data",
  server: { port: 5173, strictPort: true },
  build: { outDir: "dist", sourcemap: true },
});
