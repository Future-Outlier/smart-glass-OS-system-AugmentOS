#!/usr/bin/env zx

console.log('Running postinstall...');

// Patch packages
await $({ stdio: 'inherit' })`patch-package`;

// Build and prepare core module
console.log('Building core module...');
await $({ stdio: 'inherit', cwd: 'modules/core' })`bun install`;
await $({ stdio: 'inherit', cwd: 'modules/core' })`bun prepare`;

console.log('✅ Postinstall completed successfully!');
