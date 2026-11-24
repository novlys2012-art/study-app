import { defineConfig } from "vite";

const inContainer = Boolean(
  process.env.LEKTO_DEV_HOST_ALL === "1" ||
  process.env.CLOUD_SHELL ||
  process.env.CODESPACES ||
  process.env.CONTAINER,
);

// Relative base so the same build works on the web and inside Capacitor.
export default defineConfig({
  base: "./",
  server: {
    host: inContainer ? "0.0.0.0" : "127.0.0.1",
    port: 3000,
    ...(inContainer ? { allowedHosts: true } : {}),
  },
  build: { outDir: "dist", target: "es2020" },
});
