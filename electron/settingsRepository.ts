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
  repoGroups?: { name: string; repos: string[] }[];
  tabs?: string[];
  [key: string]: unknown;
}

const MIN_WINDOW_WIDTH = 900;
const MIN_WINDOW_HEIGHT = 600;
const MAX_WINDOW_SIZE = 10000;

/** Keys with a validated shape; anything else is preserved as a scalar. */
const KNOWN_SETTING_KEYS = new Set([
  "windowWidth", "windowHeight", "gitPath", "language", "themePreset",
  "lastRepo", "repos", "repoGroups", "tabs",
]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clampWindowSize(value: unknown, min: number): number | undefined {
  if (!isFiniteNumber(value)) return undefined;
  const rounded = Math.round(value);
  if (rounded < min) return undefined;
  return Math.min(rounded, MAX_WINDOW_SIZE);
}

function sanitiseStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : undefined;
}

/**
 * Normalise the persisted settings object. A hand-edited or partially corrupted
 * file must never crash the app: unknown shapes fall back to defaults and known
 * keys are coerced/clamped so the window manager and store can trust them.
 */
export function sanitiseSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const out: AppSettings = {};

  const width = clampWindowSize(input.windowWidth, MIN_WINDOW_WIDTH);
  if (width !== undefined) out.windowWidth = width;
  const height = clampWindowSize(input.windowHeight, MIN_WINDOW_HEIGHT);
  if (height !== undefined) out.windowHeight = height;
  if (typeof input.gitPath === "string") out.gitPath = input.gitPath;
  if (input.language === "en" || input.language === "zh") out.language = input.language;
  if (typeof input.themePreset === "string") out.themePreset = input.themePreset;
  if (input.lastRepo === null || typeof input.lastRepo === "string") out.lastRepo = input.lastRepo as string | null;

  if (Array.isArray(input.repos)) {
    const repos = input.repos.filter(
      (r): r is { path: string; name: string } =>
        !!r && typeof r === "object" && typeof (r as { path?: unknown }).path === "string" &&
        typeof (r as { name?: unknown }).name === "string",
    );
    if (repos.length > 0) out.repos = repos;
  }
  if (Array.isArray(input.repoGroups)) {
    const groups = input.repoGroups.filter(
      (g): g is { name: string; repos: string[] } =>
        !!g && typeof g === "object" && typeof (g as { name?: unknown }).name === "string" &&
        Array.isArray((g as { repos?: unknown }).repos),
    ).map((g) => ({ name: g.name, repos: (g.repos as unknown[]).filter((p): p is string => typeof p === "string") }));
    if (groups.length > 0) out.repoGroups = groups;
  }
  const tabs = sanitiseStringArray(input.tabs);
  if (tabs) out.tabs = tabs;

  // Preserve unknown scalar keys for forward compatibility (best effort only).
  // Known keys are never copied raw: an invalid value must be dropped, not
  // resurrected by the fallback branch.
  for (const [key, value] of Object.entries(input)) {
    if (KNOWN_SETTING_KEYS.has(key) || key in out) continue;
    if (typeof value !== "object") out[key] = value;
  }
  return out;
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
        const parsed: unknown = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
        const sanitised = sanitiseSettings(parsed);
        this.cache = sanitised;
        // A structurally broken file (null, array, scalar) is moved aside once
        // so the next save starts clean while the user's original is preserved.
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          this.backupCorruptFile();
        }
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

  private backupCorruptFile(): void {
    try {
      fs.renameSync(this.filePath, `${this.filePath}.corrupt-${Date.now()}`);
    } catch { /* best effort */ }
  }
}
