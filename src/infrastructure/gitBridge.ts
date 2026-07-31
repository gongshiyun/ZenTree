import type { GitAPI } from "../types";

/**
 * Infrastructure gateway: the single application-side entry point to the
 * Electron IPC bridge exposed by the preload script.
 */
export function gitApi(): GitAPI {
  if (typeof window === "undefined" || !window.gitAPI) {
    throw new Error("Git bridge unavailable: run ZenTree inside Electron");
  }
  return window.gitAPI;
}
