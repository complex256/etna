// Writes etna.json, the file list Etna needs to open a dump hosted as static files:
// `make manifest DUMP=/path/to/dump/<brand>` (or `vp node scripts/manifest.ts <folder>`).
import { writeFileSync } from "node:fs";
import path from "node:path";
import { buildManifest, MANIFEST_NAME } from "../src/lib/manifest.ts";
import { NodeDir } from "./nodeDir.ts";

const folder = process.argv[2];
if (!folder) {
  console.error("usage: vp node scripts/manifest.ts <dump folder>");
  process.exit(2);
}
const root = path.resolve(folder);
const manifest = await buildManifest(new NodeDir(root), (n) =>
  process.stdout.write(`\r${n} files`),
);
const out = path.join(root, MANIFEST_NAME);
const json = JSON.stringify(manifest);
writeFileSync(out, json);
console.log(`\nwrote ${out} (${(json.length / 1024).toFixed(0)} KB)`);
