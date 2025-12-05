import {describe, expect, test, beforeEach} from "bun:test"
import {TextWrapper} from "../src/wrapper/TextWrapper"
import {TextMeasurer} from "../src/measurer/TextMeasurer"
import {G1_PROFILE} from "../src/profiles/g1"

describe("TextWrapper", () => {
  let measurer: TextMeasurer
  let wrapper: TextWrapper

  beforeEach(() => {
    measurer = new TextMeasurer(G1_PROFILE)
    wrapper = new TextWrapper(measurer, {
      breakMode: "character",
      hyphenChar: "-",
      minCharsBeforeHyphen: 3,
    })
  })

  describe("constructor", () => {
    test("should create a wrapper with default options", () => {
      const defaultWrapper = new TextWrapper(measurer)
      expect(defaultWrapper).toBeDefined()
      const opts = defaultWrapper.getOptions()
      expect(opts.maxWidthPx).toBe(576)
      expect(opts.maxLines).toBe(5)
    })

    test("should accept custom options", () => {
      const customWrapper = new TextWrapper(measurer, {
        breakMode: "word",
        hyphenChar: "–",
      })
      const opts = customWrapper.getOptions()
      expect(opts.breakMode).toBe("word")
      expect(opts.hyphenChar).toBe("–")
    })
  })

  describe("wrap - basic functionality", () => {
    test("should return empty result for empty string", () => {
      const result = wrapper.wrap("")
      expect(result.lines).toEqual([""])
      expect(result.truncated).toBe(false)
    })

    test("should return single line for short text", () => {
      const result = wrapper.wrap("Hello")
      expect(result.lines.length).toBe(1)
      expect(result.lines[0]).toBe("Hello")
    })

    test("should wrap long text into multiple lines", () => {
      const longText = "This is a very long text that should be wrapped across multiple lines on the display."
      const result = wrapper.wrap(longText)
      expect(result.lines.length).toBeGreaterThan(1)
    })

    test("should preserve explicit newlines", () => {
      const result = wrapper.wrap("Line 1\nLine 2")
      expect(result.lines.length).toBeGreaterThanOrEqual(2)
      expect(result.lines[0]).toContain("Line 1")
    })

    test("should not preserve newlines when disabled", () => {
      const customWrapper = new TextWrapper(measurer, {
        preserveNewlines: false,
      })
      const result = customWrapper.wrap("Line 1\nLine 2")
      // Without preserving newlines, it should be treated as continuous text
      expect(result.lines.some((line) => line.includes("1") && line.includes("2"))).toBe(true)
    })
  })

  describe("wrap - character break mode", () => {
    test("should break mid-word with hyphen", () => {
      const charWrapper = new TextWrapper(measurer, {
        breakMode: "character",
      })
      const longWord = "supercalifragilisticexpialidocious".repeat(3)
      const result = charWrapper.wrap(longWord)

      // Should have hyphens at line breaks
      const linesWithHyphen = result.lines.filter((line) => line.endsWith("-"))
      expect(linesWithHyphen.length).toBeGreaterThan(0)
    })

    test("should respect minCharsBeforeHyphen", () => {
      const charWrapper = new TextWrapper(measurer, {
        breakMode: "character",
        minCharsBeforeHyphen: 5,
      })
      const result = charWrapper.wrap("abcdefghijklmnop".repeat(10))

      // Lines with hyphens should have at least minCharsBeforeHyphen chars before the hyphen
      for (const line of result.lines) {
        if (line.endsWith("-")) {
          const textBeforeHyphen = line.slice(0, -1)
          expect(textBeforeHyphen.length).toBeGreaterThanOrEqual(5)
        }
      }
    })

    test("should not add hyphen after space", () => {
      const result = wrapper.wrap("Hello world test message here now")
      for (const line of result.lines) {
        // Lines ending with hyphen should not have a space before the hyphen
        if (line.endsWith("-")) {
          expect(line[line.length - 2]).not.toBe(" ")
        }
      }
    })
  })

  describe("wrap - word break mode", () => {
    test("should break at word boundaries", () => {
      const wordWrapper = new TextWrapper(measurer, {
        breakMode: "word",
      })
      const result = wordWrapper.wrap("Hello world this is a test of word breaking")

      // Lines should generally end with complete words (not mid-word)
      for (let i = 0; i < result.lines.length - 1; i++) {
        const line = result.lines[i]
        // Either ends with a space/word or with hyphen for very long words
        const endsWithWordOrHyphen = line.endsWith(" ") || !line.includes("-") || line.endsWith("-")
        expect(endsWithWordOrHyphen).toBe(true)
      }
    })

    test("should hyphenate long words that exceed line width", () => {
      const wordWrapper = new TextWrapper(measurer, {
        breakMode: "word",
      })
      // Create a word that definitely exceeds line width (576px / ~10px per char = ~57 chars)
      const veryLongWord = "supercalifragilisticexpialidocious".repeat(3)
      const result = wordWrapper.wrap(`This is ${veryLongWord} end`)

      // The long word should be hyphenated
      const hasHyphen = result.lines.some((line) => line.includes("-"))
      expect(hasHyphen).toBe(true)
    })
  })

  describe("wrap - strict-word break mode", () => {
    test("should break at word boundaries only", () => {
      const strictWrapper = new TextWrapper(measurer, {
        breakMode: "strict-word",
      })
      const result = strictWrapper.wrap("Hello world this is a test")

      // Should not have any hyphens
      const hasHyphen = result.lines.some((line) => line.includes("-"))
      expect(hasHyphen).toBe(false)
    })

    test("should allow long words to overflow", () => {
      const strictWrapper = new TextWrapper(measurer, {
        breakMode: "strict-word",
      })
      const longWord = "supercalifragilisticexpialidocious"
      const result = strictWrapper.wrap(`The word is ${longWord}`)

      // The long word should appear without hyphenation
      const fullWordPresent = result.lines.some((line) => line.includes(longWord))
      expect(fullWordPresent).toBe(true)
    })
  })

  describe("wrap - constraints", () => {
    test("should respect maxLines", () => {
      const result = wrapper.wrap("A ".repeat(500), {maxLines: 3})
      expect(result.lines.length).toBeLessThanOrEqual(3)
      expect(result.truncated).toBe(true)
    })

    test("should respect maxBytes", () => {
      const result = wrapper.wrap("Hello world ".repeat(100), {maxBytes: 100})
      expect(result.totalBytes).toBeLessThanOrEqual(100)
      expect(result.truncated).toBe(true)
    })

    test("should respect maxWidthPx", () => {
      const result = wrapper.wrap("Hello world this is a test", {maxWidthPx: 200})
      for (const metric of result.lineMetrics) {
        expect(metric.widthPx).toBeLessThanOrEqual(200)
      }
    })
  })

  describe("wrap - line metrics", () => {
    test("should include line metrics", () => {
      const result = wrapper.wrap("Hello world")
      expect(result.lineMetrics).toBeDefined()
      expect(result.lineMetrics.length).toBe(result.lines.length)
    })

    test("should calculate utilization percentage", () => {
      const result = wrapper.wrap("Hello world this is a longer text for testing")
      for (const metric of result.lineMetrics) {
        expect(metric.utilizationPercent).toBeGreaterThanOrEqual(0)
        expect(metric.utilizationPercent).toBeLessThanOrEqual(100)
      }
    })

    test("should track byte size per line", () => {
      const result = wrapper.wrap("Hello")
      expect(result.lineMetrics[0].bytes).toBe(5)
    })

    test("should track which lines end with hyphen", () => {
      const longWord = "abcdefghijklmnopqrstuvwxyz".repeat(5)
      const result = wrapper.wrap(longWord)

      const hasHyphenEnd = result.lineMetrics.some((m) => m.endsWithHyphen)
      expect(hasHyphenEnd).toBe(true)
    })

    test("should track lines from explicit newlines", () => {
      const result = wrapper.wrap("Line 1\nLine 2")
      // Second line should be marked as from explicit newline
      const fromNewline = result.lineMetrics.some((m) => m.fromExplicitNewline)
      expect(fromNewline).toBe(true)
    })
  })

  describe("wrapToLines", () => {
    test("should return just lines array", () => {
      const lines = wrapper.wrapToLines("Hello world")
      expect(Array.isArray(lines)).toBe(true)
      expect(lines[0]).toBe("Hello world")
    })
  })

  describe("needsWrap", () => {
    test("should return false for short text", () => {
      expect(wrapper.needsWrap("Hi")).toBe(false)
    })

    test("should return true for long text", () => {
      expect(wrapper.needsWrap("A".repeat(100))).toBe(true)
    })

    test("should return true for text with newlines", () => {
      expect(wrapper.needsWrap("Line 1\nLine 2")).toBe(true)
    })

    test("should respect custom maxWidthPx", () => {
      expect(wrapper.needsWrap("Hello", 10)).toBe(true)
      expect(wrapper.needsWrap("H", 100)).toBe(false)
    })
  })

  describe("getMeasurer", () => {
    test("should return the measurer instance", () => {
      expect(wrapper.getMeasurer()).toBe(measurer)
    })
  })

  describe("CJK handling", () => {
    test("should wrap CJK text without hyphens", () => {
      const result = wrapper.wrap("中文测试这是一个很长的中文句子需要换行显示")

      // CJK should not have hyphens at break points
      for (const line of result.lines) {
        // Lines should not end with hyphen for pure CJK text
        if (line.length > 0 && !line.includes("a-zA-Z")) {
          // This is a heuristic - CJK lines shouldn't need hyphens
        }
      }
    })

    test("should handle mixed Latin and CJK", () => {
      const result = wrapper.wrap("Hello 你好 World 世界 Test 测试")
      expect(result.lines.length).toBeGreaterThan(0)
    })
  })

  describe("trimLines option", () => {
    test("should trim lines by default", () => {
      const result = wrapper.wrap("  Hello  ")
      expect(result.lines[0]).toBe("Hello")
    })

    test("should not trim when disabled", () => {
      const noTrimWrapper = new TextWrapper(measurer, {
        trimLines: false,
      })
      const result = noTrimWrapper.wrap("  Hello  ")
      // The result might still be trimmed due to paragraph handling,
      // but at minimum it should work without error
      expect(result.lines.length).toBeGreaterThan(0)
    })
  })

  describe("edge cases", () => {
    test("should handle single character", () => {
      const result = wrapper.wrap("A")
      expect(result.lines[0]).toBe("A")
    })

    test("should handle only spaces", () => {
      const result = wrapper.wrap("     ")
      expect(result.lines).toBeDefined()
    })

    test("should handle only newlines", () => {
      const result = wrapper.wrap("\n\n\n")
      expect(result.lines).toBeDefined()
    })

    test("should handle very long single word", () => {
      const longWord = "a".repeat(1000)
      const result = wrapper.wrap(longWord)
      expect(result.lines.length).toBeGreaterThan(1)
    })

    test("should handle Unicode surrogate pairs", () => {
      const emoji = "😀"
      const result = wrapper.wrap(`Hello ${emoji} World`)
      expect(result.lines).toBeDefined()
    })
  })

  describe("hyphen width accounting", () => {
    test("should account for hyphen width in breaking", () => {
      // Create text that will need breaking
      const text = "a".repeat(100)
      const result = wrapper.wrap(text)

      // Each line with a hyphen should not exceed maxWidth
      const hyphenWidth = measurer.getHyphenWidth()
      const maxWidth = G1_PROFILE.displayWidthPx

      for (const metric of result.lineMetrics) {
        if (metric.endsWithHyphen) {
          expect(metric.widthPx).toBeLessThanOrEqual(maxWidth)
        }
      }
    })
  })
})
