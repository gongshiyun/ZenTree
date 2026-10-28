/**
 * Branch colors used to tint graph nodes, lanes and ref pills.
 *
 * The palette is deliberately warm and desaturated (the "Claude" visual
 * language): clay, sage, ochre, lavender-gray, olive, muted teal, rose, sand…
 * Every swatch is a mid-tone (L* ≈ 45–62) so lanes stay legible on both the
 * cream light theme (#faf9f5) and the dark themes (#262624 / #141413): the
 * contrast ratio against either background surface is kept in the 3.1–5.5
 * range, which is what thin 1.5 px graph edges need.
 *
 * The array is ordered so consecutive indices are far apart on the hue wheel;
 * `hashToColor` walks it deterministically from the commit hash.
 */
export const BRANCH_COLORS = [
  "#c4674a", // clay
  "#7a9168", // sage
  "#ad7f34", // ochre
  "#9187a6", // lavender gray
  "#8a8a4c", // olive
  "#5b8f8a", // muted teal
  "#b5657a", // rose
  "#a1854f", // sand
  "#8f6b55", // cocoa
  "#6f89a4", // dusty blue
  "#9a6f8f", // plum
  "#6b8f5f", // moss
];

/** Deterministically map a commit hash to a stable branch color. */
export function hashToColor(hash: string, colors: string[] = BRANCH_COLORS): string {
  let sum = 0;
  for (let i = 0; i < hash.length; i++) sum = (sum * 31 + hash.charCodeAt(i)) | 0;
  return colors[Math.abs(sum) % colors.length];
}
