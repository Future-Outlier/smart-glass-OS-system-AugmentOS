/**
 * App Management Commands
 *
 * Commands: app list, app get, app create, app update, app delete, app publish, app api-key, app export, app import
 */

import {Command} from "commander"
import {api} from "../api/client"
import {requireAuth} from "../config/credentials"
import {displayTable, displayJSON, success, error} from "../utils/output"
import {input, select, confirm} from "../utils/prompt"
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

// Create app
appCommand
  .command("create")
  .description("Create new app")
  .option("--package-name <name>", "Package name (e.g., com.example.myapp)")
  .option("--name <name>", "App name")
  .option("--description <text>", "App description")
  .option("--app-type <type>", "App type (background or standard)")
  .option("--public-url <url>", "Public URL")
  .option("--logo-url <url>", "Logo URL")
  .option("--org <id>", "Organization ID")
  .action(async (options) => {
    try {
      await requireAuth()

      // Determine if we're in interactive mode (no flags provided)
      const isInteractive = !options.packageName

      // Get values from flags or prompts
      const packageName =
        options.packageName || (await input("Package name (e.g., com.example.myapp):", {required: true}))

      // Validate package name format
      if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(packageName)) {
        error("Invalid package name format. Use reverse domain notation (e.g., com.example.myapp)")
        process.exit(7)
      }

      const name = options.name || (await input("App name:", {required: true}))

      const description = options.description || (isInteractive ? await input("Description:", {required: false}) : "")

      const appType = options.appType || (await select("App type:", ["background", "standard"]))

      const publicUrl = options.publicUrl || (await input("Public URL:", {required: true}))

      // Validate URL format
      try {
        new URL(publicUrl)
      } catch {
        error("Invalid URL format")
        process.exit(7)
      }

      const logoUrl = options.logoUrl || (isInteractive ? await input("Logo URL (optional):", {required: false}) : "")

      // Confirm before creating
      if (isInteractive) {
        // Only ask for confirmation in interactive mode
        console.log("\nApp configuration:")
        console.log(`  Package: ${chalk.cyan(packageName)}`)
        console.log(`  Name: ${chalk.cyan(name)}`)
        console.log(`  Type: ${chalk.cyan(appType)}`)
        console.log(`  URL: ${chalk.cyan(publicUrl)}`)
        if (description) console.log(`  Description: ${chalk.cyan(description)}`)
        if (logoUrl) console.log(`  Logo: ${chalk.cyan(logoUrl)}`)
        console.log()

        const confirmed = await confirm("Create this app?", true)
        if (!confirmed) {
          console.log("Cancelled")
          process.exit(0)
        }
      }

      // Create the app
      const appData: any = {
        packageName,
        name,
        appType,
        publicUrl,
      }

      if (description) appData.description = description
      if (logoUrl) appData.logoURL = logoUrl

      console.log("\nCreating app...")
      const result = await api.createApp(appData)

      success(`App created: ${result.app.packageName}`)

      // Display the API key (only shown once!)
      if (result.apiKey) {
        console.log()
        console.log(chalk.yellow("⚠️  IMPORTANT: Save this API key - it won't be shown again!"))
        console.log()
        console.log(chalk.cyan("  API Key: ") + chalk.bold.white(result.apiKey))
        console.log()
      }

      // Display app details
      console.log("\nApp details:")
      displayJSON(result.app)
    } catch (err: any) {
      error(`Failed to create app: ${err.message}`)
      process.exit(1)
    }
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
