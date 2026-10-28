import { describe, it, expect, afterEach } from "vitest";
import {
  DEFAULT_THEME,
  REQUIRED_THEME_KEYS,
  THEME_PRESETS,
  getThemePreset,
  applyTheme,
} from "../src/domain/theme/presets";

const HEX = /^#[0-9a-f]{6}$/i;

describe("THEME_PRESETS", () => {
  it("provides a non-empty set of uniquely named presets", () => {
    expect(THEME_PRESETS.length).toBeGreaterThan(0);
    const names = THEME_PRESETS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("defines every required palette token with a valid hex color", () => {
    for (const preset of THEME_PRESETS) {
      for (const key of REQUIRED_THEME_KEYS) {
        expect(preset.colors[key], `${preset.name} missing ${key}`).toBeDefined();
        expect(preset.colors[key], `${preset.name} ${key}`).toMatch(HEX);
      }
    }
  });

  it("includes the Claude theme family with both dark and light presets", () => {
    expect(THEME_PRESETS.some((p) => p.isDark)).toBe(true);
    expect(THEME_PRESETS.some((p) => !p.isDark)).toBe(true);
    expect(THEME_PRESETS.map((p) => p.name)).toEqual(
      expect.arrayContaining(["claude", "claude-dark", "claude-code", "claude-sand"]),
    );
  });

  it("exposes a default theme that exists and is light", () => {
    const preset = getThemePreset(DEFAULT_THEME);
    expect(preset).toBeDefined();
    expect(preset?.name).toBe(DEFAULT_THEME);
    expect(preset?.isDark).toBe(false);
  });

  it("keeps the primary button readable against its own background", () => {
    // A rough luminance check: the primary button text must not disappear into
    // its background (catches copy/paste palette mistakes across presets).
    const luminance = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const channel = (v: number) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
    };
    for (const preset of THEME_PRESETS) {
      const bg = luminance(preset.colors["--button-primary-bg"]);
      const fg = luminance(preset.colors["--button-primary-text"]);
      const ratio = (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05);
      expect(ratio, `${preset.name} primary button contrast`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("getThemePreset", () => {
  it("finds a preset by name", () => {
    expect(getThemePreset("claude-dark")?.label).toBe("Claude Dark");
  });

  it("returns undefined for unknown names", () => {
    expect(getThemePreset("no-such-theme")).toBeUndefined();
  });

  it("returns undefined for presets removed from the family", () => {
    expect(getThemePreset("dracula")).toBeUndefined();
  });
});

describe("applyTheme", () => {
  const originalDocument = (globalThis as { document?: unknown }).document;

  afterEach(() => {
    if (originalDocument === undefined) delete (globalThis as { document?: unknown }).document;
    else (globalThis as { document?: unknown }).document = originalDocument;
  });

  it("is a safe no-op when no DOM is available", () => {
    delete (globalThis as { document?: unknown }).document;
    expect(() => applyTheme(THEME_PRESETS[0])).not.toThrow();
  });

  it("writes CSS variables, data-theme and color-scheme on the document root", () => {
    const setProps: Record<string, string> = {};
    const attrs: Record<string, string> = {};
    const style: Record<string, unknown> = {
      setProperty: (k: string, v: string) => { setProps[k] = v; },
    };
    (globalThis as { document?: unknown }).document = {
      documentElement: {
        style,
        setAttribute: (k: string, v: string) => { attrs[k] = v; },
      },
    };

    const dark = THEME_PRESETS.find((p) => p.isDark)!;
    applyTheme(dark);
    expect(setProps["--bg-primary"]).toBe(dark.colors["--bg-primary"]);
    expect(attrs["data-theme"]).toBe("dark");
    expect(style.colorScheme).toBe("dark");

    const light = THEME_PRESETS.find((p) => !p.isDark)!;
    applyTheme(light);
    expect(attrs["data-theme"]).toBe("light");
    expect(style.colorScheme).toBe("light");
  });
});
