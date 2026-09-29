// Case-insensitive, read-only folder access over the ways a browser can hand us a dump. Lookups try
// the exact name first (no listing needed, which matters for folders like Tnrpics with ~90,000
// files) and fall back to one cached listing.

import { MANIFEST_NAME, parseManifest, type ManifestDir } from "./manifest";

/** What the viewer needs from a file: a real File, or a lazily fetched one in development. */
export interface FileLike {
  readonly name: string;
  readonly size: number;
  readonly lastModified: number;
  slice(start?: number, end?: number): { arrayBuffer(): Promise<ArrayBuffer> };
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface Dir {
  readonly name: string;
  dir(name: string): Promise<Dir | null>;
  file(name: string): Promise<FileLike | null>;
  dirs(): Promise<Dir[]>;
  fileNames(): Promise<string[]>;
}

export async function bytes(dir: Dir, name: string): Promise<Uint8Array | null> {
  const f = await dir.file(name);
  return f ? new Uint8Array(await f.arrayBuffer()) : null;
}

/** Chrome/Edge folder picker or drag and drop: a FileSystemDirectoryHandle. */
export class HandleDir implements Dir {
  readonly name: string;
  private listing: Map<string, FileSystemHandle> | null = null;
  private readonly sub = new Map<string, HandleDir>();
  readonly handle: FileSystemDirectoryHandle;
  constructor(handle: FileSystemDirectoryHandle) {
    this.handle = handle;
    this.name = handle.name;
  }
  private async map() {
    if (!this.listing) {
      const m = new Map<string, FileSystemHandle>();
      // entries() is missing from older DOM typings.
      for await (const [n, c] of (this.handle as any).entries() as AsyncIterable<
        [string, FileSystemHandle]
      >)
        m.set(n.toLowerCase(), c);
      this.listing = m;
    }
    return this.listing;
  }
  private wrap(h: FileSystemDirectoryHandle) {
    const k = h.name.toLowerCase();
    if (!this.sub.has(k)) this.sub.set(k, new HandleDir(h));
    return this.sub.get(k)!;
  }
  async dir(n: string) {
    const cached = this.sub.get(n.toLowerCase());
    if (cached) return cached;
    if (!this.listing) {
      try {
        return this.wrap(await this.handle.getDirectoryHandle(n));
      } catch {
        /* try the listing */
      }
    }
    const v = (await this.map()).get(n.toLowerCase());
    return v && v.kind === "directory" ? this.wrap(v as FileSystemDirectoryHandle) : null;
  }
  async file(n: string) {
    if (!this.listing) {
      try {
        return await (await this.handle.getFileHandle(n)).getFile();
      } catch {
        /* try the listing */
      }
    }
    const v = (await this.map()).get(n.toLowerCase());
    return v && v.kind === "file" ? (v as FileSystemFileHandle).getFile() : null;
  }
  async dirs() {
    return [...(await this.map()).values()]
      .filter((v) => v.kind === "directory")
      .map((v) => this.wrap(v as FileSystemDirectoryHandle));
  }
  async fileNames() {
    return [...(await this.map()).values()].filter((v) => v.kind === "file").map((v) => v.name);
  }
}

/** Drag and drop in browsers without handles: a FileSystemDirectoryEntry, read one folder at a time. */
export class EntryDir implements Dir {
  readonly name: string;
  private listing: Map<string, FileSystemEntry> | null = null;
  private readonly sub = new Map<string, EntryDir>();
  readonly entry: FileSystemDirectoryEntry;
  constructor(entry: FileSystemDirectoryEntry) {
    this.entry = entry;
    this.name = entry.name;
  }
  private async map() {
    if (!this.listing) {
      const m = new Map<string, FileSystemEntry>();
      const reader = this.entry.createReader();
      // readEntries returns batches (100 at a time in Chrome) until an empty one.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) =>
          reader.readEntries(res, rej),
        );
        if (!batch.length) break;
        for (const x of batch) m.set(x.name.toLowerCase(), x);
      }
      this.listing = m;
    }
    return this.listing;
  }
  private wrap(e: FileSystemDirectoryEntry) {
    const k = e.name.toLowerCase();
    if (!this.sub.has(k)) this.sub.set(k, new EntryDir(e));
    return this.sub.get(k)!;
  }
  private get(kind: "getFile" | "getDirectory", n: string) {
    return new Promise<FileSystemEntry | null>((res) =>
      this.entry[kind](
        n,
        {},
        (x: FileSystemEntry) => res(x),
        () => res(null),
      ),
    );
  }
  async dir(n: string) {
    const cached = this.sub.get(n.toLowerCase());
    if (cached) return cached;
    if (!this.listing) {
      const d = await this.get("getDirectory", n);
      if (d) return this.wrap(d as FileSystemDirectoryEntry);
    }
    const v = (await this.map()).get(n.toLowerCase());
    return v && v.isDirectory ? this.wrap(v as FileSystemDirectoryEntry) : null;
  }
  async file(n: string) {
    let fe = this.listing ? null : await this.get("getFile", n);
    if (!fe) {
      const v = (await this.map()).get(n.toLowerCase());
      fe = v && v.isFile ? v : null;
    }
    return fe ? new Promise<File>((res, rej) => (fe as FileSystemFileEntry).file(res, rej)) : null;
  }
  async dirs() {
    return [...(await this.map()).values()]
      .filter((v) => v.isDirectory)
      .map((v) => this.wrap(v as FileSystemDirectoryEntry));
  }
  async fileNames() {
    return [...(await this.map()).values()].filter((v) => v.isFile).map((v) => v.name);
  }
}

