import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/serverless.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "api/handler.mjs",
  packages: "external",
  logLevel: "info",
});

console.log("Vercel bundle: api/handler.mjs");
