/**
 * Bundle display-utils type declarations into a single .d.ts file
 *
 * This script reads the generated .d.ts files from display-utils and creates
 * a self-contained module declaration that can be published with the SDK.
 */

import {readFileSync, writeFileSync, existsSync} from "fs"
import {join} from "path"

const DISPLAY_UTILS_DIST = join(__dirname, "../../display-utils/dist")
const OUTPUT_FILE = join(__dirname, "../dist/display-utils.d.ts")

// Read the main index.d.ts from display-utils
const indexDtsPath = join(DISPLAY_UTILS_DIST, "index.d.ts")

if (!existsSync(indexDtsPath)) {
  console.error("❌ display-utils types not found at:", indexDtsPath)
  console.error("   Run 'bun run prebuild-display-utils-types' first")
  process.exit(1)
}

// Read all the type files we need
function readDts(relativePath: string): string {
  const fullPath = join(DISPLAY_UTILS_DIST, relativePath)
  if (!existsSync(fullPath)) {
    console.warn(`⚠️  Missing: ${relativePath}`)
    return ""
  }
  return readFileSync(fullPath, "utf-8")
}

// Extract type content (remove imports and clean up)
function extractTypes(content: string): string {
  return content
    // Remove import statements
    .replace(/^import\s+.*?;?\s*$/gm, "")
    // Remove export {} statements
    .replace(/^export\s*\{\s*\}\s*;?\s*$/gm, "")
    // Remove sourcemap comments
    .replace(/\/\/# sourceMappingURL=.*$/gm, "")
    // Clean up multiple blank lines
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

// Read all type definitions
const profilesTypes = readDts("profiles/types.d.ts")
const profilesG1 = readDts("profiles/g1.d.ts")
const profilesIndex = readDts("profiles/index.d.ts")
const measurerScript = readDts("measurer/script-detection.d.ts")
const measurerText = readDts("measurer/TextMeasurer.d.ts")
const measurerIndex = readDts("measurer/index.d.ts")
const wrapperTypes = readDts("wrapper/types.d.ts")
const wrapperText = readDts("wrapper/TextWrapper.d.ts")
const wrapperIndex = readDts("wrapper/index.d.ts")
const helpersDisplay = readDts("helpers/DisplayHelpers.d.ts")
const helpersScroll = readDts("helpers/ScrollView.d.ts")
const helpersIndex = readDts("helpers/index.d.ts")
const mainIndex = readDts("index.d.ts")

// Build the bundled declaration
const bundledDts = `/**
 * Type declarations for @mentra/display-utils
 *
 * Auto-generated from display-utils source.
 * Do not edit manually - run 'bun run build' to regenerate.
 */

declare module "@mentra/display-utils" {
  // ============================================================================
  // Profile Types
  // ============================================================================

${extractTypes(profilesTypes)
  .replace(/^export /gm, "  export ")
  .split("\n")
  .map((l) => (l.trim() ? "  " + l : l))
  .join("\n")}

  // ============================================================================
  // G1 Profiles
  // ============================================================================

${extractTypes(profilesG1)
  .replace(/^export /gm, "  export ")
  .replace(/^declare /gm, "  export ")
  .split("\n")
  .map((l) => (l.trim() ? "  " + l : l))
  .join("\n")}

  // ============================================================================
  // Script Detection
  // ============================================================================

${extractTypes(measurerScript)
  .replace(/^export /gm, "  export ")
  .replace(/^declare /gm, "  export ")
  .split("\n")
  .map((l) => (l.trim() ? "  " + l : l))
  .join("\n")}

  // ============================================================================
  // Text Measurer
  // ============================================================================

${extractTypes(measurerText)
  .replace(/^export /gm, "  export ")
  .replace(/^declare /gm, "  export ")
  .split("\n")
  .map((l) => (l.trim() ? "  " + l : l))
  .join("\n")}

  // ============================================================================
  // Wrapper Types
  // ============================================================================

${extractTypes(wrapperTypes)
  .replace(/^export /gm, "  export ")
  .split("\n")
  .map((l) => (l.trim() ? "  " + l : l))
  .join("\n")}

  // ============================================================================
  // Text Wrapper
  // ============================================================================

${extractTypes(wrapperText)
  .replace(/^export /gm, "  export ")
  .replace(/^declare /gm, "  export ")
  .split("\n")
  .map((l) => (l.trim() ? "  " + l : l))
  .join("\n")}

  // ============================================================================
  // Display Helpers
  // ============================================================================

${extractTypes(helpersDisplay)
  .replace(/^export /gm, "  export ")
  .replace(/^declare /gm, "  export ")
  .split("\n")
  .map((l) => (l.trim() ? "  " + l : l))
  .join("\n")}

  // ============================================================================
  // Scroll View
  // ============================================================================

${extractTypes(helpersScroll)
  .replace(/^export /gm, "  export ")
  .replace(/^declare /gm, "  export ")
  .split("\n")
  .map((l) => (l.trim() ? "  " + l : l))
  .join("\n")}

  // ============================================================================
  // Factory Functions
  // ============================================================================

${extractTypes(mainIndex)
  .replace(/^export /gm, "  export ")
  .replace(/^declare /gm, "  export ")
  // Remove re-exports since we've inlined everything
  .replace(/^\s*export\s*\{[^}]*\}\s*from\s*['"][^'"]*['"]\s*;?\s*$/gm, "")
  .split("\n")
  .map((l) => (l.trim() ? "  " + l : l))
  .join("\n")}
}
`

// Write the bundled declaration
writeFileSync(OUTPUT_FILE, bundledDts)
console.log("✅ Bundled display-utils types to:", OUTPUT_FILE)
