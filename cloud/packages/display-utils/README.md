# @mentra/display-utils

Glasses-agnostic, pixel-accurate text measurement and wrapping library for smart glasses displays.

## Features

- **Pixel-perfect measurement** - No abstract units or averages, exact pixel widths
- **Multiple break modes** - Character (100% utilization), word, or strict-word breaking
- **Full script support** - Latin, CJK, Korean, Cyrillic with proper handling
- **Configurable profiles** - Easy to add support for new glasses hardware
- **Hyphen-aware breaking** - Properly accounts for hyphen width in line calculations
- **ScrollView** - Scrollable viewport for long content (teleprompter, notes, etc.)

## Installation

```bash
bun add @mentra/display-utils
```

Or via the SDK:

```typescript
import { 
  TextMeasurer, 
  TextWrapper, 
  ScrollView,
  G1_PROFILE 
} from '@mentra/sdk/display-utils'
```

## Quick Start

```typescript
import { createG1Toolkit } from '@mentra/display-utils'

// Create toolkit with G1 defaults (character breaking for 100% utilization)
const { wrapper } = createG1Toolkit()

// Wrap text for display
const result = wrapper.wrap("Hello, world! This is a long text that needs wrapping.")

console.log(result.lines)
// ["Hello, world! This is a long text th-", "at needs wrapping."]

console.log(result.lineMetrics[0].utilizationPercent)
// 98 (nearly 100% line utilization!)
```

## Architecture

The library is organized in layers:

```
┌─────────────────────────────────────────┐
│  Layer 1: DisplayProfile                │  ← Hardware config (G1, future glasses)
├─────────────────────────────────────────┤
│  Layer 2: TextMeasurer                  │  ← Pixel-accurate measurement
├─────────────────────────────────────────┤
│  Layer 3: TextWrapper                   │  ← Generic wrapping with hyphenation
├─────────────────────────────────────────┤
│  Layer 4: DisplayHelpers & ScrollView   │  ← Optional conveniences
└─────────────────────────────────────────┘
```

## API Reference

### TextMeasurer

Measures text width in actual rendered pixels.

```typescript
import { TextMeasurer, G1_PROFILE } from '@mentra/display-utils'

const measurer = new TextMeasurer(G1_PROFILE)

// Measure text width
const width = measurer.measureText("Hello")  // 52px

// Measure single character
const charWidth = measurer.measureChar("m")  // 16px (widest Latin char)

// Check if text fits
const fits = measurer.fitsInWidth("Hello", 100)  // true

// Get byte size for BLE
const bytes = measurer.getByteSize("Hello")  // 5 bytes
```

### TextWrapper

Wraps text to fit display constraints with multiple break modes.

```typescript
import { TextMeasurer, TextWrapper, G1_PROFILE } from '@mentra/display-utils'

const measurer = new TextMeasurer(G1_PROFILE)
const wrapper = new TextWrapper(measurer, {
  breakMode: 'character',  // 100% line utilization
  hyphenChar: '-',
  minCharsBeforeHyphen: 3,
})

// Full wrap with metadata
const result = wrapper.wrap("Your long text here")
console.log(result.lines)           // Wrapped lines
console.log(result.truncated)       // Was content truncated?
console.log(result.lineMetrics)     // Per-line stats

// Simple wrap (just lines)
const lines = wrapper.wrapToLines("Your text")
```

#### Break Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `character` | Break mid-word with hyphen | Maximum utilization (captions) |
| `word` | Break at word boundaries, hyphenate long words | Natural reading |
| `strict-word` | Word boundaries only, no hyphenation | Proper nouns, code |

### DisplayHelpers

Optional convenience utilities for common operations.

```typescript
import { createG1Toolkit } from '@mentra/display-utils'

const { helpers } = createG1Toolkit()

// Truncate with ellipsis
const truncated = helpers.truncateWithEllipsis("Very long title", 200)
// { text: "Very long ti...", wasTruncated: true, ... }

// Paginate long text into discrete pages
const pages = helpers.paginate("Your very long text...")
// [{ lines: [...], pageNumber: 1, totalPages: 3, isFirst: true }, ...]

// Split for BLE transmission
const chunks = helpers.splitIntoChunks("Text to send", 176)
// [{ text: "...", index: 0, totalChunks: 2, bytes: 174 }, ...]

// Pad lines for consistent display
const padded = helpers.padToLineCount(lines, 5)
```

