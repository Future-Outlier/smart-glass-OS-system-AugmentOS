#!/usr/bin/env zx

import { setBuildEnv } from './set-build-env.mjs';
await setBuildEnv();

console.log('Building and flashing Android release...');

// Prebuild Android platform
await $({ stdio: 'inherit' })`bun expo prebuild --platform android`;

// Build release bundle in android directory
await $({ stdio: 'inherit', cwd: 'android' })`./gradlew bundleRelease`;

// Install APK on device (path relative to project root)
await $({ stdio: 'inherit' })`adb install -r android/app/build/outputs/apk/release/app-release.apk`;

console.log('✅ Android release built and flashed successfully!');
