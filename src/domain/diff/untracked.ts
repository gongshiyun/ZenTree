/**
 * Build a synthetic unified diff for an untracked (new) working-tree file.
 * `git diff` reports nothing for untracked files, so the whole file is shown
 * as an addition. Pure domain logic, no DOM or IPC dependencies.
 */
export function buildUntrackedDiff(filePath: string, content: string): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  // The trailing newline produces an empty final element; drop it.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const newCount = lines.length;
  const header = [
    `diff --git a/${filePath} b/${filePath}`,
    "new file mode 100644",
    "index 0000000..0000000",
    "--- /dev/null",
    `+++ b/${filePath}`,
    `@@ -0,0 +1,${newCount} @@`,
  ];
  const body = newCount === 0 ? [] : lines.map((l) => "+" + l);
  return [...header, ...body].join("\n");
}
