import { describe, it, expect, afterEach } from "vitest";
import { t, getGlobalLocale, setGlobalLocale } from "../src/i18n";
import en from "../src/i18n/en";
import zh from "../src/i18n/zh";

afterEach(() => setGlobalLocale("en"));

describe("t()", () => {
  it("resolves keys from the english dictionary by default", () => {
    expect(getGlobalLocale()).toBe("en");
    expect(t("topbar.fetch")).toBe(en["topbar.fetch"]);
  });

  it("falls back to the key itself for missing translations", () => {
    expect(t("does.not.exist")).toBe("does.not.exist");
  });

  it("interpolates positional arguments", () => {
    // "status.discarding": "Discarding {0}..."
    expect(t("status.discarding", "file.txt")).toBe(`Discarding file.txt...`);
  });

  it("switches dictionaries when the locale changes", () => {
    setGlobalLocale("zh");
    expect(getGlobalLocale()).toBe("zh");
    expect(t("topbar.settings")).toBe(zh["topbar.settings"]);
    expect(t("topbar.settings")).not.toBe(en["topbar.settings"]);
  });
});

describe("locale dictionaries", () => {
  const enKeys = Object.keys(en).sort();
  const zhKeys = Object.keys(zh).sort();

  it("have identical key sets for en and zh", () => {
    expect(zhKeys).toEqual(enKeys);
  });

  it("keep placeholder counts consistent across languages", () => {
    for (const key of enKeys) {
      const enPh = (en[key].match(/{\d}/g) ?? []).length;
      const zhPh = (zh[key].match(/{\d}/g) ?? []).length;
      expect(zhPh, `placeholder mismatch in "${key}"`).toBe(enPh);
    }
  });

  it("never use empty translation values", () => {
    for (const key of enKeys) {
      expect(en[key].trim(), `en "${key}" empty`).not.toBe("");
      expect(zh[key].trim(), `zh "${key}" empty`).not.toBe("");
    }
  });
});
