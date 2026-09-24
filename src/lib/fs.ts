// Case-insensitive, read-only folder access over the ways a browser can hand us a dump. Lookups try
// the exact name first (no listing needed, which matters for folders like Tnrpics with ~90,000
// files) and fall back to one cached listing.

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

interface HttpEntry {
  name: string;
  dir: boolean;
  size: number;
  mtime: number;
}

/** A file on the development server, fetched with HTTP Range requests as slices are read. */
class HttpFile implements FileLike {
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
        const r = await fetch(this.url, { headers: { Range: `bytes=${s}-${e - 1}` } });
        return r.arrayBuffer();
      },
    };
  }
  async arrayBuffer() {
    return (await fetch(this.url)).arrayBuffer();
  }
}

/** Development: a dump folder served by plugins/dump-server.ts. */
export class HttpDir implements Dir {
  private listing: Promise<Map<string, HttpEntry>> | null = null;
  private readonly sub = new Map<string, HttpDir>();
  readonly url: string;
  readonly name: string;
  constructor(url: string, name: string) {
    this.url = url;
    this.name = name;
  }
  private map() {
    this.listing ??= fetch(this.url)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: HttpEntry[]) => new Map(list.map((e) => [e.name.toLowerCase(), e])));
    return this.listing;
  }
  private child(e: HttpEntry) {
    const k = e.name.toLowerCase();
    if (!this.sub.has(k))
      this.sub.set(k, new HttpDir(this.url + encodeURIComponent(e.name) + "/", e.name));
    return this.sub.get(k)!;
  }
  async dir(n: string) {
    const e = (await this.map()).get(n.toLowerCase());
    return e && e.dir ? this.child(e) : null;
  }
  async file(n: string) {
    const e = (await this.map()).get(n.toLowerCase());
    return e && !e.dir
      ? new HttpFile(this.url + encodeURIComponent(e.name), e.name, e.size, e.mtime)
      : null;
  }
  async dirs() {
    return [...(await this.map()).values()].filter((e) => e.dir).map((e) => this.child(e));
  }
  async fileNames() {
    return [...(await this.map()).values()].filter((e) => !e.dir).map((e) => e.name);
  }
}
