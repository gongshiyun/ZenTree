/** Branch colors used to tint graph nodes and edges. */
export const BRANCH_COLORS = [
  "#e06c75", "#61afef", "#98c379", "#d19a66", "#c678dd",
  "#56b6c2", "#e5c07b", "#be5046", "#7ec8e3", "#c3e88d",
  "#ff79c6", "#bd93f9", "#8be9fd", "#f1fa8c", "#ffb86c",
  "#50fa7b", "#ff5555", "#f8f8f2", "#6272a4", "#44475a",
];

/** Deterministically map a commit hash to a stable branch color. */
export function hashToColor(hash: string, colors: string[] = BRANCH_COLORS): string {
  let sum = 0;
  for (let i = 0; i < hash.length; i++) sum = (sum * 31 + hash.charCodeAt(i)) | 0;
  return colors[Math.abs(sum) % colors.length];
}
