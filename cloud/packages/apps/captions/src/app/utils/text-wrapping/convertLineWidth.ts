/**
 * Converts a line width setting to a numeric character count
 *
 * Supports two input formats:
 * 1. Numeric enum values: 0=Narrow, 1=Medium, 2=Wide
 * 2. String values: "narrow", "medium", "wide"
 *
 * @param width The width setting as a string or number
 * @param isHanzi Whether the text uses Hanzi characters (Chinese, Japanese)
 * @returns The number of characters per line
 */
export function convertLineWidth(width: string | number, isHanzi: boolean): number {
  // Character counts for each width setting
  const widthMap = isHanzi
    ? { narrow: 14, medium: 18, wide: 21 }
    : { narrow: 38, medium: 44, wide: 52 }

  // Handle numeric enum values (0=Narrow, 1=Medium, 2=Wide)
  if (typeof width === "number") {
    switch (width) {
      case 0:
        return widthMap.narrow
      case 1:
        return widthMap.medium
      case 2:
        return widthMap.wide
      default:
        // If it's already a character count (e.g., 38, 44, 52), return as-is
        // This handles cases where the value has already been converted
        if (width > 2) {
          return width
        }
        // Default to wide for invalid values
        return widthMap.wide
    }
  }

  // Handle string values ("narrow", "medium", "wide")
  switch (width.toLowerCase()) {
    case "narrow":
    case "0":
      return widthMap.narrow
    case "medium":
    case "1":
      return widthMap.medium
    case "wide":
    case "2":
      return widthMap.wide
    default:
      return widthMap.wide
  }
}
