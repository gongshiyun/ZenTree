export type WordToken = { text: string; type: "same" | "del" | "add" };

/**
 * Word-level diff of two single-line strings using an LCS over whitespace
 * delimited tokens. Returns aligned token streams for the deleted and the
 * added line so renderers can highlight only the changed words.
 */
export function diffWords(oldText: string, newText: string): { del: WordToken[]; add: WordToken[] } {
  const tokenize = (s: string) => s.match(/\S+\s*|\s+/g) || [];
  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);
  const n = oldTokens.length;
  const m = newTokens.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = oldTokens[i] === newTokens[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const del: WordToken[] = [];
  const add: WordToken[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldTokens[i] === newTokens[j]) {
      del.push({ text: oldTokens[i], type: "same" });
      add.push({ text: newTokens[j], type: "same" });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      del.push({ text: oldTokens[i], type: "del" });
      i++;
    } else {
      add.push({ text: newTokens[j], type: "add" });
      j++;
    }
  }
  while (i < n) del.push({ text: oldTokens[i++], type: "del" });
  while (j < m) add.push({ text: newTokens[j++], type: "add" });
  return { del, add };
}
