import { describe, it, expect } from "vitest";
import { highlightLine, type Token } from "../src/domain/diff/highlight";

function tokensWithClass(tokens: Token[], cls: string): string[] {
  return tokens.filter((t) => t.cls === cls).map((t) => t.text);
}

function text(tokens: Token[]): string {
  return tokens.map((t) => t.text).join("");
}

describe("highlightLine", () => {
  it("marks keywords for TypeScript", () => {
    const tokens = highlightLine("const x = 1;", "a.ts");
    expect(tokensWithClass(tokens, "kw")).toContain("const");
    expect(text(tokens)).toBe("const x = 1;");
  });

  it("marks string literals with the str class", () => {
    const tokens = highlightLine('const s = "hello";', "a.ts");
    const strings = tokensWithClass(tokens, "str");
    expect(strings.some((s) => s.includes("hello"))).toBe(true);
  });

  it("does not treat keywords inside strings as keywords", () => {
    const tokens = highlightLine('const s = "return";', "a.ts");
    expect(tokensWithClass(tokens, "kw")).toEqual(["const"]);
    expect(tokensWithClass(tokens, "str")).toContain('"return"');
  });

  it("marks integer, decimal and hex numbers", () => {
    const decimal = highlightLine("x = 42;", "a.ts");
    expect(tokensWithClass(decimal, "num")).toContain("42");
    const float = highlightLine("x = 3.14;", "a.ts");
    expect(tokensWithClass(float, "num")).toContain("3.14");
    const hex = highlightLine("x = 0x1F;", "a.ts");
    expect(tokensWithClass(hex, "num")).toContain("0x1F");
  });

  it("marks function calls with the fn class", () => {
    const tokens = highlightLine("foo(1);", "a.ts");
    expect(tokensWithClass(tokens, "fn")).toContain("foo");
  });

  it("marks an inline line comment after code", () => {
    const tokens = highlightLine("const x = 1; // note", "a.ts");
    expect(tokensWithClass(tokens, "cmt").some((c) => c.includes("// note"))).toBe(true);
  });

  it("marks a full-line comment as a single comment token", () => {
    expect(highlightLine("// just a comment", "a.ts")).toEqual([
      { text: "// just a comment", cls: "cmt" },
    ]);
  });

  it("does not treat a comment marker inside a string as a comment", () => {
    const tokens = highlightLine('const s = "// not a comment";', "a.ts");
    expect(tokensWithClass(tokens, "cmt")).toEqual([]);
  });

  it("handles escaped quotes inside strings without crashing", () => {
    const tokens = highlightLine('const s = "a\\"b";', "a.ts");
    expect(text(tokens)).toBe('const s = "a\\"b";');
  });

  it("supports Python comments and keywords", () => {
    const tokens = highlightLine("def foo(): # comment", "a.py");
    expect(tokensWithClass(tokens, "kw")).toContain("def");
    expect(tokensWithClass(tokens, "cmt")).toContain("# comment");
  });

  it("supports Rust keywords and function names", () => {
    const tokens = highlightLine("fn main() {}", "a.rs");
    expect(tokensWithClass(tokens, "kw")).toContain("fn");
    expect(tokensWithClass(tokens, "fn")).toContain("main");
  });

  it("supports Go keywords", () => {
    const tokens = highlightLine("func main() {}", "a.go");
    expect(tokensWithClass(tokens, "kw")).toContain("func");
    expect(tokensWithClass(tokens, "fn")).toContain("main");
  });

  it("supports Java keywords", () => {
    const tokens = highlightLine("public class Foo {}", "a.java");
    expect(tokensWithClass(tokens, "kw")).toEqual(expect.arrayContaining(["public", "class"]));
  });

  it("supports CSS at-rule keywords", () => {
    const tokens = highlightLine("@media screen {}", "a.css");
    expect(tokensWithClass(tokens, "kw")).toContain("media");
  });

  it("supports HTML keywords and attribute strings", () => {
    const tokens = highlightLine("<div class='x'>", "a.html");
    expect(tokensWithClass(tokens, "kw")).toContain("div");
    expect(tokensWithClass(tokens, "str")).toContain("'x'");
  });

  it("supports JSON true/false/null keywords", () => {
    const tokens = highlightLine('{ "a": true }', "a.json");
    expect(tokensWithClass(tokens, "kw")).toContain("true");
    expect(tokensWithClass(tokens, "str")).toContain('"a"');
  });

  it("supports shell keywords and comments", () => {
    const tokens = highlightLine("echo hello # comment", "a.sh");
    expect(tokensWithClass(tokens, "kw")).toContain("echo");
    expect(tokensWithClass(tokens, "cmt")).toContain("# comment");
  });

  it("returns a single plain token for unsupported extensions", () => {
    expect(highlightLine("just plain words", "README.xyz")).toEqual([
      { text: "just plain words", cls: "" },
    ]);
  });

  it("returns a single plain token for an empty line", () => {
    expect(highlightLine("", "a.ts")).toEqual([{ text: "", cls: "" }]);
  });
});
