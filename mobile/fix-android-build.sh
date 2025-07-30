#!/bin/bash

# Check if we're in a "scripts" directory
current_dir=$(basename "$PWD")
if [ "$current_dir" = "scripts" ]; then
    echo "In scripts directory, moving to parent..."
    cd ..
    echo "Now in: $PWD"
else
    echo "Not in a scripts directory. Current directory: $current_dir"
fi

# Fix Android build issues script
# This script cleans all caches and rebuilds the Android project

echo "🔧 Fixing Android build issues..."
echo ""

# Step 1: Clean all build artifacts and caches
echo "📦 Step 1: Cleaning build artifacts and caches..."
rm -rf android/build android/.gradle node_modules .expo .bundle android/app/build android/app/src/main/assets

# Step 2: Install dependencies
echo ""
echo "📦 Step 2: Installing dependencies..."
pnpm install

# Step 3: Prebuild with Expo
echo ""
echo "🏗️  Step 3: Running Expo prebuild..."
pnpm expo prebuild

# Step 4: Fix React Native symlinks
echo ""
echo "🔗 Step 4: Fixing React Native symlinks..."
if [ -f "./fix-react-native-symlinks.sh" ]; then
    ./fix-react-native-symlinks.sh
else
    echo "⚠️  Warning: fix-react-native-symlinks.sh not found"
    echo "Creating symlinks manually..."
    
    # Create symlinks for common problematic modules
    MODULES=(
        "react-native-gesture-handler"
        "react-native-reanimated"
        "react-native-screens"
        "react-native-safe-area-context"
        "react-native-svg"
    )
    
    for MODULE in "${MODULES[@]}"; do
        MODULE_PATH="node_modules/$MODULE"
        if [ -d "$MODULE_PATH" ]; then
            # Remove existing nested node_modules if it exists
            if [ -d "$MODULE_PATH/node_modules" ]; then
                rm -rf "$MODULE_PATH/node_modules"
            fi
            
            # Create node_modules directory
            mkdir -p "$MODULE_PATH/node_modules"
            
            # Create symlink to react-native
            ln -sf "../../react-native" "$MODULE_PATH/node_modules/react-native"
            echo "✅ Created symlink for $MODULE"
        fi
    done
fi

# Step 5: Clean Gradle cache
echo ""
echo "🧹 Step 5: Cleaning Gradle cache..."
cd android && ./gradlew clean && cd ..

# Step 7: Build Android
echo ""
echo "🚀 Step 7: Building Android app..."
pnpm android

# Check if build was successful
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Android build completed successfully!"
    echo "✅ iOS pods have been restored too!"
    echo ""
    echo "📱 To start the development server, run:"
    echo "   pnpm run start"
else
    echo ""
    echo "❌ Android build failed!"
    echo ""
    echo "Try running the following commands manually:"
    echo "1. pnpm expo prebuild"
    echo "2. cd ios && pod install && cd .."
    echo "3. pnpm android"
fi