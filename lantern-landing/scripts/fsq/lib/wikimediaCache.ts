import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { WikimediaRunStats } from "./wikimediaTypes";

interface CacheEnvelope<T> {
  status: "ok" | "failed";
  cachedAt: string;
  value?: T;
  error?: string;
}

export class WikimediaCache {
  readonly stats: WikimediaRunStats = { apiRequests: 0, cacheHits: 0, failures: 0, retries: 0 };

  constructor(readonly directory: string) {
    fs.mkdirSync(directory, { recursive: true });
  }

  private filename(key: string): string {
    return path.join(this.directory, `${crypto.createHash("sha256").update(key).digest("hex")}.json`);
  }

  read<T>(key: string): CacheEnvelope<T> | null {
    const filename = this.filename(key);
    if (!fs.existsSync(filename)) return null;
    try {
      const envelope = JSON.parse(fs.readFileSync(filename, "utf8")) as CacheEnvelope<T>;
      this.stats.cacheHits += 1;
      return envelope;
    } catch {
      return null;
    }
  }

  writeSuccess<T>(key: string, value: T): void {
    fs.writeFileSync(this.filename(key), `${JSON.stringify({ status: "ok", cachedAt: new Date().toISOString(), value }, null, 2)}\n`, "utf8");
  }

  writeFailure(key: string, error: string): void {
    fs.writeFileSync(this.filename(key), `${JSON.stringify({ status: "failed", cachedAt: new Date().toISOString(), error }, null, 2)}\n`, "utf8");
  }
}
