# Theming

## Overview

ZenTree uses a small design-token system: every colour, font, radius, shadow and layout metric is
a CSS custom property defined once in `src/theme.css`. Component styles in
`src/styles/{shell,panels,dialogs}.css` reference only those tokens, so a theme swap repaints the
whole app — DOM and canvas — without touching component code.

The app ships **4 presets** in the Claude visual family, defined in
`src/domain/theme/presets.ts`:

| Name | Label | Type | Notes |
|------|-------|------|-------|
| `claude` | Claude | Light (default) | Warm ivory paper, white cards, clay accent |
| `claude-dark` | Claude Dark | Dark | Warm charcoal surfaces (matches the Claude desktop app) |
| `claude-code` | Claude Code | Dark | Near-black terminal surfaces, higher-contrast mono content |
| `claude-sand` | Claude Sand | Light | Sandier paper, deeper clay accent |

`DEFAULT_THEME` is `claude`; a preset saved by an older build that no longer exists falls back to it.

## Tokens

`src/theme.css` defines the token contract. Presets only supply the palette tokens (all plain hex,
enforced by `tests/theme.test.ts`); everything translucent — hover fills, borders, focus rings,
diff tints, shadows — is derived with `color-mix()` so it adapts to every preset automatically.

| Group | Tokens |
|-------|--------|
| Surfaces | `--bg-primary` `--bg-secondary` `--bg-tertiary` `--bg-elevated` `--bg-input` `--bg-code` `--bg-hover` `--bg-active` |
| Lines | `--border-color` `--border-strong` `--separator` |
| Text | `--text-primary` `--text-secondary` `--text-muted` `--text-faint` `--text-inverse` |
| Accent | `--accent` `--accent-hover` `--accent-active` `--accent-strong` `--accent-contrast` `--accent-soft` `--accent-border` |
| Primary action | `--button-primary-bg` `--button-primary-bg-hover` `--button-primary-text` |
| Semantic | `--success` `--warning` `--danger` `--danger-hover` + `*-bg` / `*-border` |
| Diff & code | `--code-bg` `--diff-add-*` `--diff-del-*` `--diff-hunk-*` |
| Typography | `--font-sans` `--font-display` `--font-mono` `--text-xs…--text-display` |
| Geometry | `--radius-*` `--space-*` `--control-height*` `--topbar-height` `--tabbar-height` `--sidebar-width` |
| Elevation/motion | `--shadow-*` `--focus-ring` `--overlay` `--ease-out` `--dur*` |

## Application mechanism

`applyTheme(preset)` writes every palette token to `document.documentElement`, sets
`data-theme="dark|light"` (used for shadows/overlay defaults) and `color-scheme` so native
scrollbars/form controls match:

```ts
export function applyTheme(preset: ThemePreset): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(preset.colors)) root.style.setProperty(key, value);
  root.setAttribute("data-theme", preset.isDark ? "dark" : "light");
  root.style.colorScheme = preset.isDark ? "dark" : "light";
}
```

`src/domain/theme/presets.ts` also exports `REQUIRED_THEME_KEYS` (the palette keys every preset must
define); `tests/theme.test.ts` validates presence, hex format, light/dark coverage, unique names and
primary-button contrast.

## Persistence & toggling

`useRepoStore.setThemePreset(name)` applies the preset and persists it via
`gitAPI().setSetting("themePreset", name)`; `initFromSettings()` restores it on launch (normalising
retired preset names). The TopBar toggle switches between `claude` and `claude-dark`.

The main process reads the same preset name when it creates the window so the frameless window's
`backgroundColor` matches the theme before the renderer has painted.

## Canvas theme

`GraphRenderer` reads tokens from the computed style (`readCssVars`) instead of duplicating colours:
background, text tiers, accent, warning, and the `--font-sans` / `--font-mono` stacks. The branch
palette itself lives in `src/domain/graph/colors.ts` and is chosen to stay readable on both the cream
and the dark surfaces. Call `renderer.refresh()` after a theme or locale change (CommitGraph does this
via effects).

## Adding a theme

1. Add a `ThemePreset` to `THEME_PRESETS` in `src/domain/theme/presets.ts` with every key from
   `REQUIRED_THEME_KEYS` as a valid `#rrggbb` value.
2. Keep `--button-primary-text` readable on `--button-primary-bg` (the theme test enforces WCAG ≥ 4.5
   for that pair).
3. That is all: Settings → Appearance renders a preview card automatically and the palette flows into
   every surface, diff tint, menu and canvas.
