import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["integration/**/*.test.ts"],
    testTimeout: 60000,
    hookTimeout: 60000,
    // Each integration file spawns the Python sidecar on the fixed port 8765;
    // run files serially so two sidecars never race to bind the same port.
    fileParallelism: false,
  },
});
