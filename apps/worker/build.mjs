// Bundles the worker into one ES module for Railway. Some dependencies (pg-boss, ws, e2b's
// helpers) are CommonJS and call require() for Node built-ins; an ES module has no require, so
// the banner provides one, along with __filename and __dirname.
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  outfile: "dist/index.js",
  banner: {
    js: [
      'import { createRequire as __nexusCreateRequire } from "node:module";',
      'import { fileURLToPath as __nexusFileUrlToPath } from "node:url";',
      'import { dirname as __nexusDirname } from "node:path";',
      "const require = __nexusCreateRequire(import.meta.url);",
      "const __filename = __nexusFileUrlToPath(import.meta.url);",
      "const __dirname = __nexusDirname(__filename);",
    ].join("\n"),
  },
  logLevel: "info",
});