/** A <input webkitdirectory> file list (the fallback when neither of the above is available). */
export class ListDir implements Dir {
  readonly sub = new Map<string, ListDir>();
  readonly files = new Map<string, File>();
  readonly name: string;
  constructor(name: string) {
    this.name = name;
  }
  /** Builds the tree in chunks, yielding to the browser so the page can show progress. */
  static async from(fileList: FileList, onProgress?: (done: number, total: number) => void) {
    const root = new ListDir("");
    const n = fileList.length,
      CHUNK = 4000;
    for (let i = 0; i < n; i++) {
      const f = fileList[i];
      const parts = f.webkitRelativePath.split("/");
      let d = root;
      for (let k = 0; k < parts.length - 1; k++) {
        const key = parts[k].toLowerCase();
        if (!d.sub.has(key)) d.sub.set(key, new ListDir(parts[k]));
        d = d.sub.get(key)!;
      }
      d.files.set(parts[parts.length - 1].toLowerCase(), f);
      if (i % CHUNK === CHUNK - 1) {
        onProgress?.(i + 1, n);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    onProgress?.(n, n);
    return root.sub.size === 1 && root.files.size === 0 ? [...root.sub.values()][0] : root;
  }
  async dir(n: string) {
    return this.sub.get(n.toLowerCase()) || null;
  }
  async file(n: string) {
    return this.files.get(n.toLowerCase()) || null;
  }
  async dirs() {
    return [...this.sub.values()];
  }
  async fileNames() {
    return [...this.files.values()].map((f) => f.name);
  }
}

/** A file on a web server, read with HTTP Range requests as slices are needed. */
class RemoteFile implements FileLike {
  readonly url: string;
  readonly name: string;
  readonly size: number;
  readonly lastModified: number;
  constructor(url: string, name: string, size: number, lastModified: number) {
    this.url = url;
    this.name = name;
    this.size = size;
    this.lastModified = lastModified;
  }
  slice(start = 0, end = this.size) {
    const s = Math.max(0, Math.min(start, this.size)),
      e = Math.max(s, Math.min(end, this.size));
    return {
      arrayBuffer: async () => {
        if (e <= s) return new ArrayBuffer(0);
        const r = await remoteFetch(this.url, { headers: { Range: `bytes=${s}-${e - 1}` } });
        const buf = await r.arrayBuffer();
        // A server that ignores Range sends the whole file.
        return r.status === 206 ? buf : buf.slice(s, e);
      },
    };
  }
  async arrayBuffer() {
    return (await remoteFetch(this.url)).arrayBuffer();
  }
}

/** fetch with messages that say what went wrong with a hosted dump. */
export async function remoteFetch(url: string, init?: RequestInit): Promise<Response> {
  let r: Response;
  try {
    r = await fetch(url, init);
  } catch {
    throw new Error(
      `Could not reach ${url}. The server must be online and allow cross-origin requests (CORS) from this page.`,
    );
  }
  if (!r.ok) throw new Error(`${url}: the server answered ${r.status} ${r.statusText}.`);
  return r;
}

/**
 * A dump hosted as static files, described by an etna.json manifest (see manifest.ts). Listed
 * folders answer from the manifest; unlisted (image) folders look files up by exact name.
 */
export class RemoteDir implements Dir {
  readonly url: string;
  readonly name: string;
  private readonly node: ManifestDir;
  private readonly sub = new Map<string, RemoteDir>();
  constructor(url: string, name: string, node: ManifestDir) {
    this.url = url;
    this.name = name;
    this.node = node;
  }
  private find<T>(map: Record<string, T> | undefined, n: string): [string, T] | null {
    if (!map) return null;
    if (n in map) return [n, map[n]];
    const lower = n.toLowerCase();
    for (const k in map) if (k.toLowerCase() === lower) return [k, map[k]];
    return null;
  }
  private child(name: string, node: ManifestDir) {
    const k = name.toLowerCase();
    if (!this.sub.has(k))
      this.sub.set(k, new RemoteDir(this.url + encodeURIComponent(name) + "/", name, node));
    return this.sub.get(k)!;
  }
  async dir(n: string) {
    if (this.node.open) return this.child(n, { open: true });
    const hit = this.find(this.node.d, n);
    return hit ? this.child(hit[0], hit[1]) : null;
  }
  async file(n: string) {
    const url = this.url + encodeURIComponent(n);
    if (this.node.open) {
      // Not listed: ask the server whether it exists and how big it is.
      const r = await fetch(url, { method: "HEAD" }).catch(() => null);
      if (!r || !r.ok) return null;
      const size = +(r.headers.get("content-length") ?? 0);
      return new RemoteFile(url, n, size, Date.parse(r.headers.get("last-modified") ?? "") || 0);
    }
    const hit = this.find(this.node.f, n);
    return hit
      ? new RemoteFile(this.url + encodeURIComponent(hit[0]), hit[0], hit[1][0], hit[1][1])
      : null;
  }
  async dirs() {
    return Object.entries(this.node.d ?? {}).map(([n, node]) => this.child(n, node));
  }
  async fileNames() {
    return Object.keys(this.node.f ?? {});
  }

  /**
   * Opens a hosted dump from its folder URL (http(s)://…, or ipfs://CID/path through a public
   * gateway). The folder must hold an etna.json.
   */
  static async open(input: string): Promise<RemoteDir> {
    const url = dumpUrl(input);
    const u = new URL(url);
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname);
    if (u.protocol === "http:" && !local && globalThis.location?.protocol === "https:")
      throw new Error(
        `Browsers block http:// links from an https:// page. Host the dump over HTTPS (or open Etna itself over http://).`,
      );
    const r = await remoteFetch(url + MANIFEST_NAME).catch((e: Error) => {
      throw new Error(
        `${e.message} Is there an ${MANIFEST_NAME} in that folder? Create one with “make manifest”.`,
      );
    });
    const m = parseManifest(await r.text());
    const name =
      decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() ?? "") ||
      new URL(url).host;
    return new RemoteDir(url, name, m.root);
  }
}

