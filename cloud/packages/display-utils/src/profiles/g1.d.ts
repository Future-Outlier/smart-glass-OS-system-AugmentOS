import { DisplayProfile } from "./types";
/**
 * Even Realities G1 Smart Glasses Display Profile
 *
 * Verified through empirical testing with actual hardware.
 * See: line-width-debug-tool/line-width-spec.md
 */
export declare const G1_PROFILE: DisplayProfile;
/**
 * Get the hyphen width for G1 in rendered pixels.
 * Hyphen glyph = 4px → rendered = (4+1)*2 = 10px
 */
export declare const G1_HYPHEN_WIDTH_PX = 10;
/**
 * Get the space width for G1 in rendered pixels.
 * Space glyph = 2px → rendered = (2+1)*2 = 6px
 */
export declare const G1_SPACE_WIDTH_PX = 6;
//# sourceMappingURL=g1.d.ts.map