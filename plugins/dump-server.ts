// Dev only: serves a catalog dump folder at /__dump/ so `vp dev` opens it without the folder picker.
// Folders answer with a JSON listing; files support HTTP Range, so the viewer can read slices of
// multi-hundred-MB tables (STAMM, FPreis) the way it does with local files.
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite-plus";

export const DUMP_PREFIX = "/__dump/";

export function dumpServer(dir: string | undefined): Plugin {
  const root = dir ? path.resolve(dir.replace(/^~(?=$|\/)/, process.env.HOME ?? "~")) : null;
  const usable = !!root && fs.existsSync(root) && fs.statSync(root).isDirectory();
  return {
    name: "etna-dump-server",
    apply: "serve",
    config() {
      return { define: { __DEV_DUMP__: JSON.stringify(usable ? path.basename(root!) : null) } };
    },
    configureServer(server) {
      if (dir && !usable) server.config.logger.warn(`DUMP folder not found: ${dir}`);
      if (!usable) return;
      server.config.logger.info(`Serving catalog dump ${root} at ${DUMP_PREFIX}`);
      server.middlewares.use(DUMP_PREFIX, (req, res) => {
        const rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
        const target = path.join(root!, rel);
        if (target !== root && !target.startsWith(root! + path.sep)) {
          res.statusCode = 403;
          res.end();
          return;
        }
        let st: fs.Stats;
        try {
          st = fs.statSync(target);
        } catch {
          res.statusCode = 404;
          res.end();
          return;
        }
        if (st.isDirectory()) {
          const list = fs.readdirSync(target, { withFileTypes: true }).flatMap((e) => {
            try {
              const s = fs.statSync(path.join(target, e.name));
              return [{ name: e.name, dir: s.isDirectory(), size: s.size, mtime: s.mtimeMs }];
            } catch {
              return [];
            }
          });
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(list));
          return;
        }
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Content-Type", "application/octet-stream");
        const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
        if (m) {
          const start = +m[1];
          const end = Math.min(m[2] ? +m[2] : st.size - 1, st.size - 1);
          if (start > end) {
            res.statusCode = 416;
            res.setHeader("Content-Range", `bytes */${st.size}`);
            res.end();
            return;
          }
          res.statusCode = 206;
          res.setHeader("Content-Range", `bytes ${start}-${end}/${st.size}`);
          res.setHeader("Content-Length", String(end - start + 1));
          fs.createReadStream(target, { start, end }).pipe(res);
          return;
        }
        res.setHeader("Content-Length", String(st.size));
        fs.createReadStream(target).pipe(res);
      });
    },
  };
}
