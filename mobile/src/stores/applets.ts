import {create} from "zustand"
import {AppletInterface} from "@/types/AppletTypes"
import restComms from "@/managers/RestComms"
import {SETTINGS_KEYS, useSettingsStore} from "@/stores/settings"
import showAlert from "@/utils/AlertUtils"
import {translate} from "@/i18n"

interface AppStatusState {
  apps: AppletInterface[]

  // Actions
  refreshApps: () => Promise<void>
  startApp: (packageName: string, appType?: string, theme?: any) => Promise<void>
  stopApp: (packageName: string) => Promise<void>
  stopAllApps: () => Promise<void>

  // Selectors
  getForegroundApps: () => AppletInterface[]
  getBackgroundApps: () => {active: AppletInterface[]; inactive: AppletInterface[]}
  getActiveForegroundApp: () => AppletInterface | null
  getActiveBackgroundAppsCount: () => number
  getIncompatibleApps: () => AppletInterface[]
}

export const useAppStatusStore = create<AppStatusState>((set, get) => ({
  apps: [],

  refreshApps: async () => {
    const coreToken = restComms.getCoreToken()
    if (!coreToken) {
      console.log("Waiting for core token before fetching apps")
      return
    }

    try {
      const appsData = await restComms.getApps()

      const mapped = appsData.map(app => ({
        type: app.type || (app as any)["appType"],
        developerName: app.developerName,
        packageName: app.packageName,
        name: app.name,
        publicUrl: app.publicUrl,
        logoURL: app.logoURL,
        permissions: app.permissions,
        webviewURL: app.webviewURL,
        is_running: app.is_running,
        loading: false,
        isOnline: (app as any).isOnline,
        compatibility: (app as any).compatibility,
      })) as AppletInterface[]

      set({apps: mapped})
    } catch (err) {
      console.error("Error fetching apps:", err)
    }
  },

  startApp: async (packageName: string, appType?: string, theme?: any) => {
    const {apps} = get()

    // Handle foreground apps - stop other running standard apps
    if (appType === "standard") {
      const runningStandardApps = apps.filter(
        a => a.is_running && a.type === "standard" && a.packageName !== packageName,
      )

      for (const runningApp of runningStandardApps) {
        try {
          await restComms.stopApp(runningApp.packageName)
          set(state => ({
            apps: state.apps.map(a =>
              a.packageName === runningApp.packageName ? {...a, is_running: false, loading: false} : a,
            ),
          }))
        } catch (error) {
          console.error("Stop app error:", error)
        }
      }
    }

    // Set loading state
    set(state => ({
      apps: state.apps.map(a => (a.packageName === packageName ? {...a, is_running: true, loading: true} : a)),
    }))

    // Start the app
    try {
      await restComms.startApp(packageName)
      await useSettingsStore.getState().setSetting(SETTINGS_KEYS.has_ever_activated_app, true)

      // // Clear loading state
      // set(state => ({
      //   apps: state.apps.map(a => (a.packageName === packageName ? {...a, loading: false} : a)),
      // }))
    } catch (error: any) {
      console.error("Start app error:", error)

      if (error?.response?.data?.error?.stage === "HARDWARE_CHECK") {
        showAlert(
          translate("home:hardwareIncompatible"),
          error.response.data.error.message ||
            translate("home:hardwareIncompatibleMessage", {
              app: packageName,
              missing: "required hardware",
            }),
          [{text: translate("common:ok")}],
          {
            iconName: "alert-circle-outline",
            iconColor: theme?.colors?.error,
          },
        )
      }

      // Revert state on error
      set(state => ({
        apps: state.apps.map(a => (a.packageName === packageName ? {...a, is_running: false, loading: false} : a)),
      }))
    }
  },

  stopApp: async (packageName: string) => {
    // Optimistically stop the app
    set(state => ({
      apps: state.apps.map(a => (a.packageName === packageName ? {...a, is_running: false, loading: false} : a)),
    }))

    // Actually stop the app
    try {
      await restComms.stopApp(packageName)
    } catch (error) {
      console.error("Stop app error:", error)
    }
  },

  stopAllApps: async () => {
    const {apps} = get()
    const runningApps = apps.filter(app => app.is_running)

    for (const app of runningApps) {
      await restComms.stopApp(app.packageName)
    }

    set(state => ({
      apps: state.apps.map(a => (a.is_running ? {...a, is_running: false} : a)),
    }))
  },

  // Selectors
  getForegroundApps: () => {
    return get().apps.filter(app => app.type === "standard" || !app.type)
  },

  getBackgroundApps: () => {
    const {apps} = get()
    return {
      active: apps.filter(app => app.type === "background" && app.is_running),
      inactive: apps.filter(app => app.type === "background" && !app.is_running),
    }
  },

  getActiveForegroundApp: () => {
    return get().apps.find(app => (app.type === "standard" || !app.type) && app.is_running) || null
  },

  getActiveBackgroundAppsCount: () => {
    return get().apps.filter(app => app.type === "background" && app.is_running).length
  },

  getIncompatibleApps: () => {
    return get().apps.filter(app => {
      if (app.is_running) return false
      return app.compatibility && !app.compatibility.isCompatible
    })
  },
}))

// Hook versions of selectors for React components
export const useForegroundApps = () => useAppStatusStore(state => state.getForegroundApps())
export const useBackgroundApps = () => useAppStatusStore(state => state.getBackgroundApps())
export const useActiveForegroundApp = () => useAppStatusStore(state => state.getActiveForegroundApp())
export const useActiveBackgroundAppsCount = () => useAppStatusStore(state => state.getActiveBackgroundAppsCount())
export const useIncompatibleApps = () => useAppStatusStore(state => state.getIncompatibleApps())
