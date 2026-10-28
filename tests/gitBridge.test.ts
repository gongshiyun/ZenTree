import { describe, it, expect, afterEach } from "vitest";
import { gitApi } from "../src/infrastructure/gitBridge";

type GlobalWithWindow = { window?: unknown };

afterEach(() => {
  delete (globalThis as unknown as GlobalWithWindow).window;
});

describe("gitApi", () => {
  it("throws a descriptive error outside Electron", () => {
    expect(() => gitApi()).toThrowError(/Git bridge unavailable/);
  });

  it("throws when window exists but the preload bridge is missing", () => {
    (globalThis as unknown as GlobalWithWindow).window = {};
    expect(() => gitApi()).toThrowError(/run ZenTree inside Electron/);
  });

  it("returns the preload bridge when it is exposed", () => {
    const fakeApi = { status: async () => ({ success: true }) };
    (globalThis as unknown as GlobalWithWindow).window = { gitAPI: fakeApi };
    expect(gitApi()).toBe(fakeApi as unknown as ReturnType<typeof gitApi>);
  });
});
