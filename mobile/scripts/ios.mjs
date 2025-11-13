#!/usr/bin/env zx
import { setBuildEnv } from './set-build-env.mjs';
await setBuildEnv();

// Run expo iOS command with stdin enabled for interactive prompts
await $({ stdio: 'inherit' })`bun expo run:ios --device`;
