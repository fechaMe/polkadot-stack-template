import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Node 22 provides crypto.getRandomValues and WebSocket natively.
      environment: "node",
      include: ["src/**/*.test.ts"],
      coverage: {
        provider: "v8",
        reporter: ["text", "lcov"],
        include: ["src/hooks/**", "src/utils/**"],
        exclude: ["src/hooks/useChain.ts", "src/hooks/useConnection.ts"],
      },
    },
  }),
);
