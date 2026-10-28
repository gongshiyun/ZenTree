export interface ThemePreset {
  name: string;
  label: string;
  colors: Record<string, string>;
  isDark: boolean;
}

/**
 * The palette tokens every preset must define. These are plain hex colors so a
 * preset can be validated mechanically; translucent tokens are derived from
 * them in theme.css with color-mix().
 */
export const REQUIRED_THEME_KEYS = [
  "--bg-primary", "--bg-secondary", "--bg-tertiary", "--bg-elevated",
  "--bg-input", "--bg-code", "--bg-hover", "--bg-active",
  "--border-color", "--border-strong",
  "--text-primary", "--text-secondary", "--text-muted", "--text-faint", "--text-inverse",
  "--accent", "--accent-hover", "--accent-active", "--accent-strong", "--accent-contrast",
  "--button-primary-bg", "--button-primary-bg-hover", "--button-primary-text",
  "--success", "--warning", "--danger", "--danger-hover",
  "--diff-add-bg", "--diff-add-border", "--diff-add-text",
  "--diff-del-bg", "--diff-del-border", "--diff-del-text",
  "--diff-hunk-bg", "--diff-hunk-text", "--overlay-tint",
] as const;

/** Theme used on first launch and whenever a saved preset no longer exists. */
export const DEFAULT_THEME = "claude";

/**
 * The ZenTree theme family.
 *
 * The visual language stays the same across presets (warm paper surfaces,
 * hairline borders, clay accent, serif display type); presets only change the
 * palette. `claude` and `claude-dark` mirror the Claude desktop app, while
 * `claude-code` leans into the darker terminal look of Claude Code.
 */
