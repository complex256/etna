// etna.json: the file list of a dump hosted as plain static files (IPFS, object storage, a NAS),
// which cannot list folders themselves. Built once with `make manifest` and stored at the top of the
// hosted folder. The image folders are not listed: files there are fetched by exact name.
import type { Dir } from "./fs";

export const MANIFEST_NAME = "etna.json";
export const MANIFEST_VERSION = 1;

/** A folder: sub-folders, and files as [size, lastModified ms]; `open` = contents not listed. */
export interface ManifestDir {
  d?: Record<string, ManifestDir>;
  f?: Record<string, [number, number]>;
  open?: true;
}
export interface Manifest {
  etna: number;
  root: ManifestDir;
}

/** Folders fetched by exact name (tens of thousands of pictures): not listed. */
const OPEN = /^(bilder|minis|tnrpics|vseiten_pics|zubjpeg)$/i;

export async function buildManifest(
  dir: Dir,
  onProgress?: (files: number) => void,
): Promise<Manifest> {
  let count = 0;
  async function walk(d: Dir): Promise<ManifestDir> {
    const node: ManifestDir = {};
    const names = await d.fileNames();
    if (names.length) {
      node.f = {};
      for (const n of names.sort()) {
        const f = await d.file(n);
        if (f) node.f[n] = [f.size, Math.round(f.lastModified)];
        if (++count % 500 === 0) onProgress?.(count);
      }
    }
    const subs = await d.dirs();
    if (subs.length) {
      node.d = {};
      for (const s of subs.sort((a, b) => a.name.localeCompare(b.name)))
        node.d[s.name] = OPEN.test(s.name) ? { open: true } : await walk(s);
    }
    return node;
  }
  const root = await walk(dir);
  onProgress?.(count);
  return { etna: MANIFEST_VERSION, root };
}

export function parseManifest(text: string): Manifest {
  const m = JSON.parse(text) as Manifest;
  if (!m || typeof m !== "object" || m.etna !== MANIFEST_VERSION || !m.root)
    throw new Error("This etna.json is not a manifest this version of Etna can read.");
  return m;
}