/** A dump link as a folder URL ending in "/": ipfs://CID/path goes through a public gateway. */
export function dumpUrl(input: string): string {
  let u = input.trim();
  const ipfs = /^(?:ipfs:\/\/|\/ipfs\/)(.+)$/i.exec(u);
  if (ipfs) u = `https://ipfs.io/ipfs/${ipfs[1]}`;
  if (!/^https?:\/\//i.test(u))
    throw new Error("Enter a link starting with https://, http:// or ipfs://.");
  return u.endsWith("/") ? u : u + "/";
}

/** Files held in memory, by path ("PQ/Data1/OVERVIEW.BIN"): the built-in demo catalog. */
export class MemoryDir implements Dir {
  readonly name: string;
  private readonly sub = new Map<string, MemoryDir>();
  private readonly files = new Map<string, File>();
  constructor(name: string) {
    this.name = name;
  }
  /** The top folder of the paths (they must share one). */
  static from(files: Map<string, Uint8Array>): MemoryDir {
    const root = new MemoryDir("");
    for (const [path, data] of files) {
      const parts = path.split("/");
      let d = root;
      for (const p of parts.slice(0, -1)) {
        const k = p.toLowerCase();
        if (!d.sub.has(k)) d.sub.set(k, new MemoryDir(p));
        d = d.sub.get(k)!;
      }
      const name = parts[parts.length - 1];
      d.files.set(
        name.toLowerCase(),
        new File([data as Uint8Array<ArrayBuffer>], name, { lastModified: 0 }),
      );
    }
    return root.sub.size === 1 ? [...root.sub.values()][0] : root;
  }
  async dir(n: string) {
    return this.sub.get(n.toLowerCase()) || null;
  }
  async file(n: string) {
    return this.files.get(n.toLowerCase()) || null;
  }
  async dirs() {
    return [...this.sub.values()];
  }
  async fileNames() {
    return [...this.files.values()].map((f) => f.name);
  }
}
