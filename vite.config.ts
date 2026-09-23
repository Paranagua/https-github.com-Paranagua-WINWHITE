// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  plugins: [
    {
      name: "silence-module-level-directives",
      onLog(level, log) {
        if (
          log.code === "MODULE_LEVEL_DIRECTIVE" ||
          (typeof log.message === "string" &&
            (log.message.includes("MODULE_LEVEL_DIRECTIVE") ||
              log.message.includes("use client") ||
              log.message.includes("use server")))
        ) {
          return false;
        }
      },
    },
  ],
  vite: {
    build: {
      rollupOptions: {
        onLog(level, log, defaultHandler) {
          if (
            log.code === "MODULE_LEVEL_DIRECTIVE" ||
            (typeof log.message === "string" &&
              (log.message.includes("MODULE_LEVEL_DIRECTIVE") ||
                log.message.includes("use client") ||
                log.message.includes("use server")))
          ) {
            return;
          }
          defaultHandler(level, log);
        },
        onwarn(warning, defaultHandler) {
          if (
            warning.code === "MODULE_LEVEL_DIRECTIVE" ||
            (typeof warning.message === "string" &&
              (warning.message.includes("MODULE_LEVEL_DIRECTIVE") ||
                warning.message.includes("use client") ||
                warning.message.includes("use server")))
          ) {
            return;
          }
          defaultHandler(warning);
        },
      },
    },
  },
});
