import {create} from "zustand"
import {AppletInterface} from "@/types/AppletTypes"
import restComms from "@/managers/RestComms"
import {SETTINGS_KEYS, useSettingsStore} from "@/stores/settings"
import showAlert from "@/utils/AlertUtils"
import {translate} from "@/i18n"
import {useMemo} from "react"
import {OFFLINE_APPS} from "@/types/OfflineApps"

interface AppStatusState {
  apps: AppletInterface[]
  refreshApps: () => Promise<void>
  startApp: (packageName: string, appType?: string) => Promise<void>
  stopApp: (packageName: string) => Promise<void>
  stopAllApps: () => Promise<void>
}

const OFFLINE_APPLETS: AppletInterface[] = [
  {
    packageName: "com.mentra.camera",
    name: "Camera",
    developerName: "Mentra",
    logoURL: "https://example.com/logo.png",
    publicUrl: "https://example.com",
    permissions: [],
    webviewURL: "https://example.com",
    is_running: false,
    loading: false,
    isOnline: false,
    type: "standard",
  },
  {
    packageName: "com.mentra.captions",
    name: "Captions",
    developerName: "Mentra",
    logoURL: "https://example.com/logo.png",
    publicUrl: "https://example.com",
    permissions: [],
    webviewURL: "https://example.com",
    is_running: false,
    loading: false,
    isOnline: false,
    type: "standard",
  },
]

export const useAppletStatusStore = create<AppStatusState>((set, get) => ({
  apps: [],

  refreshApps: async () => {
    const coreToken = restComms.getCoreToken()
    if (!coreToken) return

    try {
      const appsData = await restComms.getApps()
      const mapped = appsData.map(app => ({
        type: app.type || app.appType,
        developerName: app.developerName,
        packageName: app.packageName,
        name: app.name,
        publicUrl: app.publicUrl,
        logoURL: app.logoURL,
        permissions: app.permissions,
        webviewURL: app.webviewURL,
        is_running: app.is_running,
        loading: false,
        isOnline: app.isOnline,
        compatibility: app.compatibility,
      })) as AppletInterface[]

      // merge in the offline apps:
      const applets = [...mapped, ...OFFLINE_APPLETS]

      set({apps: applets})
    } catch (err) {
      console.error("Error fetching apps:", err)
    }
  },

  startApp: async (packageName: string) => {
    console.log("starting app")
    const applet = get().apps.find(a => a.packageName === packageName)
    console.log("applet", applet)

    if (!applet) {
      console.error(`Applet not found for package name: ${packageName}`)
      return
    }

    // if (applet.type === "standard") {
    //   const runningStandardApps = get().apps.filter(
    //     a => a.is_running && a.type === "standard" && a.packageName !== packageName,
    //   )

    //   for (const app of runningStandardApps) {
    //     await restComms.stopApp(app.packageName).catch(console.error)
    //     set(state => ({
    //       apps: state.apps.map(a =>
    //         a.packageName === app.packageName ? {...a, is_running: false, loading: false} : a,
    //       ),
    //     }))
    //   }
    // }

    set(state => ({
      apps: state.apps.map(a => (a.packageName === packageName ? {...a, is_running: true, loading: true} : a)),
    }))

    try {
      if (applet?.isOnline) {
        await restComms.startApp(packageName)
      }
      await useSettingsStore.getState().setSetting(SETTINGS_KEYS.has_ever_activated_app, true)
    } catch (error: any) {
      console.error("Start app error:", error)

      if (error?.response?.data?.error?.stage === "HARDWARE_CHECK") {
        showAlert(
          translate("home:hardwareIncompatible"),
          error.response.data.error.message ||
            translate("home:hardwareIncompatibleMessage", {app: packageName, missing: "required hardware"}),
          [{text: translate("common:ok")}],
          {iconName: "alert-circle-outline"},
        )
      }

      set(state => ({
        apps: state.apps.map(a => (a.packageName === packageName ? {...a, is_running: false, loading: false} : a)),
      }))
    }
  },

  stopApp: async (packageName: string) => {
    set(state => ({
      apps: state.apps.map(a => (a.packageName === packageName ? {...a, is_running: false, loading: false} : a)),
    }))
    const applet = get().apps.find(a => a.packageName === packageName)
    if (applet?.isOnline) {
      await restComms.stopApp(packageName).catch(console.error)
    }
  },

  stopAllApps: async () => {
    const runningApps = get().apps.filter(app => app.is_running)

    for (const app of runningApps) {
      await restComms.stopApp(app.packageName)
    }

    set({apps: get().apps.map(a => ({...a, is_running: false}))})
  },
}))

export const useApplets = () => useAppletStatusStore(state => state.apps)
export const useStartApplet = () => useAppletStatusStore(state => state.startApp)
export const useStopApplet = () => useAppletStatusStore(state => state.stopApp)
export const useRefreshApplets = () => useAppletStatusStore(state => state.refreshApps)

export const useStopAllApplets = () => useAppletStatusStore(state => state.stopAllApps)

export const useInactiveForegroundApps = () => {
  const apps = useApplets()
  return useMemo(() => apps.filter(app => (app.type === "standard" || !app.type) && !app.is_running), [apps])
}

export const useBackgroundApps = () => {
  const apps = useApplets()
  return useMemo(
    () => ({
      active: apps.filter(app => app.type === "background" && app.is_running),
      inactive: apps.filter(app => app.type === "background" && !app.is_running),
    }),
    [apps],
  )
}

export const useActiveForegroundApp = () => {
  const apps = useApplets()
  return useMemo(() => apps.find(app => (app.type === "standard" || !app.type) && app.is_running) || null, [apps])
}

export const useActiveBackgroundAppsCount = () => {
  const apps = useApplets()
  return useMemo(() => apps.filter(app => app.type === "background" && app.is_running).length, [apps])
}

export const useIncompatibleApps = () => {
  const apps = useApplets()
  return useMemo(
    () => apps.filter(app => !app.is_running && app.compatibility && !app.compatibility.isCompatible),
    [apps],
  )
}
