# runs after bun install
# patches packages and builds / installs core module
patch-package
cd modules/core
bun install
bun run prepare
