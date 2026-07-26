/**
 * Lightweight regex-based syntax highlighter for diff lines.
 * Returns an array of { text, className } tokens for rendering.
 */

export interface Token {
  text: string;
  cls: string; // css class suffix: "kw" | "str" | "num" | "cmt" | "fn" | ""
}

interface LangRules {
  keywords: RegExp;
  lineComment?: string;
  blockCommentStart?: string;
  blockCommentEnd?: string;
  stringDelims?: string[];
}

const LANGS: Record<string, LangRules> = {
  js: {
    keywords: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|from|default|try|catch|finally|throw|async|await|yield|typeof|instanceof|in|of|void|delete|null|undefined|true|false)\b/g,
    lineComment: "//",
    blockCommentStart: "/*",
    blockCommentEnd: "*/",
    stringDelims: ["'", '"', "`"],
  },
  ts: {
    keywords: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|from|default|try|catch|finally|throw|async|await|yield|typeof|instanceof|in|of|void|delete|null|undefined|true|false|interface|type|enum|implements|declare|abstract|readonly|as|is|keyof|namespace|module)\b/g,
    lineComment: "//",
    blockCommentStart: "/*",
    blockCommentEnd: "*/",
    stringDelims: ["'", '"', "`"],
  },
  py: {
    keywords: /\b(def|class|return|if|elif|else|for|while|break|continue|import|from|as|try|except|finally|raise|with|yield|lambda|pass|and|or|not|in|is|None|True|False|self|global|nonlocal|assert|del|print)\b/g,
    lineComment: "#",
    stringDelims: ["'", '"'],
  },
  rust: {
    keywords: /\b(fn|let|mut|const|struct|enum|impl|trait|pub|use|mod|crate|self|super|return|if|else|for|while|loop|match|break|continue|move|ref|where|async|await|dyn|type|static|unsafe|extern|true|false|Some|None|Ok|Err)\b/g,
    lineComment: "//",
    blockCommentStart: "/*",
    blockCommentEnd: "*/",
    stringDelims: ['"'],
  },
  go: {
    keywords: /\b(func|var|const|type|struct|interface|map|chan|go|defer|return|if|else|for|range|switch|case|break|continue|import|package|nil|true|false|make|new|append|len|cap)\b/g,
    lineComment: "//",
    blockCommentStart: "/*",
    blockCommentEnd: "*/",
    stringDelims: ['"', "'", "`"],
  },
  java: {
    keywords: /\b(public|private|protected|static|final|abstract|class|interface|extends|implements|return|if|else|for|while|do|switch|case|break|continue|new|this|super|try|catch|finally|throw|throws|import|package|void|int|long|double|float|boolean|char|byte|short|null|true|false|instanceof|synchronized|volatile|transient)\b/g,
    lineComment: "//",
    blockCommentStart: "/*",
    blockCommentEnd: "*/",
    stringDelims: ['"', "'"],
  },
  css: {
    keywords: /\b(import|media|keyframes|supports|font-face|charset|namespace|page)\b/g,
    lineComment: undefined,
    blockCommentStart: "/*",
    blockCommentEnd: "*/",
    stringDelims: ["'", '"'],
  },
  html: {
    keywords: /\b(div|span|class|id|style|src|href|alt|type|value|name|content|meta|link|script|body|head|html|title|form|input|button|table|tr|td|th|ul|ol|li|img|a|p|h[1-6])\b/g,
    lineComment: undefined,
    blockCommentStart: "<!--",
    blockCommentEnd: "-->",
    stringDelims: ["'", '"'],
  },
  json: {
    keywords: /\b(true|false|null)\b/g,
    stringDelims: ['"'],
  },
  sh: {
    keywords: /\b(if|then|else|elif|fi|for|while|do|done|case|esac|function|return|exit|echo|export|local|readonly|shift|source|alias|cd|ls|grep|sed|awk|cat|mkdir|rm|cp|mv|chmod|sudo|git|npm|npx|node)\b/g,
    lineComment: "#",
    stringDelims: ["'", '"'],
  },
};

