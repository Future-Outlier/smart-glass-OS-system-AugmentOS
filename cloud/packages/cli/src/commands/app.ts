/**
 * App Management Commands
 *
 * Commands: app list, app get, app create, app update, app delete, app publish, app api-key, app export, app import
 */

import {Command} from "commander"
import {api} from "../api/client"
import {requireAuth} from "../config/credentials"
import {displayTable, displayJSON, error} from "../utils/output"
import chalk from "chalk"

export const appCommand = new Command("app").description("Manage apps")

// List apps
appCommand
  .command("list")
  .alias("ls")
  .description("List apps")
  .option("--org <id>", "Organization ID")
  .option("--json", "Output JSON")
  .action(async (options) => {
    try {
      await requireAuth()
      const apps = await api.listApps(options.org)

      if (options.json || options.parent?.opts().json) {
        displayJSON(apps)
      } else {
        if (apps.length === 0) {
          console.log("No apps found")
          return
        }

        displayTable(apps, ["packageName", "name", "appType", "appStoreStatus"])
        console.log(`\n${chalk.cyan(apps.length)} apps total`)
      }
    } catch (err: any) {
      error(`Failed to list apps: ${err.message}`)
      process.exit(1)
    }
  })

// Get app
appCommand
  .command("get")
  .argument("<package-name>", "Package name")
  .description("Get app details")
  .action(async (packageName: string) => {
    try {
      await requireAuth()
      const app = await api.getApp(packageName)
      displayJSON(app)
    } catch (err: any) {
      error(`App not found: ${err.message}`)
      process.exit(5)
    }
  })

// Placeholder for other commands (to be implemented)
appCommand
  .command("create")
  .description("Create new app")
  .action(async () => {
    console.log(chalk.yellow("⚠") + "  Command not yet implemented")
    console.log("  Use the console UI for now: https://console.mentra.glass")
    process.exit(1)
  })

appCommand
  .command("update")
  .argument("<package-name>", "Package name")
  .description("Update app")
  .action(async () => {
    console.log(chalk.yellow("⚠") + "  Command not yet implemented")
    console.log("  Use the console UI for now: https://console.mentra.glass")
    process.exit(1)
  })

appCommand
  .command("delete")
  .argument("<package-name>", "Package name")
  .description("Delete app")
  .action(async () => {
    console.log(chalk.yellow("⚠") + "  Command not yet implemented")
    console.log("  Use the console UI for now: https://console.mentra.glass")
    process.exit(1)
  })

appCommand
  .command("publish")
  .argument("<package-name>", "Package name")
  .description("Publish app to store")
  .action(async () => {
    console.log(chalk.yellow("⚠") + "  Command not yet implemented")
    console.log("  Use the console UI for now: https://console.mentra.glass")
    process.exit(1)
  })

appCommand
  .command("api-key")
  .argument("<package-name>", "Package name")
  .description("Regenerate app API key")
  .action(async () => {
    console.log(chalk.yellow("⚠") + "  Command not yet implemented")
    console.log("  Use the console UI for now: https://console.mentra.glass")
    process.exit(1)
  })

appCommand
  .command("export")
  .argument("<package-name>", "Package name")
  .option("-o, --output <file>", "Output file")
  .description("Export app config to JSON")
  .action(async () => {
    console.log(chalk.yellow("⚠") + "  Command not yet implemented")
    console.log("  Use the console UI for now: https://console.mentra.glass")
    process.exit(1)
  })

appCommand
  .command("import")
  .argument("<file>", "JSON file")
  .description("Import app config from JSON")
  .action(async () => {
    console.log(chalk.yellow("⚠") + "  Command not yet implemented")
    console.log("  Use the console UI for now: https://console.mentra.glass")
    process.exit(1)
  })
