/**
 * Display name for a repository path: its last path segment.
 *
 * Tab labels are never stored, they are derived — first from the known
 * repository list (`RepoInfo.name`), falling back to this function for paths
 * that only exist inside a repo group. Deriving keeps a renamed repository in
 * sync with its tab and avoids two names disagreeing.
 *
 * Deliberately dependency-free: no Node `path` import, so it stays usable from
 * the renderer and from plain unit tests. Both separators are handled, and
 * trailing separators are ignored ("d:/repos/ZenTree/" -> "ZenTree").
 */
export function repoDisplayName(repoPath: string): string {
  const trimmed = repoPath.replace(/[/\\]+$/, "");
  if (!trimmed) return repoPath;
  const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return index >= 0 ? trimmed.slice(index + 1) : trimmed;
}
