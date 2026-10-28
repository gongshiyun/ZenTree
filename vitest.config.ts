import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Hermetic git config/hooks/identity for every worker (see tests/setup.ts).
    setupFiles: ["tests/setup.ts"],
    // Real-git integration tests (clone/submodule/rebase on Windows) are slow;
    // keep generous margins so CI machines with antivirus do not flake.
    testTimeout: 60000,
    hookTimeout: 60000,
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary"],
      include: ["src/**/*.{ts,tsx}", "electron/**/*.ts"],
      exclude: ["src/main.tsx", "src/types/**", "src/assets/**", "src/i18n/**"],
    },
  },
});
