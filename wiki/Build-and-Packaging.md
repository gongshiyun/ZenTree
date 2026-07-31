# Build and Packaging

## Build Pipeline

```
npm run build
    ├── tsc -p tsconfig.main.json    → dist-electron/electron/main.js + preload.js
    └── vite build                   → dist/ (bundled renderer)

npm run pack
    ├── npm run build                → (above)
    └── electron-builder             → release/ (installers)
```

## Output Artifacts

### Windows (`npm run pack`)

| Target | File | Description |
|--------|------|-------------|
| NSIS | `release/ZenTree Setup x.x.x.exe` | Installer with shortcuts |
| Portable | `release/ZenTree x.x.x.exe` | Single-file, no install |
| Unpacked | `release/win-unpacked/ZenTree.exe` | Directory output |

### Linux (`npm run pack:linux`)

| Target | File | Description |
|--------|------|-------------|
| AppImage | `release/ZenTree-x.x.x.AppImage` | Portable executable |
| deb | `release/zentree_x.x.x_amd64.deb` | Debian package |

### macOS (via `pack:all`)

| Target | File | Description |
|--------|------|-------------|
| DMG | `release/ZenTree-x.x.x.dmg` | Disk image |
| ZIP | `release/ZenTree-x.x.x-mac.zip` | Archive |

## electron-builder Configuration

Defined in `package.json` under the `"build"` key:

```json
{
  "appId": "com.zentree.app",
  "productName": "ZenTree",
  "directories": { "output": "release" },
  "files": ["dist/**/*", "dist-electron/**/*"],
  "win": {
    "target": [
      { "target": "nsis", "arch": ["x64"] },
      { "target": "portable", "arch": ["x64"] }
    ]
  },
  "nsis": {
    "oneClick": false,
    "perMachine": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true,
    "shortcutName": "ZenTree"
  }
}
```

## NSIS Installer Features

- User chooses install directory
- Per-user installation (no admin required)
- Desktop + Start Menu shortcuts
- Proper uninstaller with cleanup

## Vite Build Details

- **Entry:** `index.html` → `src/main.tsx`
- **Output:** `dist/` with hashed asset filenames
- **Base:** `./` (relative paths for `file://` protocol in Electron)
- **Plugins:** `@vitejs/plugin-react` (Fast Refresh, JSX transform)

## TypeScript Compilation

| Config | Target | Module | Output |
|--------|--------|--------|--------|
| `tsconfig.main.json` | ES2020 | CommonJS | `dist-electron/` |
| `tsconfig.json` | ES2020 | ESNext | N/A (Vite handles) |

The main process compiles to CommonJS because Electron's main process uses Node.js `require()`.

## Development vs Production

| Aspect | Development | Production |
|--------|-------------|-----------|
| Renderer source | `http://localhost:5173` | `dist/index.html` |
| DevTools | Auto-opened | Hidden |
| HMR | Active | N/A |
| Detection | `--dev` flag or `NODE_ENV=development` | Default |

## Dependencies (Runtime)

| Package | Version | Purpose |
|---------|---------|---------|
| `electron` | 36.3.1 | Desktop shell |
| `simple-git` | ^3.27.0 | Git CLI wrapper |
| `zustand` | ^5.0.3 | State management |
| `react` | ^18.3.1 | UI framework |
| `react-dom` | ^18.3.1 | DOM rendering |

## System Requirements

- **Windows:** Windows 10+ (x64)
- **Git:** Must be installed and accessible (via PATH or custom path in Settings)
- **Linux:** glibc-based distros (x64)
- **macOS:** 10.15+ (x64 / arm64)
