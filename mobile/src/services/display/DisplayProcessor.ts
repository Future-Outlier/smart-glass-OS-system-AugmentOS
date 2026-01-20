/**
 * DisplayProcessor
 *
 * Processes display events with pixel-accurate text wrapping using the same
 * display-utils library as the cloud. This ensures the mobile preview matches
 * exactly what is shown on the glasses.
 *
 * Key responsibilities:
 * 1. Intercept display events before sending to native SGC
 * 2. Wrap text using the correct device profile (G1, etc.)
 * 3. Ensure GlassesDisplayMirror shows exactly what glasses will show
 *
 * @see cloud/issues/026-mobile-display-processor for design docs
 */

import {
  createDisplayToolkit,
  G1_PROFILE,
  Z100_PROFILE,
  NEX_PROFILE,
  TextMeasurer,
  TextWrapper,
  DisplayHelpers,
  type DisplayProfile,
  type WrapOptions,
  type BreakMode,
} from "@mentra/display-utils"

// =============================================================================
// Types
// =============================================================================

/**
 * Supported device models for display processing
 */
export type DeviceModel = "g1" | "z100" | "nex" | "mach1" | "mentra-live" | "simulated" | "unknown"

/**
 * Display event types that we process
 */
export type DisplayLayoutType =
  | "text_wall"
  | "text_line"
  | "text_rows"
  | "reference_card"
  | "double_text_wall"
  | "bitmap_view"

/**
 * Raw display event from the cloud/WebSocket
 */
export interface DisplayEvent {
  view: "main" | "dashboard"
  layoutType?: DisplayLayoutType
  layout?: {
    layoutType: DisplayLayoutType
    text?: string | string[] // string for text_wall/text_line, string[] for text_rows
    title?: string
    topText?: string
    bottomText?: string
    data?: string // For bitmap_view
    [key: string]: unknown
  }
  text?: string | string[]
  title?: string
  topText?: string
  bottomText?: string
  [key: string]: unknown
}

/**
 * Processed display event with guaranteed wrapped text
 */
export interface ProcessedDisplayEvent extends DisplayEvent {
  /** Marks this event as processed */
  _processed: true
  /** The device profile used for processing */
  _profile: string
  /** Pre-split lines for text_wall/text_line (for easy rendering) */
  _lines?: string[]
}

/**
 * Options for the DisplayProcessor
 */
export interface DisplayProcessorOptions {
  /** Default break mode for text wrapping */
  breakMode?: BreakMode
  /** Whether to log processing details */
  debug?: boolean
}

// =============================================================================
// Device Profile Mapping
// =============================================================================

/**
 * Map device model names to display profiles
 */
const DEVICE_PROFILES: Record<DeviceModel, DisplayProfile> = {
  "g1": G1_PROFILE,
  "z100": Z100_PROFILE,
  "nex": NEX_PROFILE,
  "mach1": G1_PROFILE, // TODO: Create MACH1_PROFILE when specs are available
  "mentra-live": G1_PROFILE, // Mentra Live has no display, uses G1 as fallback
  "simulated": G1_PROFILE, // Simulated uses G1 profile
  "unknown": G1_PROFILE, // Default to G1
}

/**
 * Normalize various model name strings to our DeviceModel type
 */
function normalizeModelName(modelName: string | null | undefined): DeviceModel {
  if (!modelName) return "unknown"

  const lower = modelName.toLowerCase()

  if (lower.includes("g1") || lower.includes("even realities")) {
    return "g1"
  }
  if (lower.includes("z100") || lower.includes("vuzix")) {
    return "z100"
  }
  if (lower.includes("nex") || lower.includes("mentra display")) {
    return "nex"
  }
  if (lower.includes("mach1") || lower.includes("mach 1")) {
    return "mach1"
  }
  if (lower.includes("mentra live") || lower.includes("mentra-live")) {
    return "mentra-live"
  }
  if (lower.includes("simulated") || lower.includes("simulator")) {
    return "simulated"
  }

  return "unknown"
}

// =============================================================================
// DisplayProcessor Class
// =============================================================================

/**
 * Processes display events with pixel-accurate text wrapping.
 *
 * Usage:
 * ```typescript
 * const processor = DisplayProcessor.getInstance()
 *
 * // When glasses connect
 * processor.setDeviceModel("Even Realities G1")
 *
 * // Process display events
 * const processed = processor.processDisplayEvent(rawEvent)
 * ```
 */
export class DisplayProcessor {
  private static instance: DisplayProcessor | null = null

  private measurer: TextMeasurer
  private wrapper: TextWrapper
  private helpers: DisplayHelpers
  private profile: DisplayProfile
  private deviceModel: DeviceModel = "unknown"
  private options: DisplayProcessorOptions

