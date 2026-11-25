import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { superviseCompanion } from "../scripts/companion.mjs";

export default defineConfig({
  base: process.env.NEUROREACH_BASE_PATH || "/",
  plugins: [
    react(),
    {
      name: "neuroreach-local-companion",
      apply: "serve",
      async configureServer(server) {
        // Tests and remote-API development can opt out. This never runs in a
        // production build or exposes a browser-accessible process launcher.
        if (process.env.NEUROREACH_AUTO_COMPANION === "0") return;
        const companion = superviseCompanion({ log: server.config.logger });
        server.httpServer?.once("close", companion.stop);
        // A cold start must become ready before accepting the first staff request.
        await companion.ready;
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:8766", ws: true } },
  },
});
