import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/main.js"],
  bundle: true,
  outfile: "dist/main.js",
  platform: "node",
  format: "cjs",
  target: "es2018",
  external: ["obsidian"],
  logLevel: "info"
});
