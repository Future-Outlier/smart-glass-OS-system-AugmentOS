import {
  ClientAppletInterface,
  lmaInstallerPackageName,
  saveLocalAppRunningState,
  useAppletStatusStore,
} from "@/stores/applets"
import {downloadAndInstallMiniApp} from "@/utils/storage/zip"
import {Directory, Paths, File} from "expo-file-system"
import {AsyncResult, Result} from "typesafe-ts"
import {result as Res} from "typesafe-ts"
export interface LmaPermission {
  type: string
  description: string
}

interface InstalledInfo {
  version: string
  name: string
  logoUrl: string
}

interface InstalledLma {
  packageName: string
  versions: InstalledInfo[]
}

class Composer {
  private onlineTranscriptions: boolean = false
  private offlineTranscriptions: boolean = false
  private pcmData: boolean = false
  private installedLmas: ClientAppletInterface[] = []
  private refreshNeeded: boolean = false

  private static instance: Composer | null = null
  private constructor() {
    this.initialize()
  }

  public static getInstance(): Composer {
    if (!Composer.instance) {
      Composer.instance = new Composer()
    }
    return Composer.instance
  }

  // read local storage to find which mini apps are installed and running
  // if any mini app needs online or offlline transcriptions, we need to feed them the necessary data
  private initialize() {
    // update the applets store with the installed mini apps:
    // useAppletStatusStore.getState().setInstalledLmas(this.installedLmas)
    // useAppletStatusStore.getState().refreshApplets()
  }

  // download the mini app from the url and unzip it to the app's cache directory/lma/<packageName>
  public installMiniApp(url: string): AsyncResult<void, Error> {
    return Res.try_async(async () => {
      await downloadAndInstallMiniApp(url)
      console.log("COMPOSER: Downloaded and installed mini app")
      this.refreshNeeded = true
      await useAppletStatusStore.getState().refreshApplets()
    })
  }

  public getPackageNames(): string[] {
    try {
      const lmasDir = new Directory(Paths.document, "lmas")
      const lmas = lmasDir.list()
      console.log("COMPOSER: Local applets", lmas)
      return lmas.map((lma) => lma.name)
    } catch (error) {
      // console.error("COMPOSER: Error getting local package names", error)
      return []
    }
  }
  public getAppletInstalledVersions(packageName: string): string[] {
    try {
      const lmaDir = new Directory(Paths.document, "lmas", packageName)
      const lma = lmaDir.list()
      console.log("COMPOSER: Local applet", lma)
      return lma.map((lma) => lma.name)
    } catch (error) {
      console.error("COMPOSER: Error getting local applet versions", error)
      return []
    }
  }

  public getAppletMetadata(packageName: string, version: string): InstalledInfo {
    try {
      const lmaDir = new Directory(Paths.document, "lmas", packageName, version)
      const appJsonFile = new File(lmaDir, "app.json")
      const appJson = JSON.parse(appJsonFile.textSync())
      const logoUrl = new File(lmaDir, "icon.png").uri
      return {name: appJson.name, version: version, logoUrl: logoUrl}
    } catch (error) {
      console.error("COMPOSER: Error getting local applet metadata", error)
      return {name: "error", version: "0.0.0", logoUrl: ""}
    }
  }
  // return {packageName: string, versions: string[]}
  public getInstalledAppletsInfo(): {packageName: string; versions: InstalledInfo[]}[] {
    const packageNames = this.getPackageNames()
    const appletsInfo: {packageName: string; versions: InstalledInfo[]}[] = []
    for (const packageName of packageNames) {
      const versions = this.getAppletInstalledVersions(packageName)
      const installedVersion: InstalledLma = {packageName, versions: []}
      for (const versionString of versions) {
        const info: InstalledInfo = this.getAppletMetadata(packageName, versionString)
        installedVersion.versions.push(info)
      }
      appletsInfo.push(installedVersion)
    }
    // console.log("COMPOSER: Applets info", appletsInfo)
    return appletsInfo
  }

  public getLocalApplets(): ClientAppletInterface[] {
    if (!this.refreshNeeded && this.installedLmas.length > 0) {
      // return this.installedLmas
      // this is the source of truth for running state:
      return useAppletStatusStore.getState().apps.filter((a) => a.local)
    }

    const installedLmasInfo = this.getInstalledAppletsInfo()
    // console.log("COMPOSER: Installed Lmas Info", installedLmasInfo)
    // use the latest version for now (will be overriddable later via <packageName>_version_key)
    // build the installedLmas array:
    const lmas: ClientAppletInterface[] = []
    for (const lmaInfo of installedLmasInfo) {
      let version = lmaInfo.versions[0]
      lmas.push({
        packageName: lmaInfo.packageName,
        version: version.version,
        running: false,
        local: true,
        healthy: true,
        loading: false,
        offline: false,
        offlineRoute: "",
        name: version.name,
        webviewUrl: "",
        logoUrl: version.logoUrl,
        type: "standard",
        permissions: [],
        hardwareRequirements: [],
        onStart: () => saveLocalAppRunningState(lmaInfo.packageName, true),
        onStop: () => saveLocalAppRunningState(lmaInfo.packageName, false),
      })
    }

    this.installedLmas = lmas
    this.refreshNeeded = false

    console.log("COMPOSER: Installed Lmas", this.installedLmas)

    return this.installedLmas
  }

  public getLocalMiniAppHtml(packageName: string, version: string): Result<string, Error> {
    return Res.try(() => {
      const lmaDir = new Directory(Paths.document, "lmas", packageName, version)
      const htmlFile = new File(lmaDir, "index.html")
      return htmlFile.textSync()
    })
  }

  // public startStop(applet: ClientAppletInterface, status: boolean): AsyncResult<void, Error> {
  //   return Res.try_async(async () => {})
  // }
}

const composer = Composer.getInstance()
export default composer
