import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The laboratory is a static artifact. There is no server runtime: every scene,
// operator and metric runs in the browser against a locally generated answer key.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    target: "es2022",
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
  },
  server: {
    host: "127.0.0.1",
    port: 8072,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 8073,
    strictPort: true,
  },
});