// Map file extensions to language keys
const EXT_MAP: Record<string, string> = {
  js: "js", jsx: "js", mjs: "js", cjs: "js",
  ts: "ts", tsx: "ts",
  py: "py", pyw: "py",
  rs: "rust",
  go: "go",
  java: "java", kt: "java", scala: "java",
  css: "css", scss: "css", less: "css",
  html: "html", htm: "html", xml: "html", svg: "html", vue: "html",
  json: "json",
  sh: "sh", bash: "sh", zsh: "sh", bat: "sh", ps1: "sh",
};

function getLang(filePath: string): LangRules | null {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const key = EXT_MAP[ext];
  return key ? LANGS[key] || null : null;
}

const NUM_RE = /\b(0x[\da-fA-F]+|\d+\.?\d*(?:e[+-]?\d+)?)\b/g;
const FN_RE = /\b([a-zA-Z_]\w*)\s*(?=\()/g;

/**
 * Tokenize a single line of code for syntax highlighting.
 * Returns tokens with class annotations.
 */
export function highlightLine(content: string, filePath: string): Token[] {
  const lang = getLang(filePath);
  if (!lang || content.length === 0) {
    return [{ text: content, cls: "" }];
  }

  // Check if entire line is a comment
  const trimmed = content.trimStart();
  if (lang.lineComment && trimmed.startsWith(lang.lineComment)) {
    return [{ text: content, cls: "cmt" }];
  }

  // Build a mark array: each char position gets a priority class
  const len = content.length;
  const marks: string[] = new Array(len).fill("");

  const markRange = (start: number, end: number, cls: string) => {
    for (let i = start; i < end && i < len; i++) {
      if (marks[i] === "") marks[i] = cls;
    }
  };

  // Strings (highest priority)
  if (lang.stringDelims) {
    for (const delim of lang.stringDelims) {
      let idx = 0;
      while (idx < len) {
        const start = content.indexOf(delim, idx);
        if (start === -1) break;
        let end = start + delim.length;
        while (end < len) {
          if (content[end] === "\\") { end += 2; continue; }
          if (content.startsWith(delim, end)) { end += delim.length; break; }
          end++;
        }
        markRange(start, Math.min(end, len), "str");
        idx = end;
      }
    }
  }

  // Inline comments (after code)
  if (lang.lineComment) {
    const cmtIdx = findLineComment(content, lang.lineComment, lang.stringDelims);
    if (cmtIdx !== -1) {
      markRange(cmtIdx, len, "cmt");
    }
  }

  // Keywords
  const kwRe = new RegExp(lang.keywords.source, "g");
  let m: RegExpExecArray | null;
  while ((m = kwRe.exec(content)) !== null) {
    if (marks[m.index] === "") {
      markRange(m.index, m.index + m[0].length, "kw");
    }
  }

  // Numbers
  let nm: RegExpExecArray | null;
  const numRe = new RegExp(NUM_RE.source, "g");
  while ((nm = numRe.exec(content)) !== null) {
    if (marks[nm.index] === "") {
      markRange(nm.index, nm.index + nm[0].length, "num");
    }
  }

  // Function calls
  let fm: RegExpExecArray | null;
  const fnRe = new RegExp(FN_RE.source, "g");
  while ((fm = fnRe.exec(content)) !== null) {
    if (marks[fm.index] === "") {
      markRange(fm.index, fm.index + fm[1].length, "fn");
    }
  }

  // Build tokens from marks
  const tokens: Token[] = [];
  let i = 0;
  while (i < len) {
    const cls = marks[i];
    let j = i + 1;
    while (j < len && marks[j] === cls) j++;
    tokens.push({ text: content.substring(i, j), cls });
    i = j;
  }
  return tokens;
}

/** Find line comment start, ignoring occurrences inside strings. */
function findLineComment(line: string, comment: string, stringDelims?: string[]): number {
  let inString: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inString) {
      if (ch === "\\") { i++; continue; }
      if (line.startsWith(inString, i)) { const len = inString.length; inString = null; i += len - 1; }
      continue;
    }
    if (stringDelims && stringDelims.includes(ch)) {
      inString = ch;
      continue;
    }
    if (line.startsWith(comment, i)) return i;
  }
  return -1;
}
