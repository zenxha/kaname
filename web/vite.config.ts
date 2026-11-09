import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The app reads the pipeline's files from the repo's data/ folder, served as static files.
export default defineConfig({
  plugins: [react()],
  base: "./",
  publicDir: "../data",
  server: { port: 5173, strictPort: true },
  build: { outDir: "dist", sourcemap: true },
});
