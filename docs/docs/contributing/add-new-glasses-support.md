# Adding Support for New Smart Glasses

This guide explains how to add support for new smart glasses to the MentraOS ecosystem. The process involves creating platform-specific communicators and updating the UI to recognize your glasses model.

## Overview

MentraOS supports different types of smart glasses through a modular architecture:

- **Android-based glasses** (like Mentra Live, TCL Rayneo, INMO Air) - Run Android OS directly
- **RTOS/Firmware-based glasses** (like Even Realities G1, Vuzix Z100) - Run custom firmware
- **Future glasses** - Any glasses that can communicate via Bluetooth/WiFi

## What is a SmartGlassesCommunicator (SGC)?

A SmartGlassesCommunicator (SGC) is the bridge between MentraOS and your specific smart glasses hardware. It handles:
- Bluetooth/USB connection to the glasses
- Translating MentraOS commands to your glasses' protocol
- Sending display data, audio, and control commands
- Receiving sensor data, button presses, and status updates

The data flow is: **Cloud → Phone App → SGC → Your Glasses**

## Implementation Paths

### For Android-Based Glasses

If your glasses run Android OS:

1. **Use the MentraOS ASG Client** - An Android app that runs on the glasses
   - See [MentraOS ASG Client Guidelines](/contributing/mentraos-asg-client-guidelines)
   - Modify device detection in the NetworkManager and BluetoothManager factories
   - The existing StandardBluetoothManager can work with most Android glasses

2. **Create an SGC in the phone app** to communicate with your glasses
   - Location: `android_core/` folder (Android) or `mobile/ios/` (iOS)
   - Your SGC will act as a BLE client connecting to the glasses' BLE server

### For RTOS/Firmware-Based Glasses

If your glasses run custom firmware:

