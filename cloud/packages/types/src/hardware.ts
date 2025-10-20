/**
 * @mentra/types - Hardware capability types
 */

import { HardwareType, HardwareRequirementLevel } from "./enums";

/**
 * Hardware requirement for an app
 * Specifies what hardware components an app needs
 */
export interface HardwareRequirement {
  type: HardwareType;
  level: HardwareRequirementLevel;
  description?: string; // Why this hardware is needed
}

/**
 * Camera capabilities
 */
export interface CameraCapabilities {
  resolution?: { width: number; height: number };
  hasHDR?: boolean;
  hasFocus?: boolean;
  video: {
    canRecord: boolean;
    canStream: boolean;
    supportedStreamTypes?: string[];
    supportedResolutions?: { width: number; height: number }[];
  };
}

/**
 * Display capabilities
 */
export interface DisplayCapabilities {
  count?: number;
  isColor?: boolean;
  color?: string; // e.g., "green", "full_color", "pallet"
  canDisplayBitmap?: boolean;
  resolution?: { width: number; height: number };
  fieldOfView?: { horizontal?: number; vertical?: number };
  maxTextLines?: number;
  adjustBrightness?: boolean;
}

/**
 * Microphone capabilities
 */
export interface MicrophoneCapabilities {
  count?: number;
  hasVAD?: boolean; // Voice Activity Detection
}

/**
 * Speaker capabilities
 */
export interface SpeakerCapabilities {
  count?: number;
  isPrivate?: boolean; // e.g., bone conduction
}

/**
 * IMU (Inertial Measurement Unit) capabilities
 */
export interface IMUCapabilities {
  axisCount?: number;
  hasAccelerometer?: boolean;
  hasCompass?: boolean;
  hasGyroscope?: boolean;
}

/**
 * Button capabilities
 */
export interface ButtonCapabilities {
  count?: number;
  buttons?: {
    type: "press" | "swipe1d" | "swipe2d";
    events: string[]; // e.g., "press", "double_press", "long_press", "swipe_up", "swipe_down"
    isCapacitive?: boolean;
  }[];
}

/**
 * Light capabilities
 */
export interface LightCapabilities {
  count?: number;
  lights?: {
    isFullColor: boolean;
    color?: string; // e.g., "white", "rgb"
  }[];
}

/**
 * Power capabilities
 */
export interface PowerCapabilities {
  hasExternalBattery: boolean; // e.g., a case or puck
}

/**
 * Device hardware capabilities
 * Complete information about what hardware a device has
 */
export interface Capabilities {
  modelName: string;

  // Camera capabilities
  hasCamera: boolean;
  camera: CameraCapabilities | null;

  // Display capabilities
  hasDisplay: boolean;
  display: DisplayCapabilities | null;

  // Microphone capabilities
  hasMicrophone: boolean;
  microphone: MicrophoneCapabilities | null;

  // Speaker capabilities
  hasSpeaker: boolean;
  speaker: SpeakerCapabilities | null;

  // IMU capabilities
  hasIMU: boolean;
  imu: IMUCapabilities | null;

  // Button capabilities
  hasButton: boolean;
  button: ButtonCapabilities | null;

  // Light capabilities
  hasLight: boolean;
  light: LightCapabilities | null;

  // Power capabilities
  power: PowerCapabilities | null;

  // WiFi capability
  hasWifi: boolean;
}
