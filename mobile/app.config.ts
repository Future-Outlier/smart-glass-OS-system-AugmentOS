/**
 * Use ts-node here so we can use TypeScript for our Config Plugins
 * and not have to compile them to JavaScript
 */
import dotenv from "dotenv"

import {ExpoConfig, ConfigContext} from "@expo/config"

require("ts-node/register")
dotenv.config()

/**
 * @param config ExpoConfig coming from the static config app.json if it exists
 *
 * You can read more about Expo's Configuration Resolution Rules here:
 * https://docs.expo.dev/workflow/configuration/#configuration-resolution-rules
 */
module.exports = ({config}: ConfigContext): Partial<ExpoConfig> => {
  const existingPlugins = config.plugins ?? []

  return {
    ...config,
    plugins: [...existingPlugins, require("./plugins/withSplashScreen").withSplashScreen],
    extra: {
      MENTRAOS_VERSION: process.env.MENTRAOS_VERSION,
      MENTRAOS_APPSTORE_URL: process.env.MENTRAOS_APPSTORE_URL,
      MENTRAOS_SECURE: process.env.MENTRAOS_SECURE,
      MENTRAOS_HOST: process.env.MENTRAOS_HOST,
      MENTRAOS_PORT: process.env.MENTRAOS_PORT,
      POSTHOG_API_KEY: process.env.POSTHOG_API_KEY,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
      SENTRY_DSN: process.env.SENTRY_DSN,
      AUTHING_APP_ID: process.env.AUTHING_APP_ID,
      AUTHING_APP_SECRET: process.env.AUTHING_APP_SECRET,
      AUTHING_APP_DOMAIN: process.env.AUTHING_APP_DOMAIN,
      DEPLOYMENT_REGION: process.env.DEPLOYMENT_REGION,
    },
    version: process.env.MENTRAOS_VERSION,
  }
}
