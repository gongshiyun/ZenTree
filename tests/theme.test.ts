import { describe, it, expect } from "vitest";
import { THEME_PRESETS, getThemePreset, applyTheme } from "../src/domain/theme/presets";

/** CSS custom properties every preset must define for the UI to render. */
const REQUIRED_KEYS = [
  "--bg-primary", "--bg-secondary", "--bg-tertiary", "--bg-hover", "--bg-active",
  "--border-color", "--text-primary", "--text-secondary", "--text-muted",
  "--text-inverse", "--accent", "--accent-hover",
  "--success", "--warning", "--danger", "--danger-hover",
];

const HEX = /^#[0-9a-f]{6}$/i;

describe("THEME_PRESETS", () => {
  it("provides a non-empty set of uniquely named presets", () => {
    expect(THEME_PRESETS.length).toBeGreaterThan(0);
    const names = THEME_PRESETS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("defines every required CSS variable with a valid hex color", () => {
    for (const preset of THEME_PRESETS) {
      for (const key of REQUIRED_KEYS) {
        expect(preset.colors[key], `${preset.name} missing ${key}`).toBeDefined();
        expect(preset.colors[key], `${preset.name} ${key}`).toMatch(HEX);
      }
    }
  });

  it("includes both dark and light presets", () => {
    expect(THEME_PRESETS.some((p) => p.isDark)).toBe(true);
    expect(THEME_PRESETS.some((p) => !p.isDark)).toBe(true);
  });
});

describe("getThemePreset", () => {
  it("finds a preset by name", () => {
    expect(getThemePreset("dracula")?.label).toBe("Dracula");
  });

  it("returns undefined for unknown names", () => {
    expect(getThemePreset("no-such-theme")).toBeUndefined();
  });
});

describe("applyTheme", () => {
  it("is a safe no-op when no DOM is available", () => {
    expect(() => applyTheme(THEME_PRESETS[0])).not.toThrow();
  });

  it("writes CSS variables and data-theme attribute on the document root", () => {
    const setProps: Record<string, string> = {};
    const attrs: Record<string, string> = {};
    const originalDocument = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = {
      documentElement: {
        style: { setProperty: (k: string, v: string) => { setProps[k] = v; } },
        setAttribute: (k: string, v: string) => { attrs[k] = v; },
      },
    };
    try {
      const dark = THEME_PRESETS.find((p) => p.isDark)!;
      applyTheme(dark);
      expect(setProps["--bg-primary"]).toBe(dark.colors["--bg-primary"]);
      expect(attrs["data-theme"]).toBe("dark");

      const light = THEME_PRESETS.find((p) => !p.isDark)!;
      applyTheme(light);
      expect(attrs["data-theme"]).toBe("light");
    } finally {
      if (originalDocument === undefined) delete (globalThis as { document?: unknown }).document;
      else (globalThis as { document?: unknown }).document = originalDocument;
    }
  });
});
