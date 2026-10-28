#!/usr/bin/env node
// Static CSS coverage + token hygiene check for the ZenTree redesign.
//
//   node scripts/css-coverage.mjs
//   node scripts/css-coverage.mjs --json .qa/css-coverage.json --show-all
//
// Checks
//  1. Every class name referenced from a className attribute in src/**/*.tsx and
//     src/App.tsx has at least one selector rule in src/theme.css or
//     src/styles/*.css. Dynamic fragments are resolved heuristically:
//     comparison literals (=== "state") are ignored, while literals inside
//     ternaries/template interpolations (cond ? " active" : "") count as classes.
//  2. No hardcoded hex colours in src/styles/*.css (src/theme.css and
//     src/domain/theme/presets.ts are the allow-listed token sources).
//     rgb()/hsl() literals are reported as warnings.
//  3. src/App.css is no longer imported by any entry file.
//
// Exit code: 0 = clean, 1 = gaps/hex colours/App.css import found, 2 = internal error.

import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, QA_DIR } from "./lib/proc.mjs";

const SRC_DIR = path.join(REPO_ROOT, "src");
const STYLES_DIR = path.join(SRC_DIR, "styles");
const TOKEN_CSS = path.join(SRC_DIR, "theme.css");
const ENTRY_FILES = [
  path.join(SRC_DIR, "main.tsx"),
  path.join(SRC_DIR, "App.tsx"),
];

function parseArgs(argv) {
  const args = { json: path.join(QA_DIR, "css-coverage.json"), showAll: false, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") args.json = argv[++i];
    else if (arg.startsWith("--json=")) args.json = arg.slice("--json=".length);
    else if (arg === "--show-all") args.showAll = true;
    else if (arg === "--quiet") args.quiet = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function listFiles(dir, predicate) {
  const result = [];
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...listFiles(full, predicate));
    else if (predicate(full)) result.push(full);
  }
  return result;
}

function rel(file) {
  return path.relative(REPO_ROOT, file).split(path.sep).join("/");
}

function lineAt(content, index) {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i += 1) {
    if (content[i] === "\n") line += 1;
  }
  return line;
}

/**
 * Scan a `className={...}` expression and collect class tokens.
 *
 * Heuristics:
 *  - `x === "state"` / `x !== "state"` comparison literals are not class names.
 *  - string literals in ternary branches and template interpolations are.
 *  - template-literal static text is split on whitespace.
 */
