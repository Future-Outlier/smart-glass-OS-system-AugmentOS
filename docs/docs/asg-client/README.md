# ASG Client Documentation

The ASG (Android Smart Glasses) Client is the Android application that runs on smart glasses devices, providing the core functionality for MentraOS integration.

## Overview

ASG Client serves as the bridge between:

- Physical hardware (buttons, camera, sensors)
- MentraOS mobile app (via Bluetooth)
- MentraOS Cloud (via the mobile app relay)

Currently, the primary supported device is **Mentra Live**.

## Key Features

### 📸 Camera System

- Photo capture with configurable button modes
- Video recording (in development)
- Media upload queue with offline support

### 📹 RTMP Streaming

- Live video streaming to custom RTMP servers
- Keep-alive mechanism with 60-second timeout
- ACK-based reliability system

### 📶 Network Management

- WiFi connection management
- Hotspot creation for setup
- Network state monitoring

### 🔵 Bluetooth Communication

- BLE message parsing from mobile app
- Status updates to phone
- Command processing

### 🎮 Hardware Integration

- Button press detection (camera button)
- Swipe gesture recognition
- Battery status monitoring

## Architecture

The client uses a modular architecture with:

- **Manager Systems** - Interface-based factories for device abstraction
- **Service Components** - Specialized services for different functions
- **Event System** - Internal communication via EventBus

## Documentation

- [Getting Started](getting-started.md) - Setup and development environment
- [Mentra Live Guide](mentra-live.md) - Specific instructions for Mentra Live glasses
- [Architecture](architecture.md) - Detailed system architecture
- [Button System](button-system.md) - How button presses work
- [RTMP Streaming](rtmp-streaming.md) - Live streaming implementation
- [API Reference](api-reference.md) - Commands and message formats

## Quick Links

For developers:

- [Development Guidelines](/contributing/mentraos-asg-client-guidelines) - Code style and best practices
- [Adding Device Support](/contributing/add-new-glasses-support) - Supporting new glasses

For users:

- [Mentra Live Setup](mentra-live.md#setup) - Getting started with Mentra Live
- [Troubleshooting](troubleshooting.md) - Common issues and solutions