1. **Review the firmware specification**
   - See [firmware_spec.md](https://github.com/AugmentOS/AugmentOS/blob/main/augmentos_mcu_client/firmware_spec.md)
   - Implement the required BLE services and characteristics
   - Handle display commands, sensor data, etc.

2. **Create an SGC** to communicate with your firmware
   - Implement the BLE client protocol matching your firmware

## Creating a SmartGlassesCommunicator (Android)

### 1. Create Your SGC Class

Location: `android_core/app/src/main/java/com/augmentos/android_core/smarterglassesmanager/smartglassescommunicators/`

Create a new Java file extending `SmartGlassesCommunicator`:

```java
package com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators;

public class YourGlassesSGC extends SmartGlassesCommunicator {
    private static final String TAG = "YourGlassesSGC";
    
    // BLE Service and Characteristic UUIDs
    private static final String SERVICE_UUID = "your-service-uuid";
    private static final String RX_CHAR_UUID = "your-rx-characteristic-uuid";
    private static final String TX_CHAR_UUID = "your-tx-characteristic-uuid";
    
    // Constructor
    public YourGlassesSGC(Context context, String glassesId) {
        super(context, glassesId);
        deviceModelName = "Your Glasses Model Name"; // Must match UI
    }
}
```

### 2. Implement Required Methods

#### Device Discovery

```java
@Override
public void findCompatibleDeviceNames() {
    BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
    
    if (adapter != null && adapter.isEnabled()) {
        Set<BluetoothDevice> pairedDevices = adapter.getBondedDevices();
        
        for (BluetoothDevice device : pairedDevices) {
            String deviceName = device.getName();
            if (deviceName != null && isYourGlassesDevice(deviceName)) {
                // Notify UI about found device
                EventBus.getDefault().post(
                    new GlassesBluetoothSearchDiscoverEvent(
                        deviceModelName,
                        deviceName
                    )
                );
            }
        }
    }
    
    // Signal search complete
    EventBus.getDefault().post(
        new GlassesBluetoothSearchStopEvent(deviceModelName)
    );
}
```

#### Connection Management

```java
@Override
public void connectToSmartGlasses() {
    connectionEvent(SmartGlassesConnectionState.CONNECTING);
    
    BluetoothDevice device = bluetoothAdapter.getRemoteDevice(deviceMacAddress);
    bluetoothGatt = device.connectGatt(context, false, gattCallback);
}
```

### 3. Handle Display Commands

Implement based on your glasses' capabilities:

```java
@Override
public void displayReferenceCardSimple(String title, String body) {
    // Convert text to your glasses' format
    // Send via BLE
}

@Override
public void displayBitmap(Bitmap bmp) {
    // Convert bitmap to your display format
    // Handle compression/chunking if needed
}
```

### 4. Register Your Glasses in the System

To make your glasses available in the system, you need to:

#### a. Create a SmartGlassesDevice class

In `android_core/app/src/main/java/com/augmentos/augmentos_core/smarterglassesmanager/supportedglasses/`:

```java
public class YourGlasses extends SmartGlassesDevice {
    public YourGlasses() {
        deviceModelName = "Your Glasses Model Name";
        deviceIconName = "your_glasses"; // Icon resource name
        manufacturer = "Your Company";
        glassesOs = SmartGlassesOperatingSystem.YOUR_GLASSES_OS; // Add this to enum
    }
}
```

#### b. Add your Operating System type

In `SmartGlassesOperatingSystem.java`, add your OS type:

```java
public enum SmartGlassesOperatingSystem {
    ANDROID_OS_GLASSES,
    SELF_OS_GLASSES,
    EVEN_REALITIES_G1_MCU_OS_GLASSES,
    MENTRA_LIVE_OS,
    YOUR_GLASSES_OS,  // Add your OS type
    // ... other OS types
}
```

#### c. Update SmartGlassesManager

In `SmartGlassesManager.java`, add your device to the supported list:

```java
public static SmartGlassesDevice getSmartGlassesDeviceFromModelName(String modelName) {
    ArrayList<SmartGlassesDevice> allDevices = new ArrayList<>(
        Arrays.asList(
            new VuzixUltralite(),
            new MentraLive(),
            new YourGlasses(),  // Add your glasses here
            // ... other devices
        )
    );
    
    for (SmartGlassesDevice device : allDevices) {
        if (device.deviceModelName.equals(modelName)) {
            return device;
        }
    }
    return null;
}
```

#### d. Map OS to SGC in SmartGlassesRepresentative

In `SmartGlassesRepresentative.java`, update the `createCommunicator()` method:

```java
private SmartGlassesCommunicator createCommunicator() {
    SmartGlassesCommunicator communicator;
    
    switch (smartGlassesDevice.getGlassesOs()) {
        // ... existing cases
        
        case YOUR_GLASSES_OS:
            communicator = new YourGlassesSGC(context, smartGlassesDevice);
            break;
            
        default:
            return null;
    }
    
    // Register audio callback if needed
    if (communicator != null && audioProcessingCallback != null) {
        communicator.registerAudioProcessingCallback(audioProcessingCallback);
    }
    
    return communicator;
}


## UI Integration

After creating your SGC, update the MentraOS Manager app UI:

### 1. Add to Glasses Model List

In `mobile/src/app/pairing/select-glasses-model.tsx`:

```javascript
const glassesOptions = Platform.select({
  android: [
    // ... existing models
    "Your Glasses Model Name", // Must match SGC deviceModelName
  ],
  ios: [
    // Add here if iOS is supported
  ],
})
```

### 2. Define Glasses Features

In `mobile/src/config/glassesFeatures.ts`:

```javascript
"Your Glasses Model Name": {
  camera: false,       // if it has a camera
  speakers: false,     // if it has speakers
  display: true,       // if it has a display
  binocular: false,    // if it has binocular displays
  wifi: false,         // if it has WiFi
  imu: false,          // if it has IMU/motion sensors
  micTypes: ["sco"],   // microphone types: ["none"], ["sco"], ["custom"], or ["sco", "custom"]
},
```

### 3. Add Glasses Image

1. Add your image to `mobile/assets/glasses/your-glasses-image.png`
2. Update `mobile/src/utils/getGlassesImage.tsx`:

```javascript
case "Your Glasses Model Name":
  return require("@/assets/glasses/your-glasses-image.png");
```

### 4. Create Pairing Guide

In `mobile/src/components/misc/GlassesPairingGuides.tsx`:

```javascript
const YourGlassesPairingGuide = () => (
  <View>
    <Text style={styles.subtitle}>How to pair Your Glasses:</Text>
    <Text style={styles.instructions}>
      1. Turn on your glasses{'\n'}
      2. Enable Bluetooth pairing mode{'\n'}
      3. Select your glasses from the list
    </Text>
  </View>
);
```

Update `mobile/src/utils/getPairingGuide.tsx`:

```javascript
case "Your Glasses Model Name":
  return <YourGlassesPairingGuide />;
```

## Testing Your Implementation

1. **Device Discovery**: Verify your glasses appear in the pairing list
2. **Connection**: Test connection/disconnection cycles
3. **Display**: Send test cards and bitmaps
4. **Events**: Verify battery, tap, and other events work
5. **Cleanup**: Ensure proper disconnect and resource cleanup

## Example Implementations

Study these existing SGCs for reference:

- **EvenRealitiesG1SGC.java** - Display-focused glasses with dual device support
- **MentraLiveSGC.java** - Audio-focused glasses with streaming capabilities
- **VuzixZ100SGC.java** - Simple display implementation

## Getting Help

- Join the [Discord community](https://discord.gg/5ukNvkEAqT)
- Review existing SGC implementations
- Post questions on GitHub issues
- Schedule a demo call to show your glasses and get guidance

## Important Notes

- **Naming consistency**: The device model name must match exactly across all files
- **Platform support**: Only add to iOS if you've implemented iOS support
- **Testing**: Test the complete flow from pairing to data exchange
- **Documentation**: Document any special pairing procedures or requirements