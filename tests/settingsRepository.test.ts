import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { SettingsRepository } from "../electron/settingsRepository";

let tempDir: string;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zentree-settings-test-"));
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("SettingsRepository", () => {
  it("returns an empty object when no settings file exists", () => {
    const repo = new SettingsRepository(path.join(tempDir, "fresh"));
    expect(repo.load()).toEqual({});
    expect(repo.get("windowWidth")).toBeUndefined();
  });

  it("persists set() values to disk and reads them back", () => {
    const dir = path.join(tempDir, "persist");
    const repo = new SettingsRepository(dir);
    repo.set("themePreset", "dracula");
    repo.set("repos", [{ path: "/r1", name: "r1" }]);

    const file = path.join(dir, "zentree-settings.json");
    expect(fs.existsSync(file)).toBe(true);
    const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(onDisk.themePreset).toBe("dracula");

    // a second instance must see the persisted state
    const repo2 = new SettingsRepository(dir);
    expect(repo2.get("themePreset")).toBe("dracula");
    expect(repo2.get("repos")).toEqual([{ path: "/r1", name: "r1" }]);
  });

  it("creates missing parent directories on save", () => {
    const dir = path.join(tempDir, "deep", "nested", "dir");
    const repo = new SettingsRepository(dir);
    repo.set("language", "zh");
    expect(fs.existsSync(path.join(dir, "zentree-settings.json"))).toBe(true);
  });

  it("falls back to defaults when the settings file is corrupt", () => {
    const dir = path.join(tempDir, "corrupt");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "zentree-settings.json"), "{ not json", "utf8");
    const repo = new SettingsRepository(dir);
    expect(repo.load()).toEqual({});
  });

  it("caches loaded settings within one instance", () => {
    const dir = path.join(tempDir, "cache");
    const repo = new SettingsRepository(dir);
    const first = repo.load();
    first.windowWidth = 1234;
    // cached object is reused, so the mutation is visible through get()
    expect(repo.get("windowWidth")).toBe(1234);
    expect(repo.load()).toBe(first);
  });
});

describe("SettingsRepository corruption hardening", () => {
  function writeSettings(dirName: string, content: string): { dir: string; file: string } {
    const dir = path.join(tempDir, dirName);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "zentree-settings.json");
    fs.writeFileSync(file, content, "utf8");
    return { dir, file };
  }

  it.each([
    ["null", "null"],
    ["array", "[]"],
    ["scalar", "\"text\""],
  ])("falls back to defaults for a structurally valid %s file", (_label, content) => {
    const { dir, file } = writeSettings(`shape-${_label}`, content);
    const repo = new SettingsRepository(dir);
    expect(repo.load()).toEqual({});
    expect(repo.get("gitPath")).toBeUndefined();
    expect(() => repo.set("language", "en")).not.toThrow();
    // The broken original is preserved for diagnostics.
    const backups = fs.readdirSync(dir).filter((f) => f.includes(".corrupt-"));
    expect(backups).toHaveLength(1);
    expect(fs.existsSync(file)).toBe(true);
  });

  it("drops/clamps invalid known keys instead of persisting them", () => {
    const { dir } = writeSettings("invalid-keys", JSON.stringify({
      windowWidth: "wide",
      windowHeight: 200,
      language: "fr",
      repos: [{ path: "/ok", name: "ok" }, { path: 42 }],
      tabs: ["/a", 7, null],
    }));
    const repo = new SettingsRepository(dir);
    const loaded = repo.load();
    expect(loaded.windowWidth).toBeUndefined();
    expect(loaded.windowHeight).toBeUndefined(); // below the 600px minimum
    expect(loaded.language).toBeUndefined();
    expect(loaded.repos).toEqual([{ path: "/ok", name: "ok" }]);
    expect(loaded.tabs).toEqual(["/a"]);
  });

  it("keeps valid values and unknown scalar keys", () => {
    const { dir } = writeSettings("valid-keys", JSON.stringify({
      windowWidth: 1500,
      windowHeight: 1000,
      themePreset: "claude-dark",
      language: "zh",
      customFlag: true,
    }));
    const repo = new SettingsRepository(dir);
    const loaded = repo.load();
    expect(loaded.windowWidth).toBe(1500);
    expect(loaded.windowHeight).toBe(1000);
    expect(loaded.themePreset).toBe("claude-dark");
    expect(loaded.language).toBe("zh");
    expect(loaded.customFlag).toBe(true);
  });
});

describe("SettingsRepository window bounds", () => {
  it("restores a minimum-size 900x600 window", () => {
    const dir = path.join(tempDir, "min-window");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "zentree-settings.json"), JSON.stringify({ windowWidth: 900, windowHeight: 600 }), "utf8");
    const repo = new SettingsRepository(dir);
    expect(repo.get("windowWidth")).toBe(900);
    expect(repo.get("windowHeight")).toBe(600);
  });

  it("drops values below the minimum window size", () => {
    const dir = path.join(tempDir, "tiny-window");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "zentree-settings.json"), JSON.stringify({ windowWidth: 800, windowHeight: 500 }), "utf8");
    const repo = new SettingsRepository(dir);
    expect(repo.get("windowWidth")).toBeUndefined();
    expect(repo.get("windowHeight")).toBeUndefined();
  });
});
