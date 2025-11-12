#!/usr/bin/env zx
import { setBuildEnv } from './set-build-env.mjs';

// Configure zx to run from project root
$.cwd = path.resolve(import.meta.dirname, '..');

// Set build environment variables
await setBuildEnv();

// Run expo Android command with stdin enabled for interactive prompts
await $({ stdio: 'inherit' })`bun expo run:android --device`;
