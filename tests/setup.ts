/**
 * Vitest global setup: isolate every test run from the developer machine's git
 * configuration. Without this, a local `commit.gpgsign`, `core.hooksPath` or a
 * missing global identity silently changes results between machines.
 *
 * Each test still sets its own local `user.name`/`user.email`; this config only
 * provides a hermetic baseline (and the `main` default branch).
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const gitHome = fs.mkdtempSync(path.join(os.tmpdir(), "zentree-git-home-"));
const gitConfig = path.join(gitHome, ".gitconfig");

fs.writeFileSync(
  gitConfig,
  [
    "[user]",
    "\tname = ZenTree Test",
    "\temail = test@zentree.local",
    "[init]",
    "\tdefaultBranch = main",
    "[core]",
    "\tautocrlf = false",
    "\tfilemode = false",
    "[commit]",
    "\tgpgsign = false",
    "[stash]",
    "\tshowPatch = false",
    "",
  ].join("\n"),
  "utf8",
);

process.env.HOME = gitHome;
// Git for Windows falls back to USERPROFILE when HOME is absent; keep both in
// sync so the isolation also holds in shells that strip HOME.
process.env.USERPROFILE = gitHome;
process.env.GIT_CONFIG_GLOBAL = gitConfig;
process.env.GIT_CONFIG_NOSYSTEM = "1";
process.env.GIT_TERMINAL_PROMPT = "0";

process.on("exit", () => {
  try { fs.rmSync(gitHome, { recursive: true, force: true }); } catch { /* best effort */ }
});
