import {ClientAppletInterface, useAppletStatusStore} from "@/stores/applets"
import {downloadAndInstallMiniApp} from "@/utils/storage/zip"
import {Directory, Paths} from "expo-file-system"
import {AsyncResult} from "typesafe-ts"
import {result as Res} from "typesafe-ts"
export interface LmaPermission {
  type: string
  description: string
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

  public getLocalApplets(): ClientAppletInterface[] {
    if (!this.refreshNeeded) {
      return this.installedLmas
    }

    const packageNames = this.getPackageNames()
    try {
      for (const packageName of packageNames) {
        const lmaDir = new Directory(Paths.document, "lmas", packageName)
        const lma = lmaDir.list()
        console.log("COMPOSER: Local applet", lma)
      }
      return []
    } catch (error) {
      console.error("COMPOSER: Error getting local applets", error)
      return []
    }
  }

  public startStop(applet: ClientAppletInterface, status: boolean): AsyncResult<void, Error> {
    return Res.try_async(async () => {})
  }
}

const composer = Composer.getInstance()
export default composer
