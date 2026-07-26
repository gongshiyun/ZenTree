# Internationalization

## Overview

ZenTree implements a lightweight, dependency-free i18n system supporting **English** and **Chinese** with real-time switching (no app restart required).

**Files:**
- `src/i18n/index.ts` — Runtime engine
- `src/i18n/en.ts` — English strings (~100 keys)
- `src/i18n/zh.ts` — Chinese strings (~100 keys)

## Architecture

```
┌─────────────────────────────────────────┐
│           i18n Module (index.ts)         │
│                                          │
│  _currentLocale: "en" | "zh"            │
│  _listeners: (() => void)[]             │
│                                          │
│  setGlobalLocale(locale)  → notify all  │
│  getGlobalLocale()        → current     │
│  t(key, ...args)          → translated  │
│  useT()                   → React hook  │
│  useLocale()              → [locale, set]│
└─────────────────────────────────────────┘
```

## Core Functions

### `t(key, ...args)`

Translates a key with positional interpolation:

```typescript
t("status.staging", "file.ts")
// en: "Staging file.ts..."
// zh: "正在暂存 file.ts..."
```

Interpolation uses `{0}`, `{1}`, etc. placeholders:
```typescript
// en.ts
"status.checkingOut": "Checking out {0}..."
// Usage
t("status.checkingOut", "main")  → "Checking out main..."
```

### `useT()` — React Hook

Returns the `t` function and subscribes the component to locale changes. When locale changes, all subscribed components re-render:

```typescript
const t = useT();
return <button>{t("topbar.fetch")}</button>;
```

Implementation uses a listener array + `useState` tick to force re-render.

### `useLocale()` — Locale Hook

Returns `[currentLocale, setLocale]` tuple:

```typescript
const [locale, setLocale] = useLocale();
setLocale("zh");  // Switches to Chinese + persists
```

### `setGlobalLocale(locale)`

Imperative locale switch (used outside React, e.g., in the store):

```typescript
setGlobalLocale("zh");
// Notifies all useT() subscribers
```

## Persistence

Language preference is saved via:
```typescript
window.gitAPI.setSetting("language", locale);
```

Restored on app startup in `App.tsx`:
```typescript
const s = await window.gitAPI.getSettings();
if (s?.language) useRepoStore.getState().setLanguage(s.language);
```

## Key Naming Convention

Keys follow a `namespace.action` pattern:

| Namespace | Examples |
|-----------|---------|
| `app.*` | Welcome screen text |
| `topbar.*` | Toolbar buttons and tooltips |
| `sidebar.*` | Branch panel labels |
| `files.*` | File panel actions |
| `commit.*` | Commit bar labels |
| `diff.*` | Diff viewer labels |
| `settings.*` | Settings dialog |
| `error.*` | Error messages |
| `status.*` | Loading/status messages |

## Adding a New Language

1. Create `src/i18n/<lang>.ts` with all keys:
```typescript
const ja: Record<string, string> = {
  "topbar.fetch": "フェッチ",
  // ...
};
export default ja;
```

2. Register in `src/i18n/index.ts`:
```typescript
import ja from "./ja";
const locales: Record<string, Record<string, string>> = { en, zh, ja };
```

3. Add option in `SettingsDialog.tsx` language selector.
