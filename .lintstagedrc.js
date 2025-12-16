module.exports = {
  // Cloud files: use cloud's prettier config
  // NOTE: Skipping eslint for cloud - config needs migration from .eslintrc.js to flat config format
  // TODO: Convert cloud/.eslintrc.js to eslint.config.mjs and re-enable
  "cloud/**/*.{js,jsx,ts,tsx,json,md}": (filenames) => {
    return [`prettier --write --config cloud/packages/cloud/.prettierrc.js ${filenames.join(" ")}`]
  },

  // Non-cloud, non-root files: use root eslint and prettier configs
  "!(cloud)/**/*.{js,jsx,ts,tsx}": "eslint --fix --quiet",
  "!(cloud)/**/*.{js,jsx,ts,tsx,json,css,md,html,yml,yaml}": "prettier --write",

  // Root-level config files: prettier only (root eslint needs expo which may not be installed)
  "*.json": "prettier --write",
  "*.{md,html,yml,yaml}": "prettier --write",

  // Swift files
  "*.swift": "swiftformat",
}
