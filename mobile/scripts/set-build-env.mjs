#!/usr/bin/env zx

// Set build environment variables and export them
export async function setBuildEnv() {
  const gitCommit = (await $`git rev-parse --short HEAD`).stdout.trim();
  const gitBranch = (await $`git rev-parse --abbrev-ref HEAD`).stdout.trim();
  const gitUsername = (await $`git config user.name`).stdout.trim();
  const buildTime = new Date().toISOString();

  process.env.BUILD_COMMIT = gitCommit;
  process.env.BUILD_BRANCH = gitBranch;
  process.env.BUILD_USER = gitUsername;
  process.env.BUILD_TIME = buildTime;

  console.log(`Build environment set:`);
  console.log(`  BUILD_COMMIT: ${gitCommit}`);
  console.log(`  BUILD_BRANCH: ${gitBranch}`);
  console.log(`  BUILD_USER: ${gitUsername}`);
  console.log(`  BUILD_TIME: ${buildTime}`);

  return {
    BUILD_COMMIT: gitCommit,
    BUILD_BRANCH: gitBranch,
    BUILD_USER: gitUsername,
    BUILD_TIME: buildTime
  };
}

// If run directly, just set the env vars
if (import.meta.url === `file://${process.argv[1]}`) {
  await setBuildEnv();
}
