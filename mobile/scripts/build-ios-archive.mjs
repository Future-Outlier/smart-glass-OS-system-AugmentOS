#!/usr/bin/env zx
import { setBuildEnv } from './set-build-env.mjs';
await setBuildEnv();

// Build iOS archive

await $`xcodebuild archive \
  -workspace ios/MentraOS.xcworkspace \
  -scheme MentraOS \
  -configuration Release \
  -destination generic/platform=iOS \
  -archivePath ios/build/MentraOS.xcarchive`

console.log(chalk.green('✓ Archive created successfully!'))
console.log(chalk.blue('Archive location: ios/build/MentraOS.xcarchive'))