import * as fs from "fs";
import * as path from "path";

export interface AppSettings {
  windowWidth?: number;
  windowHeight?: number;
  gitPath?: string;
  repos?: { path: string; name: string }[];
  themePreset?: string;
  language?: "en" | "zh";
  lastRepo?: string | null;
  [key: string]: unknown;
}

/**
 * Infrastructure adapter: persists application settings to a JSON file
 * under the Electron userData directory, with an in-memory cache.
 */
export class SettingsRepository {
  private readonly filePath: string;
  private cache: AppSettings | null = null;

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, "zentree-settings.json");
  }

  load(): AppSettings {
    if (this.cache) return this.cache;
    try {
      if (fs.existsSync(this.filePath)) {
        this.cache = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as AppSettings;
        return this.cache;
      }
    } catch { /* corrupt or unreadable settings: fall back to defaults */ }
    this.cache = {};
    return this.cache;
  }

  get(key: string): unknown {
    return this.load()[key];
  }

  set(key: string, value: unknown): void {
    const settings = this.load();
    settings[key] = value;
    this.save(settings);
  }

  save(settings: AppSettings): void {
    this.cache = settings;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(settings, null, 2), "utf8");
    } catch { /* persistence is best-effort */ }
  }
}
