/**
 * @fileoverview Mentra Live Hardware Capabilities
 *
 * Capability profile for the Mentra Live smart glasses model.
 * Defines the hardware and software features available on this device.
 */

import type { Capabilities } from '@mentra/sdk';

/**
 * Mentra Live capability profile
 */
export const mentraLive: Capabilities = {
  modelName: "Mentra Live",

  // Camera capabilities - Mentra Live has camera with streaming
  hasCamera: true,
  camera: {
    resolution: { width: 1920, height: 1080 },
    hasHDR: false,
    hasFocus: true,
    video: {
      canRecord: true,
      canStream: true,
      supportedStreamTypes: ['rtmp'],
      supportedResolutions: [
        { width: 1920, height: 1080 },
        { width: 1280, height: 720 },
        { width: 640, height: 480 }
      ]
    }
  },

  // Screen capabilities - Mentra Live does not have a screen
  hasScreen: false,
  screen: null,

  // Microphone capabilities - Mentra Live has one microphone with VAD
  hasMicrophone: true,
  microphone: {
    count: 1,
    hasVAD: true,
  },

  // Speaker capabilities - Mentra Live has one standard speaker
  hasSpeaker: true,
  speaker: {
    count: 1,
    isPrivate: false
  },

  // IMU capabilities - Mentra Live has 6-axis IMU
  hasIMU: true,
  imu: {
    axisCount: 6,
    hasAccelerometer: true,
    hasCompass: false,
    hasGyroscope: true
  },

  // Button capabilities - Mentra Live has one physical button
  hasButton: true,
  button: {
    count: 1,
    buttons: [{
      type: 'press',
      events: ['press', 'double_press', 'long_press'],
      isCapacitive: false
    }]
  },

  // Light capabilities - Mentra Live has one white light
  hasLight: true,
  light: {
    count: 1,
    lights: [{
      isFullColor: false,
      color: 'white'
    }]
  },

  // Power capabilities - Mentra Live does not have external battery
  power: {
    hasExternalBattery: false
  },

  // WiFi capabilities - Mentra Live supports WiFi
  hasWifi: true,
};