export interface ThemePreset {
  name: string;
  label: string;
  colors: Record<string, string>;
  isDark: boolean;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    name: "catppuccin-mocha", label: "Catppuccin Mocha", isDark: true,
    colors: {
      "--bg-primary": "#1a1b26", "--bg-secondary": "#1e1e2e", "--bg-tertiary": "#2a2a3c",
      "--bg-hover": "#313147", "--bg-active": "#3b3b54", "--border-color": "#2e2e42",
      "--text-primary": "#cdd6f4", "--text-secondary": "#a6adc8", "--text-muted": "#6c7086",
      "--text-inverse": "#1e1e2e", "--accent": "#89b4fa", "--accent-hover": "#74c7ec",
      "--success": "#a6e3a1", "--warning": "#f9e2af", "--danger": "#f38ba8", "--danger-hover": "#eba0ac",
    },
  },
  {
    name: "dracula", label: "Dracula", isDark: true,
    colors: {
      "--bg-primary": "#282a36", "--bg-secondary": "#21222c", "--bg-tertiary": "#343746",
      "--bg-hover": "#3c3e52", "--bg-active": "#44475a", "--border-color": "#3e3f55",
      "--text-primary": "#f8f8f2", "--text-secondary": "#cfcfc2", "--text-muted": "#6272a4",
      "--text-inverse": "#282a36", "--accent": "#bd93f9", "--accent-hover": "#ff79c6",
      "--success": "#50fa7b", "--warning": "#f1fa8c", "--danger": "#ff5555", "--danger-hover": "#ff6e67",
    },
  },
  {
    name: "nord", label: "Nord", isDark: true,
    colors: {
      "--bg-primary": "#2e3440", "--bg-secondary": "#3b4252", "--bg-tertiary": "#434c5e",
      "--bg-hover": "#4c566a", "--bg-active": "#545f73", "--border-color": "#434c5e",
      "--text-primary": "#eceff4", "--text-secondary": "#d8dee9", "--text-muted": "#81a1c1",
      "--text-inverse": "#2e3440", "--accent": "#88c0d0", "--accent-hover": "#8fbcbb",
      "--success": "#a3be8c", "--warning": "#ebcb8b", "--danger": "#bf616a", "--danger-hover": "#d06b74",
    },
  },
  {
    name: "one-dark", label: "One Dark Pro", isDark: true,
    colors: {
      "--bg-primary": "#1e2127", "--bg-secondary": "#21252b", "--bg-tertiary": "#2c313a",
      "--bg-hover": "#363b45", "--bg-active": "#404754", "--border-color": "#2c313a",
      "--text-primary": "#abb2bf", "--text-secondary": "#9ba5b3", "--text-muted": "#5c6370",
      "--text-inverse": "#1e2127", "--accent": "#61afef", "--accent-hover": "#56b6c2",
      "--success": "#98c379", "--warning": "#e5c07b", "--danger": "#e06c75", "--danger-hover": "#e3808a",
    },
  },
  {
    name: "tokyo-night", label: "Tokyo Night", isDark: true,
    colors: {
      "--bg-primary": "#1a1b26", "--bg-secondary": "#1f2335", "--bg-tertiary": "#292e42",
      "--bg-hover": "#343b55", "--bg-active": "#3b4261", "--border-color": "#292e42",
      "--text-primary": "#c0caf5", "--text-secondary": "#a9b1d6", "--text-muted": "#565f89",
      "--text-inverse": "#1a1b26", "--accent": "#7aa2f7", "--accent-hover": "#89b4fa",
      "--success": "#9ece6a", "--warning": "#e0af68", "--danger": "#f7768e", "--danger-hover": "#f88da0",
    },
  },
  {
    name: "monokai", label: "Monokai", isDark: true,
    colors: {
      "--bg-primary": "#1e1f1c", "--bg-secondary": "#272822", "--bg-tertiary": "#3e3d32",
      "--bg-hover": "#4c4b3e", "--bg-active": "#57564a", "--border-color": "#3e3d32",
      "--text-primary": "#f8f8f2", "--text-secondary": "#cfcfc2", "--text-muted": "#75715e",
      "--text-inverse": "#272822", "--accent": "#a6e22e", "--accent-hover": "#b6f23e",
      "--success": "#a6e22e", "--warning": "#e6db74", "--danger": "#f92672", "--danger-hover": "#fd3f83",
    },
  },
  {
    name: "github-dark", label: "GitHub Dark", isDark: true,
    colors: {
      "--bg-primary": "#0d1117", "--bg-secondary": "#161b22", "--bg-tertiary": "#21262d",
      "--bg-hover": "#2a313b", "--bg-active": "#30363d", "--border-color": "#30363d",
      "--text-primary": "#e6edf3", "--text-secondary": "#bdc4cc", "--text-muted": "#6e7681",
      "--text-inverse": "#0d1117", "--accent": "#58a6ff", "--accent-hover": "#79c0ff",
      "--success": "#3fb950", "--warning": "#d29922", "--danger": "#f85149", "--danger-hover": "#fd6a63",
    },
  },
  {
    name: "solarized-dark", label: "Solarized Dark", isDark: true,
    colors: {
      "--bg-primary": "#002b36", "--bg-secondary": "#073642", "--bg-tertiary": "#0a4958",
      "--bg-hover": "#115566", "--bg-active": "#196070", "--border-color": "#0a4958",
      "--text-primary": "#eee8d5", "--text-secondary": "#93a1a1", "--text-muted": "#586e75",
      "--text-inverse": "#002b36", "--accent": "#268bd2", "--accent-hover": "#379ee5",
      "--success": "#859900", "--warning": "#b58900", "--danger": "#dc322f", "--danger-hover": "#e64545",
    },
  },
  {
    name: "catppuccin-latte", label: "Catppuccin Latte", isDark: false,
    colors: {
      "--bg-primary": "#f5f5f5", "--bg-secondary": "#ffffff", "--bg-tertiary": "#e8e8e8",
      "--bg-hover": "#e0e0e0", "--bg-active": "#d0d0d0", "--border-color": "#d4d4d4",
      "--text-primary": "#1e1e2e", "--text-secondary": "#585b70", "--text-muted": "#9399b2",
      "--text-inverse": "#f5f5f5", "--accent": "#1e66f5", "--accent-hover": "#2e7af5",
      "--success": "#40a02b", "--warning": "#df8e1d", "--danger": "#d20f39", "--danger-hover": "#e64553",
    },
  },
  {
    name: "solarized-light", label: "Solarized Light", isDark: false,
    colors: {
      "--bg-primary": "#fdf6e3", "--bg-secondary": "#eee8d5", "--bg-tertiary": "#e0dcc3",
      "--bg-hover": "#d5cfb5", "--bg-active": "#cac4aa", "--border-color": "#d3ceb5",
      "--text-primary": "#002b36", "--text-secondary": "#586e75", "--text-muted": "#93a1a1",
      "--text-inverse": "#fdf6e3", "--accent": "#268bd2", "--accent-hover": "#2a94e0",
      "--success": "#859900", "--warning": "#b58900", "--danger": "#dc322f", "--danger-hover": "#e64545",
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
}
