import {getTextVisualWidth, getCharWidth, isCJKCharacter, VISUAL_WIDTH_SAFETY_MARGIN} from "./visualWidth"

/**
 * Entry in the transcript history that preserves speaker information
 */
export interface TranscriptHistoryEntry {
  text: string
  speakerId?: string
  hadSpeakerChange: boolean
}

export class TranscriptProcessor {
  private maxVisualWidth: number // Maximum visual width per line (not character count)
  private maxLines: number
  private lines: string[]
  private partialText: string
  private lastUserTranscript: string
  private finalTranscriptHistory: TranscriptHistoryEntry[] // Array to store history of final transcripts with speaker info
  private maxFinalTranscripts: number // Max number of final transcripts to keep
  private currentDisplayLines: string[] // Track current display lines to maintain consistency
  private lastSpeakerId: string | undefined = undefined // Track last speaker for combining history
  private partialSpeakerId: string | undefined = undefined // Track speaker ID of current partial
  private partialHadSpeakerChange: boolean = false // Track if current partial represents a speaker change

  /**
   * Create a new TranscriptProcessor
   *
   * @param maxVisualWidth - Maximum visual width per line (1 unit = 1 Latin char, CJK = 2 units)
   * @param maxLines - Maximum number of lines to display
   * @param maxFinalTranscripts - Maximum number of final transcripts to keep in history
   * @param _isChinese - Deprecated: No longer used, visual width handles all languages automatically
   */
  constructor(
    maxVisualWidth: number,
    maxLines: number,
    maxFinalTranscripts: number = 3,
    _isChinese: boolean = false, // Kept for backwards compatibility but no longer used
  ) {
    this.maxVisualWidth = maxVisualWidth
    this.maxLines = maxLines
    this.lastUserTranscript = ""
    this.lines = []
    this.partialText = ""
    this.finalTranscriptHistory = [] // Initialize empty history
    this.maxFinalTranscripts = maxFinalTranscripts // Default to 3 if not specified
    this.currentDisplayLines = [] // Initialize display lines
  }

  /**
   * Process a transcription string and format it for display
   *
   * @param newText - The new transcription text
   * @param isFinal - Whether this is a final transcription
   * @param speakerId - Optional speaker ID from diarization
   * @param speakerChanged - Whether the speaker changed from the previous transcription
   * @returns Formatted string for display
   */
  public processString(
    newText: string | null,
    isFinal: boolean,
    speakerId?: string,
    speakerChanged?: boolean,
  ): string {
    newText = newText === null ? "" : newText.trim()

    if (!isFinal) {
      // Store this as the current partial text (overwriting old partial)
      this.partialText = newText
      this.lastUserTranscript = newText

      // Track speaker info for this partial
      // If speakerChanged is true, remember it for subsequent interims from the same speaker
      // This fixes the bug where the label disappears on the 2nd, 3rd, etc. interim
      if (speakerChanged && speakerId) {
        this.partialSpeakerId = speakerId
        this.partialHadSpeakerChange = true
      } else if (speakerId && speakerId !== this.partialSpeakerId) {
        // Different speaker than tracked partial - this is a new speaker change
        this.partialSpeakerId = speakerId
        this.partialHadSpeakerChange = true
      }
      // If same speaker as tracked partial, keep partialHadSpeakerChange as-is

      // Build display text from history + partial, using tracked speaker info
      const displayText = this.buildDisplayText(newText, this.partialSpeakerId, this.partialHadSpeakerChange)
      this.currentDisplayLines = this.wrapTextByVisualWidth(displayText)

      // Ensure we have exactly maxLines
      while (this.currentDisplayLines.length < this.maxLines) {
        this.currentDisplayLines.push("")
      }
      while (this.currentDisplayLines.length > this.maxLines) {
        this.currentDisplayLines.shift()
      }

      return this.currentDisplayLines.join("\n")
    } else {
      // We have a final text -> clear out the partial text to avoid duplication
      this.partialText = ""

      // Use tracked partial speaker info if available (for when final comes after interims)
      const finalSpeakerId = speakerId || this.partialSpeakerId
      const finalSpeakerChanged = speakerChanged || this.partialHadSpeakerChange

      // Clear partial speaker tracking since we're finalizing
      this.partialSpeakerId = undefined
      this.partialHadSpeakerChange = false

      // Add to transcript history when it's a final transcript
      this.addToTranscriptHistory(newText, finalSpeakerId, finalSpeakerChanged)

      // Build display text from history only (no partial)
      const displayText = this.buildDisplayText("", undefined, false)
      this.currentDisplayLines = this.wrapTextByVisualWidth(displayText)

      // Ensure we have exactly maxLines
      while (this.currentDisplayLines.length < this.maxLines) {
        this.currentDisplayLines.push("")
      }
      while (this.currentDisplayLines.length > this.maxLines) {
        this.currentDisplayLines.shift()
      }

      return this.currentDisplayLines.join("\n")
    }
  }