export const THEME_PRESETS: ThemePreset[] = [
  {
    name: "claude",
    label: "Claude",
    isDark: false,
    colors: {
      "--bg-primary": "#faf9f5", "--bg-secondary": "#ffffff", "--bg-tertiary": "#f1efe8",
      "--bg-elevated": "#ffffff", "--bg-input": "#ffffff", "--bg-code": "#fbfaf6",
      "--bg-hover": "#edeae2", "--bg-active": "#e5e1d7",
      "--border-color": "#e6e2d9", "--border-strong": "#d5d0c3",
      "--text-primary": "#1f1e1d", "--text-secondary": "#57544e", "--text-muted": "#8c877c",
      "--text-faint": "#ada79b", "--text-inverse": "#faf9f5",
      "--accent": "#d97757", "--accent-hover": "#c15f3c", "--accent-active": "#a94e2e",
      "--accent-strong": "#b4532f", "--accent-contrast": "#ffffff",
      "--button-primary-bg": "#b4532f", "--button-primary-bg-hover": "#9d4526",
      "--button-primary-text": "#ffffff",
      "--success": "#3f7d5a", "--warning": "#a9762a", "--danger": "#b4483c", "--danger-hover": "#9c3a30",
      "--diff-add-bg": "#eaf3ec", "--diff-add-border": "#cfe5d6", "--diff-add-text": "#2f6b4a",
      "--diff-del-bg": "#fbeae6", "--diff-del-border": "#f0d2ca", "--diff-del-text": "#a5402f",
      "--diff-hunk-bg": "#f3f0e8", "--diff-hunk-text": "#6b675e",
      "--overlay-tint": "#1f1e1d",
    },
  },
  {
    name: "claude-dark",
    label: "Claude Dark",
    isDark: true,
    colors: {
      "--bg-primary": "#262624", "--bg-secondary": "#30302e", "--bg-tertiary": "#1f1e1d",
      "--bg-elevated": "#35342f", "--bg-input": "#2c2b28", "--bg-code": "#232220",
      "--bg-hover": "#3a3936", "--bg-active": "#47453f",
      "--border-color": "#3e3d38", "--border-strong": "#4c4a43",
      "--text-primary": "#f5f4ef", "--text-secondary": "#c7c3b9", "--text-muted": "#938e84",
      "--text-faint": "#6f6b63", "--text-inverse": "#262624",
      "--accent": "#d97757", "--accent-hover": "#e58c6d", "--accent-active": "#c96443",
      "--accent-strong": "#e08a6b", "--accent-contrast": "#1f1e1d",
      "--button-primary-bg": "#d97757", "--button-primary-bg-hover": "#e58c6d",
      "--button-primary-text": "#262624",
      "--success": "#7fb58a", "--warning": "#d6b36a", "--danger": "#e07b6b", "--danger-hover": "#e99588",
      "--diff-add-bg": "#24322a", "--diff-add-border": "#355041", "--diff-add-text": "#9fd3ae",
      "--diff-del-bg": "#3a2622", "--diff-del-border": "#58362f", "--diff-del-text": "#f0a79a",
      "--diff-hunk-bg": "#2b2a27", "--diff-hunk-text": "#a8a39a",
      "--overlay-tint": "#000000",
    },
  },
  {
    name: "claude-code",
    label: "Claude Code",
    isDark: true,
    colors: {
      "--bg-primary": "#141413", "--bg-secondary": "#1c1b19", "--bg-tertiary": "#0f0f0e",
      "--bg-elevated": "#232220", "--bg-input": "#1a1917", "--bg-code": "#101010",
      "--bg-hover": "#262521", "--bg-active": "#302e29",
      "--border-color": "#2e2d29", "--border-strong": "#3c3a34",
      "--text-primary": "#edebe5", "--text-secondary": "#b8b4ab", "--text-muted": "#85817a",
      "--text-faint": "#625f58", "--text-inverse": "#141413",
      "--accent": "#d97757", "--accent-hover": "#e8956f", "--accent-active": "#c4552f",
      "--accent-strong": "#e08a6b", "--accent-contrast": "#141413",
      "--button-primary-bg": "#d97757", "--button-primary-bg-hover": "#e8956f",
      "--button-primary-text": "#141413",
      "--success": "#86c08c", "--warning": "#ddb25f", "--danger": "#e5786b", "--danger-hover": "#f09083",
      "--diff-add-bg": "#16281c", "--diff-add-border": "#2c4a35", "--diff-add-text": "#92d3a0",
      "--diff-del-bg": "#2d1915", "--diff-del-border": "#4c2820", "--diff-del-text": "#f0a08f",
      "--diff-hunk-bg": "#1e1d1a", "--diff-hunk-text": "#9c978d",
      "--overlay-tint": "#000000",
    },
  },
  {
    name: "claude-sand",
    label: "Claude Sand",
    isDark: false,
    colors: {
      "--bg-primary": "#f6f1e7", "--bg-secondary": "#fffdf8", "--bg-tertiary": "#ede6d8",
      "--bg-elevated": "#fffdf8", "--bg-input": "#fffdf8", "--bg-code": "#faf6ec",
      "--bg-hover": "#e7e0d1", "--bg-active": "#ded6c5",
      "--border-color": "#e2daca", "--border-strong": "#cfc5b0",
      "--text-primary": "#201e1a", "--text-secondary": "#5a554a", "--text-muted": "#8e8778",
      "--text-faint": "#b0a896", "--text-inverse": "#f6f1e7",
      "--accent": "#c96b45", "--accent-hover": "#b25834", "--accent-active": "#994b2c",
      "--accent-strong": "#a64f2b", "--accent-contrast": "#ffffff",
      "--button-primary-bg": "#a64f2b", "--button-primary-bg-hover": "#8f4223",
      "--button-primary-text": "#ffffff",
      "--success": "#456f50", "--warning": "#9c7429", "--danger": "#a94a3c", "--danger-hover": "#913d31",
      "--diff-add-bg": "#ebf1e5", "--diff-add-border": "#d3e1c9", "--diff-add-text": "#33603f",
      "--diff-del-bg": "#f8e9e2", "--diff-del-border": "#edd1c6", "--diff-del-text": "#9b3e2c",
      "--diff-hunk-bg": "#f0e9db", "--diff-hunk-text": "#6e675a",
      "--overlay-tint": "#201e1a",
    },
  },
];

export function getThemePreset(name: string): ThemePreset | undefined {
  return THEME_PRESETS.find((p) => p.name === name);
}

/** Apply a theme preset to the document root as CSS custom properties. */
export function applyTheme(preset: ThemePreset): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(preset.colors)) {
    root.style.setProperty(key, value);
  }
  root.setAttribute("data-theme", preset.isDark ? "dark" : "light");
  // Keep native form controls / scrollbars in the same colour scheme.
  root.style.colorScheme = preset.isDark ? "dark" : "light";
}
