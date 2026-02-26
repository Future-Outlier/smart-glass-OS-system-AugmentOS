#!/bin/bash
#
# restore-stock.sh - Restore stock MentraOS on Mentra Live
#
# This removes any custom asg_client build and restores the factory system app.
#
# Usage:
#   ./scripts/restore-stock.sh
#

set -e

PKG="com.mentra.asg_client"

echo "=== Restore Stock MentraOS ==="
echo ""

# Check for ADB connection
if ! adb devices | grep -q "device$"; then
    echo "ERROR: No ADB device connected."
    echo ""
    echo "Connect via USB cable or WiFi, then try again."
    exit 1
fi

echo "Connected device:"
adb devices | grep "device$"
echo ""

# Step 1: Uninstall custom app
echo "Removing custom asg_client..."
if adb shell pm uninstall "$PKG" 2>&1 | grep -q "Success"; then
    echo "Custom version removed."
else
    echo "No custom version installed."
fi

# Step 2: Restore system app for user 0
echo "Restoring factory app..."
if adb shell cmd package install-existing "$PKG" 2>&1 | grep -q "installed for user"; then
    echo "Factory app restored."
else
    echo "Factory app already active (or not present in system image)."
fi

echo ""

# Step 3: Grant permissions (failsafe)
echo "Granting permissions..."

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
    adb shell pm grant "$PKG" "$perm" 2>/dev/null || true
done

echo "Permissions granted."
echo ""
echo "=== Stock Firmware Restored ==="
echo ""
echo "The factory MentraOS app is now active."
echo "Reboot recommended: adb reboot"
echo ""
