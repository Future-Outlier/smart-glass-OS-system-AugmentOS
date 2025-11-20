#!/usr/bin/env zx

console.log('Running postinstall...');

// Patch packages
await $({ stdio: 'inherit' })`patch-package`;

console.log('Building core module...');
await $({ stdio: 'inherit', cwd: 'modules/core' })`bun prepare`;
// ignore scripts to avoid infinite loop:
await $({ stdio: 'inherit' })`bun install --ignore-scripts`;

console.log('✅ Postinstall completed successfully!');
