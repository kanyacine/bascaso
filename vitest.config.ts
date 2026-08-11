import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/app/api/**/*.ts"],
      exclude: [
        "src/lib/utils.ts",
        "src/lib/hooks/**",
        // WebGL renderer – needs a GPU context, cannot execute under node. All the pure 3D
        // math it consumes is in three-scene.ts, which IS covered.
        "src/lib/screenshot-editor/three-renderer.ts",
      ],
      thresholds: {
        "src/lib/**/*.ts": {
          lines: 100,
          functions: 100,
          branches: 99,
          statements: 100,
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
