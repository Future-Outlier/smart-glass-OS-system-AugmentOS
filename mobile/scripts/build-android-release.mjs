#!/usr/bin/env zx

import { setBuildEnv } from './set-build-env.mjs';
await setBuildEnv();

console.log('Building Android release...');

// Prebuild Android platform
await $({ stdio: 'inherit' })`bun expo prebuild --platform android`;

// Build release bundle
await $({ stdio: 'inherit', cwd: 'android' })`./gradlew bundleRelease`;

// Install APK on device
await $({ stdio: 'inherit' })`adb install -r app/build/outputs/apk/release/app-release.apk`;

console.log('✅ Android release built and installed successfully!');