function classTokensFromExpression(expression) {
  let expr = expression;
  // Remove comparison operands: === "foo", !== 'foo', == `foo`.
  expr = expr.replace(/(?:===?|!==?)\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`)/g, " ");

  const tokens = [];
  const push = (text) => {
    for (const token of text.split(/\s+/)) {
      const cleaned = token.trim();
      if (!cleaned) continue;
      if (!/^-?[A-Za-z][\w-]*$/.test(cleaned)) continue;
      tokens.push(cleaned);
    }
  };

  // Template literals: extract the static segments (the dynamic `${...}` parts
  // are skipped; literals inside them are covered by the string scan below).
  const templateRe = /`((?:[^`\\]|\\.)*)`/g;
  let match;
  while ((match = templateRe.exec(expr))) {
    const staticText = match[1].replace(/\$\{[^}]*\}/g, " ");
    push(staticText);
  }
  // String literals anywhere (ternary branches, objects, template internals).
  const stringRe = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;
  while ((match = stringRe.exec(expr))) {
    push(match[1] ?? match[2] ?? "");
  }
  return tokens;
}

/** Extract every class token used by a TSX file's className attributes. */
function extractClassNames(file, content) {
  const found = new Map();
  const attrRe = /className\s*=\s*/g;
  let match;
  while ((match = attrRe.exec(content))) {
    const start = attrRe.lastIndex;
    let end;
    const quote = content[start];
    let expression;
    let unbalanced = false;
    if (quote === '"' || quote === "'") {
      end = start + 1;
      while (end < content.length) {
        if (content[end] === "\\") end += 2;
        else if (content[end] === quote) break;
        else end += 1;
      }
      expression = content.slice(start, end + 1);
    } else if (quote === "{") {
      // Balanced scan of the JSX expression with a frame stack:
      //   "attr"     -> a `{` opened by JSX / an object literal
      //   "template" -> a `${ ... }` interpolation waiting for its closing `}`
      const frames = [];
      let state = "code"; // code | template | single | double
      let i = start;
      for (; i < content.length; i += 1) {
        const ch = content[i];
        if (state === "single" || state === "double") {
          if (ch === "\\") i += 1;
          else if ((state === "single" && ch === "'") || (state === "double" && ch === '"')) state = "code";
          continue;
        }
        if (state === "template") {
          if (ch === "\\") {
            i += 1;
            continue;
          }
          if (ch === "`") {
            state = "code";
            continue;
          }
          if (ch === "$" && content[i + 1] === "{") {
            frames.push("template");
            state = "code";
            i += 1;
            continue;
          }
          continue;
        }
        // code
        if (ch === '"') {
          state = "double";
          continue;
        }
        if (ch === "'") {
          state = "single";
          continue;
        }
        if (ch === "`") {
          state = "template";
          continue;
        }
        if (ch === "{") {
          frames.push("attr");
          continue;
        }
        if (ch === "}") {
          const frame = frames.pop();
          if (frames.length === 0) {
            i += 1;
            break;
          }
          if (frame === "template") state = "template";
          continue;
        }
      }
      if (i >= content.length && frames.length > 0) unbalanced = true;
      expression = content.slice(start, i);
    } else {
      attrRe.lastIndex = start + 1;
      continue;
    }
    const line = lineAt(content, match.index);
    if (unbalanced) {
      console.warn(`[css-coverage] warning: could not balance className expression at ${rel(file)}:${line}; skipped`);
      attrRe.lastIndex = Math.max(attrRe.lastIndex, start + 1);
      continue;
    }
    for (const token of classTokensFromExpression(expression)) {
      if (!found.has(token)) found.set(token, []);
      const lines = found.get(token);
      if (!lines.includes(line)) lines.push(line);
    }
    attrRe.lastIndex = Math.max(attrRe.lastIndex, start + 1);
  }
  return found;
}

/** Collect class names defined by selectors in a CSS file. */
function extractDefinedClasses(file, content) {
  const withoutComments = content.replace(/\/\*[\s\S]*?\*\//g, "");
  const defined = new Set();
  // Rule preludes: text before each `{` (works inside @media blocks too).
  const preludeRe = /([^{}]+)\{/g;
  let match;
  while ((match = preludeRe.exec(withoutComments))) {
    const prelude = match[1];
    if (/^\s*@(keyframes|font-face|media|supports|layer)\b/.test(prelude)) continue;
    const classRe = /\.(-?[A-Za-z_][\w-]*)/g;
    let classMatch;
    while ((classMatch = classRe.exec(prelude))) defined.add(classMatch[1]);
  }
  return defined;
}

/** Hardcoded colours in component CSS. */
function findHardcodedColors(file, content) {
  const hits = [];
  const withoutComments = content.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "));
  const hexRe = /#[0-9a-fA-F]{3,8}\b/g;
  let match;
  while ((match = hexRe.exec(withoutComments))) {
    hits.push({ kind: "hex", value: match[0], line: lineAt(withoutComments, match.index) });
  }
  const fnRe = /\b(rgba?|hsla?)\s*\(/g;
  while ((match = fnRe.exec(withoutComments))) {
    const line = lineAt(withoutComments, match.index);
    if (!hits.some((hit) => hit.line === line && hit.kind === "fn")) {
      hits.push({ kind: "fn", value: match[1] + "()", line });
    }
  }
  return hits;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log([
      "ZenTree CSS coverage check",
      "",
      "Usage: node scripts/css-coverage.mjs [--json <path>] [--show-all] [--quiet]",
      "",
      "Fails (exit 1) when:",
      "  - a className used in src/**/*.tsx has no selector rule in src/theme.css or src/styles/*.css",
      "  - src/styles/*.css contains hardcoded hex colours (use theme tokens)",
      "  - src/App.css is imported by an entry file (it must stay unused)",
    ].join("\n"));
    return;
  }

  const sourceFiles = [
    ...listFiles(SRC_DIR, (file) => file.endsWith(".tsx")),
    path.join(SRC_DIR, "App.tsx"),
  ].filter((file, index, all) => all.indexOf(file) === index && fs.existsSync(file));

  const cssFiles = [TOKEN_CSS, ...listFiles(STYLES_DIR, (file) => file.endsWith(".css"))]
    .filter((file, index, all) => all.indexOf(file) === index && fs.existsSync(file));

  if (!fs.existsSync(TOKEN_CSS)) {
    console.error(`missing token CSS: ${rel(TOKEN_CSS)}`);
    process.exit(2);
  }

  // ---- used classes -------------------------------------------------------
  const used = new Map(); // token -> [{file,line}]
  for (const file of sourceFiles) {
    const content = fs.readFileSync(file, "utf8");
    const classes = extractClassNames(file, content);
    for (const [token, lines] of classes) {
      if (!used.has(token)) used.set(token, []);
      for (const line of lines) used.get(token).push({ file: rel(file), line });
    }
  }

  // ---- defined classes ----------------------------------------------------
  const defined = new Map(); // token -> [files]
  for (const file of cssFiles) {
    const content = fs.readFileSync(file, "utf8");
    for (const token of extractDefinedClasses(file, content)) {
      if (!defined.has(token)) defined.set(token, []);
      if (!defined.get(token).includes(rel(file))) defined.get(token).push(rel(file));
    }
  }

  const uncovered = [...used.keys()]
    .filter((token) => !defined.has(token))
    .sort((a, b) => a.localeCompare(b))
    .map((token) => ({ token, files: used.get(token) }));

  // ---- hardcoded colours in component CSS ---------------------------------
  const hardcoded = [];
  const colorWarnings = [];
  for (const file of cssFiles) {
    if (file === TOKEN_CSS) continue; // token source is allow-listed
    if (path.basename(file) === "App.css") continue; // dead reference file, must stay unused
    const content = fs.readFileSync(file, "utf8");
    for (const hit of findHardcodedColors(file, content)) {
      const record = { file: rel(file), line: hit.line, value: hit.value };
      if (hit.kind === "hex") hardcoded.push(record);
      else colorWarnings.push(record);
    }
  }

  // ---- App.css import check ----------------------------------------------
  const appCssImports = [];
  for (const file of ENTRY_FILES) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, "utf8");
    if (/App\.css/.test(content)) appCssImports.push(rel(file));
  }

  // ---- report -------------------------------------------------------------
  const result = {
    generatedAt: new Date().toISOString(),
    sourceFiles: sourceFiles.map(rel),
    cssFiles: cssFiles.map(rel),
    stats: {
      usedClasses: used.size,
      definedClasses: defined.size,
      uncoveredClasses: uncovered.length,
      hardcodedHex: hardcoded.length,
      hardcodedColorFunctions: colorWarnings.length,
      appCssImports: appCssImports.length,
    },
    uncovered,
    hardcodedColors: hardcoded,
    colorFunctionWarnings: colorWarnings,
    appCssImports,
    definedButUnused: [...defined.keys()].filter((token) => !used.has(token)).sort((a, b) => a.localeCompare(b)),
  };

  fs.mkdirSync(path.dirname(args.json), { recursive: true });
  fs.writeFileSync(args.json, JSON.stringify(result, null, 2) + "\n", "utf8");

  if (!args.quiet) {
    console.log("=== ZenTree CSS coverage ===");
    console.log(`source files: ${result.sourceFiles.length}; css files: ${result.cssFiles.join(", ")}`);
    console.log(`classes used in TSX: ${used.size}; defined in CSS: ${defined.size}; uncovered: ${uncovered.length}`);
    if (uncovered.length > 0) {
      const shown = args.showAll ? uncovered : uncovered.slice(0, 40);
      console.log("\nClass names without any CSS rule:");
      for (const entry of shown) {
        const [first] = entry.files;
        console.log(`  .${entry.token}  <- ${first.file}:${first.line}${entry.files.length > 1 ? ` (+${entry.files.length - 1} more)` : ""}`);
      }
      if (!args.showAll && uncovered.length > shown.length) console.log(`  ... ${uncovered.length - shown.length} more (use --show-all)`);
    }
    if (hardcoded.length > 0) {
      console.log("\nHardcoded hex colours in component CSS (must use theme tokens):");
      for (const hit of hardcoded) console.log(`  ${hit.file}:${hit.line}  ${hit.value}`);
    }
    if (appCssImports.length > 0) {
      console.log(`\nApp.css must not be imported (found in: ${appCssImports.join(", ")})`);
    }
    if (colorWarnings.length > 0) {
      console.log(`\nWarning: ${colorWarnings.length} rgb()/hsl() literal(s) in component CSS (prefer tokens/color-mix):`);
      for (const hit of colorWarnings.slice(0, 20)) console.log(`  ${hit.file}:${hit.line}  ${hit.value}`);
    }
    const gaps = uncovered.length + hardcoded.length + appCssImports.length;
    console.log(`\nreport: ${rel(args.json)}`);
    console.log(gaps === 0 ? "RESULT: PASS (all classNames covered, no hardcoded hex, App.css unused)" : `RESULT: FAIL (${gaps} issue(s))`);
  }

  const failed = uncovered.length > 0 || hardcoded.length > 0 || appCssImports.length > 0;
  if (failed) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(`css-coverage.mjs failed: ${error?.stack ?? error}`);
  process.exitCode = 2;
}