  private constructor(options: DisplayProcessorOptions = {}) {
    this.options = {
      breakMode: "character",
      debug: false,
      ...options,
    }

    // Initialize with default G1 profile
    const toolkit = createDisplayToolkit(G1_PROFILE, {
      breakMode: this.options.breakMode,
      hyphenChar: "-",
      minCharsBeforeHyphen: 3,
    })

    this.measurer = toolkit.measurer
    this.wrapper = toolkit.wrapper
    this.helpers = toolkit.helpers
    this.profile = toolkit.profile
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(options?: DisplayProcessorOptions): DisplayProcessor {
    if (!DisplayProcessor.instance) {
      DisplayProcessor.instance = new DisplayProcessor(options)
    }
    return DisplayProcessor.instance
  }

  /**
   * Reset the singleton (useful for testing)
   */
  public static resetInstance(): void {
    DisplayProcessor.instance = null
  }

  // ===========================================================================
  // Device Profile Management
  // ===========================================================================

  /**
   * Set the device model and update the display profile accordingly.
   * Call this when glasses connect.
   *
   * @param modelName - The model name from the connected glasses (e.g., "Even Realities G1")
   */
  public setDeviceModel(modelName: string | null | undefined): void {
    const normalizedModel = normalizeModelName(modelName)

    if (normalizedModel === this.deviceModel) {
      return // No change needed
    }

    this.deviceModel = normalizedModel
    const newProfile = DEVICE_PROFILES[normalizedModel]

    if (newProfile !== this.profile) {
      this.updateProfile(newProfile)
    }

    if (this.options.debug) {
      console.log(`[DisplayProcessor] Device model set to: ${normalizedModel} (from: ${modelName})`)
    }
  }

  /**
   * Update the display profile and recreate toolkit
   */
  private updateProfile(newProfile: DisplayProfile): void {
    const toolkit = createDisplayToolkit(newProfile, {
      breakMode: this.options.breakMode,
      hyphenChar: "-",
      minCharsBeforeHyphen: 3,
    })

    this.measurer = toolkit.measurer
    this.wrapper = toolkit.wrapper
    this.helpers = toolkit.helpers
    this.profile = toolkit.profile

    if (this.options.debug) {
      console.log(`[DisplayProcessor] Profile updated to: ${newProfile.id}`)
    }
  }

  /**
   * Get the current device model
   */
  public getDeviceModel(): DeviceModel {
    return this.deviceModel
  }

  /**
   * Get the current display profile
   */
  public getProfile(): DisplayProfile {
    return this.profile
  }

  // ===========================================================================
  // Display Event Processing
  // ===========================================================================

  /**
   * Process a display event, wrapping text as needed.
   *
   * @param event - Raw display event from WebSocket
   * @returns Processed event with wrapped text
   */
  public processDisplayEvent(event: DisplayEvent): ProcessedDisplayEvent {
    // Already processed? Return as-is
    if ((event as ProcessedDisplayEvent)._processed) {
      return event as ProcessedDisplayEvent
    }

    // Get layout type from either root or nested layout object
    const layoutType = event.layoutType || event.layout?.layoutType
    const layout = event.layout || event

    if (!layoutType) {
      // No layout type - pass through
      return {
        ...event,
        _processed: true,
        _profile: this.profile.id,
      }
    }

    switch (layoutType) {
      case "text_wall":
      case "text_line":
        return this.processTextWall(event, layout)

      case "text_rows":
        return this.processTextRows(event, layout)

      case "reference_card":
        return this.processReferenceCard(event, layout)

      case "double_text_wall":
        return this.processDoubleTextWall(event, layout)

      case "bitmap_view":
        // Bitmap views don't need text processing
        return {
          ...event,
          _processed: true,
          _profile: this.profile.id,
        }

      default:
        // Unknown layout type - pass through
        if (this.options.debug) {
          console.log(`[DisplayProcessor] Unknown layout type: ${layoutType}`)
        }
        return {
          ...event,
          _processed: true,
          _profile: this.profile.id,
        }
    }
  }

  /**
   * Process text_wall or text_line layout
   */
  private processTextWall(
    event: DisplayEvent,
    layout: DisplayEvent | NonNullable<DisplayEvent["layout"]>,
  ): ProcessedDisplayEvent {
    // text_wall/text_line always have string text, not string[]
    const rawText = layout.text
    const text = typeof rawText === "string" ? rawText : ""

    // Wrap the text
    const lines = this.wrapText(text)
    const wrappedText = lines.join("\n")

    // Update both root and nested layout if present
    const processedLayout = event.layout
      ? {
          ...event.layout,
          text: wrappedText,
        }
      : undefined

    return {
      ...event,
      text: wrappedText,
      layout: processedLayout,
      _processed: true,
      _profile: this.profile.id,
      _lines: lines,
    }
  }

  /**
   * Process text_rows layout
   */
  private processTextRows(
    event: DisplayEvent,
    layout: DisplayEvent | NonNullable<DisplayEvent["layout"]>,
  ): ProcessedDisplayEvent {
    const textField = layout.text
    const rows: string[] = Array.isArray(textField) ? textField : []

    // Wrap each row
    const wrappedRows = rows.map((row: string) => {
      const lines = this.wrapText(row)
      return lines.join("\n")
    })

    const processedLayout = event.layout
      ? {
          ...event.layout,
          text: wrappedRows as string | string[],
        }
      : undefined

    return {
      ...event,
      text: wrappedRows as string | string[],
      layout: processedLayout,
      _processed: true,
      _profile: this.profile.id,
    }
  }

  /**
   * Process reference_card layout
   */
  private processReferenceCard(
    event: DisplayEvent,
    layout: DisplayEvent | NonNullable<DisplayEvent["layout"]>,
  ): ProcessedDisplayEvent {
    const title = layout.title || ""
    // reference_card text is always string, not string[]
    const rawText = layout.text
    const text = typeof rawText === "string" ? rawText : ""

    // Wrap title and text separately
    // Title typically gets 1 line, text gets remaining lines
    const wrappedTitle = this.wrapText(title, {maxLines: 1})
    const wrappedText = this.wrapText(text, {maxLines: this.profile.maxLines - 1})

    const processedLayout = event.layout
      ? {
          ...event.layout,
          title: wrappedTitle.join("\n"),
          text: wrappedText.join("\n"),
        }
      : undefined

    return {
      ...event,
      title: wrappedTitle.join("\n"),
      text: wrappedText.join("\n"),
      layout: processedLayout,
      _processed: true,
      _profile: this.profile.id,
    }
  }

  /**
   * Process double_text_wall layout
   */
  private processDoubleTextWall(
    event: DisplayEvent,
    layout: DisplayEvent | NonNullable<DisplayEvent["layout"]>,
  ): ProcessedDisplayEvent {
    const topText = layout.topText || ""
    const bottomText = layout.bottomText || ""

    // Double text wall splits the display in half
    // Each side gets ~50% of the width
    const halfWidthOptions: WrapOptions = {
      maxWidthPx: Math.floor(this.profile.displayWidthPx / 2) - 10, // Small gap between columns
    }

    const wrappedTop = this.wrapText(topText, halfWidthOptions)
    const wrappedBottom = this.wrapText(bottomText, halfWidthOptions)

    const processedLayout = event.layout
      ? {
          ...event.layout,
          topText: wrappedTop.join("\n"),
          bottomText: wrappedBottom.join("\n"),
        }
      : undefined

    return {
      ...event,
      topText: wrappedTop.join("\n"),
      bottomText: wrappedBottom.join("\n"),
      layout: processedLayout,
      _processed: true,
      _profile: this.profile.id,
    }
  }

  // ===========================================================================
  // Text Wrapping Utilities
  // ===========================================================================

  /**
   * Wrap text using the current profile
   *
   * @param text - Text to wrap
   * @param options - Optional override options
   * @returns Array of wrapped lines
   */
  public wrapText(text: string, options?: WrapOptions): string[] {
    if (!text) return [""]

    const result = this.wrapper.wrap(text, options)
    return result.lines
  }

  /**
   * Measure the pixel width of text
   *
   * @param text - Text to measure
   * @returns Width in pixels
   */
  public measureText(text: string): number {
    return this.measurer.measureText(text)
  }

  /**
   * Check if text fits on a single line
   *
   * @param text - Text to check
   * @returns true if text fits without wrapping
   */
  public fitsOnSingleLine(text: string): boolean {
    return this.measurer.measureText(text) <= this.profile.displayWidthPx
  }

  /**
   * Get the display width in pixels
   */
  public getDisplayWidth(): number {
    return this.profile.displayWidthPx
  }

  /**
   * Get the maximum number of lines
   */
  public getMaxLines(): number {
    return this.profile.maxLines
  }

  /**
   * Get detailed text measurement
   */
  public measureTextDetailed(text: string) {
    return this.measurer.measureTextDetailed(text)
  }

  // ===========================================================================
  // Break Mode Control
  // ===========================================================================

  /**
   * Set the break mode for text wrapping
   *
   * @param breakMode - 'character' | 'word' | 'strict-word'
   */
  public setBreakMode(breakMode: BreakMode): void {
    if (this.options.breakMode === breakMode) return

    this.options.breakMode = breakMode
    this.updateProfile(this.profile) // Recreate wrapper with new break mode

    if (this.options.debug) {
      console.log(`[DisplayProcessor] Break mode set to: ${breakMode}`)
    }
  }

  /**
   * Get the current break mode
   */
  public getBreakMode(): BreakMode {
    return this.options.breakMode || "character"
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

/**
 * Default DisplayProcessor instance
 */
export const displayProcessor = DisplayProcessor.getInstance()

export default displayProcessor
