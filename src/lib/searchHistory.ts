// Recent searches of the top-bar box.
import { readJson, writeJson } from "./storage";
import { VIN_RE } from "./vin";

const KEY = "etna.history";
const MAX = 30;

export const SearchHistory = {
  items: (): string[] => readJson<string[]>(KEY, []),
  save(items: string[]) {
    writeJson(KEY, items.slice(0, MAX));
  },
  add(q: string) {
    q = q.trim();
    if (!q) return;
    this.save([q, ...this.items().filter((x) => x.toLowerCase() !== q.toLowerCase())]);
  },
  remove(q: string) {
    this.save(this.items().filter((x) => x !== q));
  },
};

/** What a search looks like: "VIN", "part", "code" or "". */
export function historyKind(q: string) {
  const c = q.replace(/\s+/g, "");
  if (VIN_RE.test(c)) return "VIN";
  if (/^[0-9A-Z]{3}\d{3}\d{3}/i.test(c) || /^N\d{6,}/i.test(c)) return "part";
  if (/^[0-9A-Z]{2,4}$/i.test(c) && !/\d/.test(c) && c === c.toUpperCase()) return "code";
  return "";
}
