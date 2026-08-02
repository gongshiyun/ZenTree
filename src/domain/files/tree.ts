export interface FileTreeNode {
  name: string;
  path: string;
  type: "dir" | "file";
  children?: FileTreeNode[];
}

/**
 * Build a directory tree from flat file paths (pure domain logic).
 * Directories and files are each sorted by name; paths use forward slashes.
 */
export function buildFileTree(paths: string[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  for (const raw of paths) {
    const parts = raw.replace(/\\/g, "/").split("/").filter(Boolean);
    let current = root;
    let acc = "";
    for (let i = 0; i < parts.length; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      const isFile = i === parts.length - 1;
      let node = current.find((n) => n.name === parts[i] && n.type === (isFile ? "file" : "dir"));
      if (!node) {
        node = isFile
          ? { name: parts[i], path: acc, type: "file" }
          : { name: parts[i], path: acc, type: "dir", children: [] };
        current.push(node);
      }
      if (!isFile && node.children) current = node.children;
    }
  }
  const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
    nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
    for (const n of nodes) if (n.children) sortNodes(n.children);
    return nodes;
  };
  return sortNodes(root);
}
