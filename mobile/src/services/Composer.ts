import { ClientAppletInterface, useAppletStatusStore } from "@/stores/applets"
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
      // const response = await fetch(url)
      // const data = await response.json()
      // const packageName = data.packageName
      // const version = data.version
      // const runtimePermissions = data.runtimePermissions
      // const declaredPermissions = data.declaredPermissions
      // const running = data.running
      // const url = data.url
      // const installedLma: InstalledLma = {packageName, version, runtimePermissions, declaredPermissions, running, url}
    })
  }


  public startStop(applet: ClientAppletInterface, status: boolean): AsyncResult<void, Error> {
    return Res.try_async(async () => {
    })
  }
}

const composer = Composer.getInstance()
export default composer
