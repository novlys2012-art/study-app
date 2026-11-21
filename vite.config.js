import { defineConfig } from "vite";

// Relative base so the same build works on the web and inside Capacitor.
export default defineConfig({
  base: "./",
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
  },
  build: { outDir: "dist", target: "es2020" },
});