  /**
   * Build the display text from history and optional partial text
   * Adds speaker labels [N]: when speaker changes, always on a new line
   */
  private buildDisplayText(partialText: string, partialSpeakerId?: string, partialSpeakerChanged?: boolean): string {
    let result = ""

    // Add history entries with speaker labels
    for (const entry of this.finalTranscriptHistory) {
      if (entry.hadSpeakerChange && entry.speakerId) {
        // Speaker change: add newline before label (if not at start)
        if (result.length > 0) {
          result += "\n"
        }
        result += `[${entry.speakerId}]: ${entry.text}`
      } else {
        // Same speaker: append with space
        if (result.length > 0) {
          result += " "
        }
        result += entry.text
      }
    }

    // Add partial text if present
    if (partialText) {
      if (partialSpeakerChanged && partialSpeakerId) {
        // Speaker change: add newline before label (if not at start)
        if (result.length > 0) {
          result += "\n"
        }
        result += `[${partialSpeakerId}]: ${partialText}`
      } else {
        // Same speaker: append with space
        if (result.length > 0) {
          result += " "
        }
        result += partialText
      }
    }

    return result
  }

  /**
   * Add a transcript to history with speaker information
   */
  private addToTranscriptHistory(transcript: string, speakerId?: string, speakerChanged?: boolean): void {
    if (transcript.trim() === "") return // Don't add empty transcripts

    const entry: TranscriptHistoryEntry = {
      text: transcript,
      speakerId,
      hadSpeakerChange: speakerChanged || false,
    }

    this.finalTranscriptHistory.push(entry)

    // Track the speaker for future reference
    if (speakerId) {
      this.lastSpeakerId = speakerId
    }

    // Ensure we don't exceed maxFinalTranscripts
    while (this.finalTranscriptHistory.length > this.maxFinalTranscripts) {
      this.finalTranscriptHistory.shift() // Remove oldest transcript
    }
  }

  /**
   * Get the transcript history with speaker information preserved
   */
  public getFinalTranscriptHistory(): TranscriptHistoryEntry[] {
    return [...this.finalTranscriptHistory] // Return a copy to prevent external modification
  }

  /**
   * Get combined transcript history as a single string (for backwards compatibility)
   * Note: This doesn't include speaker labels - use buildDisplayText for that
   */
  public getCombinedTranscriptHistory(): string {
    return this.finalTranscriptHistory.map((entry) => entry.text).join(" ")
  }

  // Get current display lines (for refreshing display after settings change)
  public getCurrentDisplayLines(): string[] {
    return [...this.currentDisplayLines]
  }

  // Get current display as formatted string
  public getCurrentDisplay(): string {
    return this.currentDisplayLines.join("\n")
  }

  // Method to set max final transcripts
  public setMaxFinalTranscripts(maxFinalTranscripts: number): void {
    this.maxFinalTranscripts = maxFinalTranscripts
    // Trim history if needed after changing the limit
    while (this.finalTranscriptHistory.length > this.maxFinalTranscripts) {
      this.finalTranscriptHistory.shift()
    }
  }

  // Get max final transcripts
  public getMaxFinalTranscripts(): number {
    return this.maxFinalTranscripts
  }