### ScrollView

Scrollable viewport for long content. Unlike pagination (discrete pages), ScrollView allows continuous line-by-line scrolling.

```typescript
import { ScrollView, TextMeasurer, TextWrapper, G1_PROFILE } from '@mentra/display-utils'

const measurer = new TextMeasurer(G1_PROFILE)
const wrapper = new TextWrapper(measurer)
const scrollView = new ScrollView(measurer, wrapper)

// Load content
scrollView.setContent("Very long text that spans many lines...")

// Get current viewport (visible lines)
const viewport = scrollView.getViewport()
console.log(viewport.lines)  // 5 visible lines
console.log(viewport.position.scrollPercent)  // 0 (at top)

// Scroll navigation
scrollView.scrollDown(1)      // Down 1 line
scrollView.scrollUp(2)        // Up 2 lines
scrollView.pageDown()         // Down by viewport size (5 lines)
scrollView.pageUp()           // Up by viewport size
scrollView.scrollToTop()      // Jump to start
scrollView.scrollToBottom()   // Jump to end
scrollView.scrollToPercent(50) // Jump to middle

// Check position
scrollView.isAtTop()          // true/false
scrollView.isAtBottom()       // true/false
scrollView.isScrollable()     // true if content > viewport
```

#### ScrollView vs Pages vs Chunks

| Feature | **Chunks** | **Pages** | **ScrollView** |
|---------|-----------|-----------|----------------|
| **Purpose** | BLE transmission | Discrete navigation | Continuous navigation |
| **Unit** | Bytes | Screen-fulls | Lines |
| **Navigation** | Sequential send | Jump to page N | Line-by-line or jump |
| **Use Case** | Sending data over BLE | Presentations | Teleprompter, reading |

#### Teleprompter Example

```typescript
import { createG1Toolkit, ScrollView } from '@mentra/display-utils'

class TeleprompterApp {
  private scrollView: ScrollView
  private autoScrollInterval: Timer | null = null
  
  constructor() {
    const { measurer, wrapper } = createG1Toolkit()
    this.scrollView = new ScrollView(measurer, wrapper)
  }
  
  loadScript(script: string) {
    this.scrollView.setContent(script)
  }
  
  // Manual controls
  scrollUp() { 
    this.scrollView.scrollUp(1) 
    return this.scrollView.getViewport().lines
  }
  
  scrollDown() { 
    this.scrollView.scrollDown(1)
    return this.scrollView.getViewport().lines
  }
  
  // Auto-scroll for speaking pace
  startAutoScroll(linesPerSecond: number = 0.5) {
    const intervalMs = 1000 / linesPerSecond
    this.autoScrollInterval = setInterval(() => {
      if (!this.scrollView.isAtBottom()) {
        this.scrollView.scrollDown(1)
        this.onUpdate(this.scrollView.getViewport().lines)
      } else {
        this.stopAutoScroll()
      }
    }, intervalMs)
  }
  
  stopAutoScroll() {
    if (this.autoScrollInterval) {
      clearInterval(this.autoScrollInterval)
      this.autoScrollInterval = null
    }
  }
  
  // Progress indicator
  getProgress() {
    const pos = this.scrollView.getPosition()
    return { 
      percent: pos.scrollPercent, 
      atEnd: pos.atBottom,
      currentLine: pos.offset + 1,
      totalLines: pos.totalLines
    }
  }
  
  private onUpdate(lines: string[]) {
    // Send to glasses display
  }
}
```

#### Notes/Document Reader Example

```typescript
import { createG1Toolkit, ScrollView } from '@mentra/display-utils'

class NotesReader {
  private scrollView: ScrollView
  
  constructor() {
    const { measurer, wrapper } = createG1Toolkit()
    this.scrollView = new ScrollView(measurer, wrapper)
  }
  
  loadNote(content: string) {
    this.scrollView.setContent(content)
  }
  
  // Button/gesture handlers
  onSwipeUp() { 
    this.scrollView.scrollUp(2) 
    return this.getDisplay()
  }
  
  onSwipeDown() { 
    this.scrollView.scrollDown(2) 
    return this.getDisplay()
  }
  
  onDoubleTap() { 
    this.scrollView.scrollToTop() 
    return this.getDisplay()
  }
  
  getDisplay() {
    return this.scrollView.getViewport().lines
  }
  
  getScrollIndicator(): string {
    const pos = this.scrollView.getPosition()
    if (!this.scrollView.isScrollable()) return ""
    if (pos.atTop) return "▼ more below"
    if (pos.atBottom) return "▲ more above"
    return `▲▼ ${pos.scrollPercent}%`
  }
}
```

