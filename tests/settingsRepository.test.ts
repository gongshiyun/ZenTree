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
