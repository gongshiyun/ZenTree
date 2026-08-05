import type { GitStatusData } from "../../types";

/**
 * Deterministic fingerprint of a working-tree snapshot. Used by the silent
 * refresh short-circuit: identical fingerprints mean nothing changed, so the
 * graph and file lists can skip a full rebuild. The fingerprint is combined
 * with the HEAD hash at the call site (covers detached-HEAD commits, which
 * do not change the branch name).
 */
export function statusFingerprint(status: GitStatusData | undefined): string {
  if (!status) return "none";
  const parts: string[] = [
    status.current,
    [...status.staged].sort().join("|"),
    [...status.modified].sort().join("|"),
    [...status.created].sort().join("|"),
    [...status.deleted].sort().join("|"),
    [...status.not_added].sort().join("|"),
    [...status.conflicted].sort().join("|"),
    [...status.renamed].map((r) => `${r.from}->${r.to}`).sort().join("|"),
  ];
  return parts.join("\u0000");
}