  /**
   * Wrap text by visual width instead of character count
   * This properly handles mixed CJK and Latin text
   * Preserves explicit newlines (used for speaker change labels)
   *
   * @param text - Text to wrap
   * @returns Array of wrapped lines
   */
  private wrapTextByVisualWidth(text: string): string[] {
    if (!text || text.trim() === "") {
      return [""]
    }

    const result: string[] = []
    const safeMaxWidth = this.maxVisualWidth * VISUAL_WIDTH_SAFETY_MARGIN

    // Split by explicit newlines first (from speaker changes)
    const paragraphs = text.split("\n")

    for (const paragraph of paragraphs) {
      let remaining = paragraph.trim()

      if (remaining === "") {
        // Preserve empty lines if needed
        continue
      }

      while (remaining.length > 0) {
        // Check if remaining text fits in one line
        const remainingWidth = getTextVisualWidth(remaining)
        if (remainingWidth <= safeMaxWidth) {
          result.push(remaining)
          break
        }

        // Find the best break point within visual width limit
        const breakIndex = this.findVisualWidthBreakpoint(remaining, safeMaxWidth)

        if (breakIndex <= 0) {
          // Edge case: single character/word too wide, force break
          result.push(remaining.charAt(0))
          remaining = remaining.substring(1).trim()
        } else {
          const line = remaining.substring(0, breakIndex).trim()
          result.push(line)
          remaining = remaining.substring(breakIndex).trim()
        }
      }
    }

    return result.length > 0 ? result : [""]
  }

  /**
   * Find the best break point within visual width limit
   * Prefers breaking at word boundaries (spaces) or after CJK characters
   *
   * @param text - Text to find break point in
   * @param maxWidth - Maximum visual width
   * @returns Index of break point
   */
  private findVisualWidthBreakpoint(text: string, maxWidth: number): number {
    let currentWidth = 0
    let lastGoodBreakpoint = 0

    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      const charWidth = getCharWidth(char)

      // Would this character exceed the limit?
      if (currentWidth + charWidth > maxWidth) {
        // Return the last good breakpoint, or current position if none found
        return lastGoodBreakpoint > 0 ? lastGoodBreakpoint : i
      }

      currentWidth += charWidth

      // Track good breakpoints:
      // 1. After a space (for Latin text word boundaries)
      // 2. After a CJK character (CJK can break anywhere)
      // 3. Before a CJK character following non-CJK
      if (char === " ") {
        lastGoodBreakpoint = i + 1 // Break after the space
      } else if (isCJKCharacter(char)) {
        lastGoodBreakpoint = i + 1 // Can break after any CJK character
      } else if (i + 1 < text.length && isCJKCharacter(text[i + 1]) && !isCJKCharacter(char)) {
        // Before a CJK character that follows non-CJK
        lastGoodBreakpoint = i + 1
      }
    }

    // If we get here, entire text fits
    return text.length
  }

  private appendToLines(chunk: string): void {
    if (this.lines.length === 0) {
      this.lines.push(chunk)
    } else {
      const lastLine = this.lines.pop() as string
      const candidate = lastLine === "" ? chunk : lastLine + " " + chunk
      const candidateWidth = getTextVisualWidth(candidate)

      if (candidateWidth <= this.maxVisualWidth * VISUAL_WIDTH_SAFETY_MARGIN) {
        this.lines.push(candidate)
      } else {
        // Put back the last line if it doesn't fit
        this.lines.push(lastLine)
        this.lines.push(chunk)
      }
    }

    // Ensure we don't exceed maxLines
    while (this.lines.length > this.maxLines) {
      this.lines.shift()
    }
  }

  public getTranscript(): string {
    // Create a copy of the lines for manipulation
    const allLines = [...this.lines]

    // Add padding to ensure exactly maxLines are displayed
    const linesToPad = this.maxLines - allLines.length
    for (let i = 0; i < linesToPad; i++) {
      allLines.push("") // Add empty lines at the end
    }

    const finalString = allLines.join("\n")

    // Clear the lines
    this.lines = []
    return finalString
  }

  public getLastUserTranscript(): string {
    return this.lastUserTranscript
  }

  public clear(): void {
    this.lines = []
    this.partialText = ""
    this.finalTranscriptHistory = []
    this.currentDisplayLines = []
    this.lastSpeakerId = undefined
    this.partialSpeakerId = undefined
    this.partialHadSpeakerChange = false
  }

  public getMaxVisualWidth(): number {
    return this.maxVisualWidth
  }

  /**
   * @deprecated Use getMaxVisualWidth() instead. Kept for backwards compatibility.
   */
  public getMaxCharsPerLine(): number {
    return this.maxVisualWidth
  }

  public getMaxLines(): number {
    return this.maxLines
  }
}
