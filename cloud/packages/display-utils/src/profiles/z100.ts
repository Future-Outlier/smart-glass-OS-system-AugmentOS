import {DisplayProfile} from "./types"

/**
 * Vuzix Z100 glyph widths
 *
 * PLACEHOLDER: Currently using G1 glyph widths until actual Z100 font metrics are available.
 * TODO: Replace with actual Z100 font measurements when hardware specs are confirmed.
 */
const Z100_GLYPH_WIDTHS: Record<string, number> = {
  // Punctuation & Symbols
  " ": 2,
  "!": 1,
  '"': 2,
  "#": 6,
  "$": 5,
  "%": 6,
  "&": 7,
  "'": 1,
  "(": 2,
  ")": 2,
  "*": 3,
  "+": 4,
  ",": 1,
  "-": 4,
  ".": 1,
  "/": 3,

  // Numbers
  "0": 5,
  "1": 3,
  "2": 5,
  "3": 5,
  "4": 5,
  "5": 5,
  "6": 5,
  "7": 5,
  "8": 5,
  "9": 5,

  // More punctuation
  ":": 1,
  ";": 1,
  "<": 4,
  "=": 4,
  ">": 4,
  "?": 5,
  "@": 7,

  // Uppercase
  "A": 6,
  "B": 5,
  "C": 5,
  "D": 5,
  "E": 4,
  "F": 4,
  "G": 5,
  "H": 5,
  "I": 2,
  "J": 3,
  "K": 5,
  "L": 4,
  "M": 7,
  "N": 5,
  "O": 5,
  "P": 5,
  "Q": 5,
  "R": 5,
  "S": 5,
  "T": 5,
  "U": 5,
  "V": 6,
  "W": 7,
  "X": 6,
  "Y": 6,
  "Z": 5,

  // Brackets & special
  "[": 2,
  "\\": 3,
  "]": 2,
  "^": 4,
  "_": 3,
  "`": 2,

  // Lowercase
  "a": 5,
  "b": 4,
  "c": 4,
  "d": 4,
  "e": 4,
  "f": 4,
  "g": 4,
  "h": 4,
  "i": 1,
  "j": 2,
  "k": 4,
  "l": 1,
  "m": 7,
  "n": 4,
  "o": 4,
  "p": 4,
  "q": 4,
  "r": 3,
  "s": 4,
  "t": 3,
  "u": 5,
  "v": 5,
  "w": 7,
  "x": 5,
  "y": 5,
  "z": 4,

  // More special
  "{": 3,
  "|": 1,
  "}": 3,
  "~": 7,
}

/**
 * Vuzix Z100 Smart Glasses Display Profile
 *
 * The Z100 has a green monochrome display with 640x480 resolution.
 * Max text lines: 7 (from hardware capabilities)
 *
 * PLACEHOLDER VALUES: Font metrics are currently based on G1 profile.
 * TODO: Update with actual Z100 font measurements when available.
 *
 * Known Z100 specs (from capabilities):
 * - Resolution: 640x480
 * - Color: Green monochrome
 * - Max text lines: 7
 * - No bitmap support
 * - Adjustable brightness
 */
export const Z100_PROFILE: DisplayProfile = {
  id: "vuzix-z100",
  name: "Vuzix Z100",

  // Display dimensions
  // PLACEHOLDER: Using estimated width based on resolution ratio
  // TODO: Confirm actual usable text display width
  displayWidthPx: 576,
  maxLines: 7,

  // BLE constraints
  // PLACEHOLDER: Using G1 values until Z100 specs confirmed
  maxPayloadBytes: 390,
  bleChunkSize: 176,

  // Font metrics
  // PLACEHOLDER: Using G1 font metrics until Z100 font is measured
  fontMetrics: {
    glyphWidths: new Map(Object.entries(Z100_GLYPH_WIDTHS)),
    defaultGlyphWidth: 7,
    renderFormula: (glyphWidth: number) => (glyphWidth + 1) * 2,

    // Uniform-width scripts
    // PLACEHOLDER: Using G1 values
    uniformScripts: {
      cjk: 18,
      hiragana: 18,
      katakana: 18,
      korean: 24,
      cyrillic: 18,
    },

    fallback: {
      latinMaxWidth: 16,
      unknownBehavior: "useLatinMax",
    },
  },

  constraints: {
    minCharsBeforeHyphen: 3,
    noStartChars: [".", ",", "!", "?", ":", ";", ")", "]", "}", "。", "，", "！", "？", "：", "；", "）", "】", "」"],
    noEndChars: ["(", "[", "{", "（", "【", "「"],
  },
}

/**
 * Get the hyphen width for Z100 in rendered pixels.
 * PLACEHOLDER: Using G1 value
 */
export const Z100_HYPHEN_WIDTH_PX = 10

/**
 * Get the space width for Z100 in rendered pixels.
 * PLACEHOLDER: Using G1 value
 */
export const Z100_SPACE_WIDTH_PX = 6
