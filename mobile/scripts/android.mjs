#!/usr/bin/env zx
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { setBuildEnv } from './set-build-env.mjs';

// Configure zx to run from project root
const __dirname = dirname(fileURLToPath(import.meta.url));
$.cwd = path.resolve(__dirname, '..');

// Set build environment variables
await setBuildEnv();

// Run expo Android command with stdin enabled for interactive prompts
await $({ stdio: 'inherit' })`bun expo run:android --device`;
