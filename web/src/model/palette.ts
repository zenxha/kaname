/** Person colors on the dark map. Light enough for dark numerals; color is never the only identifier. */
export const PERSON_COLORS: readonly string[] = [
  "#4FE0BE", "#FFB454", "#FF7C9C", "#8FB6FF", "#C9A0FF", "#F5DD5C", "#A6E36F", "#FF9A6B", "#6FE3FF", "#FFA8E8",
  "#D9C08C", "#9DF2D0", "#FFCF8A", "#B4C7FF", "#E8F07A", "#FF8A8A", "#7FB8A6", "#D7A6FF", "#F2B8A0", "#A0D8F0",
];

export function personColor(index: number): string {
  return PERSON_COLORS[((index % PERSON_COLORS.length) + PERSON_COLORS.length) % PERSON_COLORS.length]!;
}