#### Streaming Content with Auto-Scroll

```typescript
// For append-only content (NOT for captions with interim replacement)
const scrollView = new ScrollView(measurer, wrapper)

// Append new content - auto-scrolls if already at bottom
scrollView.appendContent("New message arrived\n")

// Disable auto-scroll to let user read history
scrollView.appendContent("Another message\n", undefined, false)
```

> **Note:** ScrollView is NOT suitable for live captions because captions have interim 
> replacements (same text updated multiple times before becoming final). Use 
> `CaptionsFormatter` for that use case instead.

## Display Profiles

### G1 Profile (Default)

```typescript
import { G1_PROFILE } from '@mentra/display-utils'

// G1 specs:
// - Display width: 576px
// - Max lines: 5
// - Max payload: 390 bytes
// - BLE chunk: 176 bytes
```

### Adding New Glasses

```typescript
import { DisplayProfile, TextMeasurer, TextWrapper } from '@mentra/display-utils'

const MY_GLASSES_PROFILE: DisplayProfile = {
  id: 'my-glasses-v1',
  name: 'My Glasses V1',
  displayWidthPx: 800,
  maxLines: 7,
  maxPayloadBytes: 500,
  bleChunkSize: 200,
  fontMetrics: {
    glyphWidths: new Map([
      ['a', 6], ['b', 6], // ... etc
    ]),
    defaultGlyphWidth: 6,
    renderFormula: (gw) => gw * 2,
    uniformScripts: {
      cjk: 20,
      hiragana: 20,
      katakana: 20,
      korean: 26,
      cyrillic: 20,
    },
    fallback: {
      latinMaxWidth: 18,
      unknownBehavior: 'useLatinMax',
    },
  },
}

// Use with new profile
const measurer = new TextMeasurer(MY_GLASSES_PROFILE)
const wrapper = new TextWrapper(measurer)
```

## Script Support

| Script | Strategy | Width |
|--------|----------|-------|
| Latin | Per-character glyph map | 4-16px (exact) |
| CJK (Chinese/Japanese) | Uniform | 18px (all chars) |
| Japanese Hiragana/Katakana | Uniform | 18px (all chars) |
| Korean Hangul | Uniform | 24px (all chars) |
| Cyrillic | Uniform | 18px (all chars) |
| Unknown Latin | Max fallback | 16px (safe) |

```typescript
import { detectScript, isCJKCharacter } from '@mentra/display-utils'

detectScript('a')    // 'latin'
detectScript('你')   // 'cjk'
detectScript('안')   // 'korean'
detectScript('Б')    // 'cyrillic'

isCJKCharacter('你') // true - can break anywhere without hyphen
```

## Key Principles

### ⚠️ Pixel-Perfect Measurement (No Averages!)

This library uses **exact pixel widths**, not averages:

- **Latin characters**: Exact width from glyph map (e.g., 'l' = 4px, 'm' = 16px)
- **Uniform scripts**: Verified uniform width (e.g., ALL CJK = 18px)
- **Unknown chars**: MAX width fallback (safe, never overflow)

### Hyphen Width Accounting

When breaking with hyphens, the library properly reserves space:

```
Wrong: "The quick brown fox jumps over the lazy dog    " (570px)
       + hyphen (10px) = 580px → OVERFLOW!

Right: "The quick brown fox jumps over the lazy do-" (568px)
       558px text + 10px hyphen = 568px ✓
```

## Migration from TranscriptProcessor

If migrating from the old `TranscriptProcessor`:

```typescript
// Old
const processor = new TranscriptProcessor(48, 5, 30)
const text = processor.processString(newText, isFinal, speakerId)

// New - for captions with speaker labels
import { CaptionsFormatter } from '@mentra/captions'
const formatter = new CaptionsFormatter()
const result = formatter.processTranscription(newText, isFinal, speakerId, speakerChanged)

// New - for simple text wrapping
import { createG1Toolkit } from '@mentra/display-utils'
const { wrapper, helpers } = createG1Toolkit()
const result = wrapper.wrap(displayText)
const lines = helpers.padToLineCount(result.lines, 5)
```

## License

MIT