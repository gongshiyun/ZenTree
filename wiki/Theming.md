# Theming

## Overview

ZenTree supports **10 color themes** (8 dark + 2 light) implemented via CSS custom properties. Themes are defined as presets in `src/domain/theme/presets.ts` and applied at runtime by setting variables on `document.documentElement`.

## Theme Presets

| Name | Label | Type |
|------|-------|------|
| `catppuccin-mocha` | Catppuccin Mocha | Dark (default) |
| `dracula` | Dracula | Dark |
| `nord` | Nord | Dark |
| `one-dark` | One Dark Pro | Dark |
| `tokyo-night` | Tokyo Night | Dark |
| `monokai` | Monokai | Dark |
| `github-dark` | GitHub Dark | Dark |
| `solarized-dark` | Solarized Dark | Dark |
| `catppuccin-latte` | Catppuccin Latte | Light |
| `solarized-light` | Solarized Light | Light |

## CSS Variables

Each theme defines these custom properties:

| Variable | Purpose | Example (Catppuccin Mocha) |
|----------|---------|---------------------------|
| `--bg-primary` | Main background | `#1a1b26` |
| `--bg-secondary` | Panel/card background | `#1e1e2e` |
| `--bg-tertiary` | Nested surfaces | `#2a2a3c` |
| `--bg-hover` | Hover state | `#313147` |
| `--bg-active` | Active/pressed state | `#3b3b54` |
| `--border-color` | Borders and dividers | `#2e2e42` |
| `--text-primary` | Main text | `#cdd6f4` |
| `--text-secondary` | Secondary text | `#a6adc8` |
| `--text-muted` | Muted/hint text | `#6c7086` |
| `--text-inverse` | Text on accent backgrounds | `#1e1e2e` |
| `--accent` | Primary accent | `#89b4fa` |
| `--accent-hover` | Accent hover | `#74c7ec` |
| `--success` | Success/added | `#a6e3a1` |
| `--warning` | Warning/modified | `#f9e2af` |
| `--danger` | Danger/deleted | `#f38ba8` |
| `--danger-hover` | Danger hover | `#eba0ac` |

## Application Mechanism

```typescript
function applyTheme(preset: ThemePreset) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(preset.colors)) {
    root.style.setProperty(key, value);
  }
  root.setAttribute("data-theme", preset.isDark ? "dark" : "light");
}
```

The `data-theme` attribute enables theme-conditional CSS selectors:

```css
[data-theme="light"] .some-element { ... }
```

## Persistence

Theme selection is saved via `window.gitAPI.setSetting("themePreset", name)` to `zentree-settings.json` and restored on app startup in `SettingsDialog`'s `useEffect`.

## Quick Toggle

The TopBar provides a one-click toggle between dark and light:
- Dark → switches to `catppuccin-latte`
- Light → switches to `catppuccin-mocha`

## Canvas Theme

The `GraphRenderer` has a separate `setTheme("dark" | "light")` method that adjusts canvas-specific colors (background fill, node outlines, text colors) independently from CSS variables.

## Adding a New Theme

1. Add a `ThemePreset` object to the `THEME_PRESETS` array in `repoStore.ts`:

```typescript
{
  name: "my-theme",
  label: "My Theme",
  isDark: true,
  colors: {
    "--bg-primary": "#...",
    "--bg-secondary": "#...",
    // ... all 16 variables
  },
}
```

2. The theme automatically appears in the Settings → Appearance grid.
