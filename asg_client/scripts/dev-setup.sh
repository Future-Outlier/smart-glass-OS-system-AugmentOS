#!/bin/bash
#
# dev-setup.sh - Install your custom asg_client on Mentra Live
#
# This script builds your debug APK, replaces the factory app, and grants
# all required permissions.
#
# IMPORTANT: The factory asg_client is signed with Mentra's release key.
# You cannot "update" it - you must uninstall it first. This script handles
# that safely by only uninstalling after your build succeeds.
#
# Usage:
#   1. Connect to your Mentra Live via ADB (USB or WiFi)
#   2. Run: ./scripts/dev-setup.sh
#
# To restore stock firmware later:
#   ./scripts/restore-stock.sh
#

set -e

PKG="com.mentra.asg_client"
APK_PATH="app/build/outputs/apk/debug/app-debug.apk"

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                         ⚠️  WARNING                            ║"
echo "╠════════════════════════════════════════════════════════════════╣"
echo "║  This script will:                                             ║"
echo "║    • Remove Mentra's official asg_client from your glasses     ║"
echo "║    • Install your custom debug build instead                   ║"
echo "║                                                                ║"
echo "║  After running this:                                           ║"
echo "║    • You will NOT receive OTA updates from Mentra              ║"
echo "║    • You are responsible for your own builds                   ║"
echo "║                                                                ║"
echo "║  DO NOT interrupt this script once it starts.                  ║"
echo "║                                                                ║"
echo "║  To restore stock firmware later:                              ║"
echo "║    ./scripts/restore-stock.sh                                  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
read -p "Proceed? [y/N] " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo "=== Mentra Live Development Setup ==="
echo ""

# Check for ADB connection
if ! adb devices | grep -q "device$"; then
    echo "ERROR: No ADB device connected."
    echo ""
    echo "To connect to your Mentra Live:"
    echo ""
    echo "  Option 1 - USB Cable (recommended):"
    echo "    Attach the magnetic USB-C clip-on cable and run 'adb devices'"
    echo ""
    echo "  Option 2 - WiFi:"
    echo "    1. Pair your glasses in the MentraOS app"
    echo "    2. Connect glasses to your WiFi network"
    echo "    3. Get the IP from the 'Glasses' screen in the app"
    echo "    4. Run: adb connect <IP_ADDRESS>:5555"
    echo ""
    exit 1
fi

echo "Connected device:"
adb devices | grep "device$"
echo ""

# Step 1: Build the debug APK
echo "=== Building Debug APK ==="
echo ""
echo "Building... (this may take a minute)"
if ./gradlew assembleDebug; then
    echo ""
    echo "Build succeeded."
else
    echo ""
    echo "ERROR: Build failed. Factory app NOT modified."
    echo "Fix build errors and try again."
    exit 1
fi

# Verify APK exists
if [ ! -f "$APK_PATH" ]; then
    echo "ERROR: APK not found at $APK_PATH"
    echo "Build may have failed silently. Factory app NOT modified."
    exit 1
fi

echo ""

# Step 2: Uninstall factory app (only now that we have a working build)
echo "=== Removing Factory App ==="
echo ""
if adb shell pm list packages | grep -q "$PKG"; then
    echo "Uninstalling factory app for user 0..."
    adb shell pm uninstall --user 0 "$PKG" 2>/dev/null || true
    echo "Factory app disabled."
else
    echo "Factory app already removed."
fi

echo ""

# Step 3: Install custom APK
# Note: After uninstalling for user 0, the package manager can be in a weird state.
# We install the APK, then run install-existing to properly register it.
echo "=== Installing Your Build ==="
echo ""
echo "Installing $APK_PATH..."
if adb install -r "$APK_PATH"; then
    echo "APK installed."
else
    echo ""
    echo "Install failed. Attempting to fix package state..."
    # Fix corrupted package manager state
    adb shell cmd package install-existing "$PKG" 2>/dev/null || true
    adb shell pm uninstall --user 0 "$PKG" 2>/dev/null || true

    if adb install -r "$APK_PATH"; then
        echo "APK installed (after cleanup)."
    else
        echo ""
        echo "ERROR: Install still failed."
        echo "Try: adb reboot && ./scripts/dev-setup.sh"
        exit 1
    fi
fi

# Fix package registration - required after uninstalling system app for user 0
echo "Registering package..."
adb shell cmd package install-existing "$PKG" 2>/dev/null || true
echo "Install succeeded."

echo ""

# Step 4: Grant permissions
echo "=== Granting Permissions ==="
echo ""

PERMISSIONS=(
    "android.permission.CAMERA"
    "android.permission.RECORD_AUDIO"
    "android.permission.ACCESS_FINE_LOCATION"
    "android.permission.ACCESS_COARSE_LOCATION"
    "android.permission.ACCESS_BACKGROUND_LOCATION"
    "android.permission.BLUETOOTH"
    "android.permission.BLUETOOTH_ADMIN"
    "android.permission.BLUETOOTH_CONNECT"
    "android.permission.BLUETOOTH_SCAN"
    "android.permission.BLUETOOTH_ADVERTISE"
    "android.permission.READ_EXTERNAL_STORAGE"
    "android.permission.WRITE_EXTERNAL_STORAGE"
    "android.permission.READ_MEDIA_IMAGES"
    "android.permission.READ_MEDIA_VIDEO"
    "android.permission.POST_NOTIFICATIONS"
    "android.permission.READ_PHONE_STATE"
)

for perm in "${PERMISSIONS[@]}"; do
    if adb shell pm grant "$PKG" "$perm" 2>/dev/null; then
        echo "Granted: $perm"
    fi
done

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Your custom asg_client is now running on the glasses."
echo ""
echo "Useful commands:"
echo "  View logs:        adb logcat -s ASGClient"
echo "  Reinstall:        adb install -r $APK_PATH"
echo "  Restore stock:    ./scripts/restore-stock.sh"
echo ""
