import { defineConfig } from "vite";

// Relative base so the same build works on the web and inside Capacitor.
export default defineConfig({
  base: "./",
  build: { outDir: "dist", target: "es2020" },
});
