// The viewer's folder interface over Node's file system, for tests against a real dump.
import fs from "node:fs";
import path from "node:path";
import type { Dir, FileLike } from "../../src/lib/fs";

class NodeFile implements FileLike {
  readonly name: string;
  readonly size: number;
  readonly lastModified: number;
  private readonly file: string;
  constructor(file: string) {
    const st = fs.statSync(file);
    this.file = file;
    this.name = path.basename(file);
    this.size = st.size;
    this.lastModified = st.mtimeMs;
  }
  slice(start = 0, end = this.size) {
    return {
      arrayBuffer: async () => {
        const len = Math.max(0, Math.min(end, this.size) - start);
        const buf = Buffer.alloc(len);
        const fd = fs.openSync(this.file, "r");
        try {
          fs.readSync(fd, buf, 0, len, start);
        } finally {
          fs.closeSync(fd);
        }
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + len) as ArrayBuffer;
      },
    };
  }
  async arrayBuffer() {
    const b = fs.readFileSync(this.file);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer;
  }
}

export class NodeDir implements Dir {
  readonly name: string;
  private readonly dirPath: string;
  private listing: Map<string, fs.Dirent> | null = null;
  constructor(dirPath: string) {
    this.dirPath = dirPath;
    this.name = path.basename(dirPath);
  }
  private map() {
    this.listing ??= new Map(
      fs.readdirSync(this.dirPath, { withFileTypes: true }).map((e) => [e.name.toLowerCase(), e]),
    );
    return this.listing;
  }
  async dir(n: string) {
    const e = this.map().get(n.toLowerCase());
    return e?.isDirectory() ? new NodeDir(path.join(this.dirPath, e.name)) : null;
  }
  async file(n: string) {
    const e = this.map().get(n.toLowerCase());
    return e?.isFile() ? new NodeFile(path.join(this.dirPath, e.name)) : null;
  }
  async dirs() {
    return [...this.map().values()]
      .filter((e) => e.isDirectory())
      .map((e) => new NodeDir(path.join(this.dirPath, e.name)));
  }
  async fileNames() {
    return [...this.map().values()].filter((e) => e.isFile()).map((e) => e.name);
  }
}
