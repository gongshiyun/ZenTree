import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import * as path from "path";
import * as childProcess from "child_process";
import * as os from "os";
import simpleGit, { SimpleGit } from "simple-git";
import * as fs from "fs";

let mainWindow: BrowserWindow | null = null;

// --- Settings storage (in-memory cache + disk persistence) ---
const settingsPath = path.join(app.getPath("userData"), "zentree-settings.json");
let settingsCache: Record<string, any> | null = null;

function loadSettings(): Record<string, any> {
  if (settingsCache) return settingsCache;
  try {
    if (fs.existsSync(settingsPath)) {
      settingsCache = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      return settingsCache!;
    }
  } catch { /* ignore */ }
  settingsCache = {};
  return settingsCache;
}

function saveSettings(settings: Record<string, any>): void {
  settingsCache = settings;
  try {
    const dir = path.dirname(settingsPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  } catch { /* ignore */ }
}

function createWindow() {
  const settings = loadSettings();

  mainWindow = new BrowserWindow({
    width: settings.windowWidth || 1400,
    height: settings.windowHeight || 900,
    minWidth: 900,
    minHeight: 600,
    title: "ZenTree",
    backgroundColor: "#1a1b26",
    frame: false,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  mainWindow.on("resize", () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (mainWindow) {
        const s = loadSettings();
        const bounds = mainWindow.getBounds();
        s.windowWidth = bounds.width;
        s.windowHeight = bounds.height;
        saveSettings(s);
      }
    }, 300);
  });

  if (process.env.NODE_ENV === "development" || process.argv.includes("--dev")) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- Window Control IPC ---
ipcMain.handle("window:minimize", () => mainWindow?.minimize());
ipcMain.handle("window:maximize", () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.handle("window:close", () => mainWindow?.close());
ipcMain.handle("window:is-maximized", () => mainWindow?.isMaximized() ?? false);

// --- Settings IPC ---
ipcMain.handle("settings:get", () => loadSettings());

ipcMain.handle("settings:set", (_event, key: string, value: any) => {
  const settings = loadSettings();
  settings[key] = value;
  saveSettings(settings);
  return { success: true };
});

ipcMain.handle("settings:get-all", () => loadSettings());

// --- Git IPC Handlers ---

function getGit(repoPath: string): SimpleGit {
  const settings = loadSettings();
  const gitPath = settings.gitPath || "git";
  return simpleGit({ baseDir: repoPath, binary: gitPath });
}

function validateRepo(repoPath: string): string | null {
  if (!repoPath || !fs.existsSync(repoPath)) return "Path does not exist";
  const gitDir = path.join(repoPath, ".git");
  if (!fs.existsSync(gitDir)) return "Not a valid Git repository (no .git directory)";
  return null;
}

function safeHandler<T>(fn: (...args: any[]) => Promise<T>) {
  return async (_event: any, ...args: any[]) => {
    try {
      const result = await fn(...args);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  };
}

// Check if path is a valid Git repo
ipcMain.handle("git:is-repo", safeHandler(async (repoPath: string) => {
  const err = validateRepo(repoPath);
  if (err) return false;
  return await getGit(repoPath).checkIsRepo();
}));

// Get all branches
ipcMain.handle("git:branches", safeHandler(async (repoPath: string) => {
  const git = getGit(repoPath);
  const result = await git.branch(["-a"]);
  return { all: result.all, current: result.current, branches: result.branches };
}));

// Get commit log with pagination (skip + maxCount)
ipcMain.handle("git:log", safeHandler(async (repoPath: string, skip?: number, maxCount?: number) => {
  const git = getGit(repoPath);
  const SEP = "|||ZENTREE|||";
  const args = ["log", `--format=%H${SEP}%P${SEP}%an${SEP}%ae${SEP}%at${SEP}%s`];
  if (skip) args.push(`--skip=${skip}`);
  if (maxCount) args.push(`--max-count=${maxCount}`);
  const result = await git.raw(args);
  return result.split("\n").filter(Boolean).map((line: string) => {
    const parts: string[] = [];
    let remaining = line;
    for (let i = 0; i < 5; i++) {
      const sepIdx = remaining.indexOf(SEP);
      parts.push(remaining.substring(0, sepIdx));
      remaining = remaining.substring(sepIdx + SEP.length);
    }
    parts.push(remaining);
    const [hash, parents, author, email, date, subject] = parts;
    return {
      hash, shortHash: hash.substring(0, 7),
      parents: parents ? parents.split(" ") : [],
      author, email,
      timestamp: parseInt(date, 10), subject, body: '',
    };
  });
}));

// Get status
ipcMain.handle("git:status", safeHandler(async (repoPath: string) => {
  const git = getGit(repoPath);
  const status = await git.status();
  return {
    staged: status.staged, modified: status.modified, created: status.created,
    deleted: status.deleted, renamed: status.renamed, not_added: status.not_added,
    conflicted: status.conflicted, files: status.files, current: status.current,
  };
}));

// Show files changed in a commit
ipcMain.handle("git:show", safeHandler(async (repoPath: string, hash: string) => {
  const git = getGit(repoPath);
  const result = await git.show([hash, "--name-only", "--format=%H|%an|%ae|%at|%s"]);
  const lines = result.split("\n").filter(Boolean);
  const headerParts = lines[0].split("|");
  return { hash: headerParts[0], author: headerParts[1], email: headerParts[2],
    timestamp: parseInt(headerParts[3], 10), subject: headerParts[4], files: lines.slice(1) };
}));

// Show full commit detail
ipcMain.handle("git:show-detail", safeHandler(async (repoPath: string, hash: string) => {
  return await getGit(repoPath).show([hash, "--stat", "--format=fuller"]);
}));

// Get last commit message
ipcMain.handle("git:last-message", safeHandler(async (repoPath: string) => {
  return (await getGit(repoPath).raw(["log", "-1", "--format=%B"])).trim();
}));

// Get diff for a file (unstaged or staged)
ipcMain.handle("git:diff-file", safeHandler(async (repoPath: string, filePath: string, staged: boolean) => {
  const git = getGit(repoPath);
  const args = staged ? ["diff", "--cached", "--", filePath] : ["diff", "--", filePath];
  return await git.raw(args);
}));

// Stage a hunk: apply patch to index
ipcMain.handle("git:stage-hunk", safeHandler(async (repoPath: string, patchContent: string) => {
  const git = getGit(repoPath);
  const tmpFile = path.join(os.tmpdir(), `zentree-stage-${Date.now()}.patch`);
  fs.writeFileSync(tmpFile, patchContent, "utf8");
  try {
    await git.raw(["apply", "--cached", tmpFile]);
    return true;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}));

// Unstage a hunk: reverse apply to index
ipcMain.handle("git:unstage-hunk", safeHandler(async (repoPath: string, patchContent: string) => {
  const git = getGit(repoPath);
  const tmpFile = path.join(os.tmpdir(), `zentree-unstage-${Date.now()}.patch`);
  fs.writeFileSync(tmpFile, patchContent, "utf8");
  try {
    await git.raw(["apply", "--cached", "--reverse", tmpFile]);
    return true;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}));

// Revert a hunk in working dir
ipcMain.handle("git:revert-hunk", safeHandler(async (repoPath: string, patchContent: string) => {
  const git = getGit(repoPath);
  const tmpFile = path.join(os.tmpdir(), `zentree-revert-${Date.now()}.patch`);
  fs.writeFileSync(tmpFile, patchContent, "utf8");
  try {
    await git.raw(["apply", "--reverse", tmpFile]);
    return true;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}));

// Get git config values
ipcMain.handle("git:get-config", safeHandler(async (repoPath: string) => {
  const git = getGit(repoPath);
  const name = (await git.raw(["config", "user.name"])).trim();
  const email = (await git.raw(["config", "user.email"])).trim();
  return { userName: name, userEmail: email };
}));

// Set git config values
ipcMain.handle("git:set-config", safeHandler(async (repoPath: string, key: string, value: string) => {
  await getGit(repoPath).raw(["config", key, value]);
  return true;
}));


// Get diff for a file in a specific commit
ipcMain.handle("git:commit-file-diff", safeHandler(async (repoPath: string, hash: string, filePath: string) => {
  return await getGit(repoPath).raw(["show", "--format=", hash, "--", filePath]);
}));// Stage file
ipcMain.handle("git:stage", safeHandler(async (repoPath: string, files: string[]) => {
  return await getGit(repoPath).add(files);
}));

// Unstage file
ipcMain.handle("git:unstage", safeHandler(async (repoPath: string, files: string[]) => {
  return await getGit(repoPath).reset(["HEAD", ...files]);
}));

// Discard changes
ipcMain.handle("git:discard", safeHandler(async (repoPath: string, files: string[]) => {
  return await getGit(repoPath).checkout(files);
}));

// Commit
ipcMain.handle("git:commit", safeHandler(async (repoPath: string, message: string, amend: boolean) => {
  const git = getGit(repoPath);
  if (amend) {
    return message
      ? await git.raw(["commit", "--amend", "-m", message])
      : await git.raw(["commit", "--amend", "--no-edit"]);
  }
  return await git.commit(message);
}));

// Checkout branch
ipcMain.handle("git:checkout", safeHandler(async (repoPath: string, branch: string) => {
  return await getGit(repoPath).checkout(branch);
}));

// Checkout remote branch (create local tracking branch)
ipcMain.handle("git:checkout-remote", safeHandler(async (repoPath: string, remoteBranch: string) => {
  const git = getGit(repoPath);
  const localName = remoteBranch.replace(/^remotes\/[^/]+\//, "");
  return await git.raw(["checkout", "--track", remoteBranch]);
}));

// Create branch
ipcMain.handle("git:create-branch", safeHandler(async (repoPath: string, branchName: string, checkout: boolean) => {
  const git = getGit(repoPath);
  if (checkout) {
    return await git.checkoutLocalBranch(branchName);
  }
  return await git.branch([branchName]);
}));

// Delete branch
ipcMain.handle("git:delete-branch", safeHandler(async (repoPath: string, branchName: string, force: boolean) => {
  const git = getGit(repoPath);
  return await git.deleteLocalBranch(branchName, force);
}));

// Merge branch into current
ipcMain.handle("git:merge", safeHandler(async (repoPath: string, branchName: string) => {
  const git = getGit(repoPath);
  return await git.merge([branchName]);
}));

// Reset to commit (soft/mixed/hard)
ipcMain.handle("git:reset", safeHandler(async (repoPath: string, commitHash: string, mode: "soft" | "mixed" | "hard") => {
  const git = getGit(repoPath);
  return await git.reset([`--${mode}`, commitHash]);
}));

// Stash save
ipcMain.handle("git:stash-save", safeHandler(async (repoPath: string, message?: string) => {
  const git = getGit(repoPath);
  const args = ["stash", "push"];
  if (message) args.push("-m", message);
  return await git.raw(args);
}));

// Stash list
ipcMain.handle("git:stash-list", safeHandler(async (repoPath: string) => {
  const git = getGit(repoPath);
  const result = await git.raw(["stash", "list", "--format=%gd|||%s"]);
  return result.split("\n").filter(Boolean).map((line: string) => {
    const [ref, subject] = line.split("|||");
    return { ref, subject };
  });
}));

// Stash pop
ipcMain.handle("git:stash-pop", safeHandler(async (repoPath: string, ref?: string) => {
  const git = getGit(repoPath);
  const args = ["stash", "pop"];
  if (ref) args.push(ref);
  return await git.raw(args);
}));

// Stash drop
ipcMain.handle("git:stash-drop", safeHandler(async (repoPath: string, ref: string) => {
  const git = getGit(repoPath);
  return await git.raw(["stash", "drop", ref]);
}));

// Fetch
ipcMain.handle("git:fetch", safeHandler(async (repoPath: string) => {
  return await getGit(repoPath).fetch();
}));

// Pull
ipcMain.handle("git:pull", safeHandler(async (repoPath: string) => {
  return await getGit(repoPath).pull();
}));

// Push
ipcMain.handle("git:push", safeHandler(async (repoPath: string) => {
  return await getGit(repoPath).push();
}));

// Open Git Bash in repo directory (4-tier auto-discovery)
ipcMain.handle("shell:open-git-bash", safeHandler(async (repoPath: string) => {
  const settings = loadSettings();
  let bashPath = "";

  // Tier 1: Derive from user-configured git path
  if (settings.gitPath && settings.gitPath !== "git") {
    const gitExe = path.resolve(settings.gitPath);
    const candidates = [
      gitExe.replace(/\\bin\\git\.exe$/i, "\\git-bash.exe"),
      gitExe.replace(/\\cmd\\git\.exe$/i, "\\..\\git-bash.exe"),
      path.join(path.dirname(gitExe), "..", "git-bash.exe"),
    ];
    for (const c of candidates) {
      if (fs.existsSync(path.normalize(c))) { bashPath = path.normalize(c); break; }
    }
  }

  // Tier 2: Hardcoded paths + env vars
  if (!bashPath) {
    const hardPaths = [
      "C:\\Program Files\\Git\\git-bash.exe",
      "C:\\Program Files (x86)\\Git\\git-bash.exe",
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Git", "git-bash.exe"),
      path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "git-bash.exe"),
      path.join(process.env.ProgramW6432 || "C:\\Program Files", "Git", "git-bash.exe"),
    ];
    for (const p of hardPaths) { if (fs.existsSync(p)) { bashPath = p; break; } }
  }

  // Tier 3: git --exec-path (uses configured git binary)
  if (!bashPath) {
    const gitBin = settings.gitPath && settings.gitPath !== "git" ? settings.gitPath : "git";
    try {
      const gitDir = childProcess.execSync(`"${gitBin}" --exec-path`, { encoding: "utf8" }).trim();
      for (const rel of ["..\\..\\..\\git-bash.exe", "..\\..\\git-bash.exe", "..\\git-bash.exe"]) {
        const candidate = path.join(gitDir, rel);
        if (fs.existsSync(path.normalize(candidate))) { bashPath = path.normalize(candidate); break; }
      }
    } catch { /* ignore */ }
  }

  // Tier 4: Scan Program Files for Git
  if (!bashPath) {
    try {
      for (const pf of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(Boolean) as string[]) {
        const candidate = path.join(pf, "Git", "git-bash.exe");
        if (fs.existsSync(candidate)) { bashPath = candidate; break; }
      }
    } catch { /* ignore */ }
  }

  if (!bashPath) {
    throw new Error("Git Bash not found. Please install Git for Windows, or set Git path in Settings > General.");
  }
  childProcess.execFile(bashPath, [], { cwd: repoPath });
  return "Git Bash opened";
}));
// Open directory dialog
ipcMain.handle("dialog:open-directory", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});
