import AsyncStorage from "@react-native-async-storage/async-storage"
import CoreModule from "core"
import {getTimeZone} from "react-native-localize"
import {create} from "zustand"
import {subscribeWithSelector} from "zustand/middleware"

import restComms from "@/services/RestComms"

interface Setting {
  key: string
  defaultValue: () => any
  writable: boolean
  // change the key to a different key based on the indexer
  indexer?: () => string
  // override the value of the setting
  override?: () => any
}

export const SETTINGS: Record<string, Setting> = {
  // feature flags / mantle settings:
  dev_mode: {key: "dev_mode", defaultValue: () => __DEV__, writable: true},
  enable_squircles: {key: "enable_squircles", defaultValue: () => true, writable: true},
  debug_console: {key: "debug_console", defaultValue: () => false, writable: true},
  china_deployment: {
    key: "china_deployment",
    defaultValue: () => (process.env.EXPO_PUBLIC_DEPLOYMENT_REGION === "china" ? true : false),
    override: () => (process.env.EXPO_PUBLIC_DEPLOYMENT_REGION === "china" ? true : false),
    writable: false,
  },
  backend_url: {
    key: "backend_url",
    defaultValue: () =>
      process.env.EXPO_PUBLIC_DEPLOYMENT_REGION === "china"
        ? "https://api.mentraglass.cn:443"
        : "https://api.mentra.glass:443",
    writable: true,
    override: () => {
      if (process.env.EXPO_PUBLIC_BACKEND_URL_OVERRIDE) {
        return process.env.EXPO_PUBLIC_BACKEND_URL_OVERRIDE
      }
      return undefined
    },
  },
  store_url: {
    key: "store_url",
    defaultValue: () =>
      process.env.EXPO_PUBLIC_DEPLOYMENT_REGION === "china"
        ? "https://store.mentraglass.cn"
        : "https://apps.mentra.glass",
    writable: true,
  },
  reconnect_on_app_foreground: {key: "reconnect_on_app_foreground", defaultValue: () => false, writable: true},
  location_tier: {key: "location_tier", defaultValue: () => "", writable: true},
  // state:
  core_token: {key: "core_token", defaultValue: () => "", writable: true},
  default_wearable: {key: "default_wearable", defaultValue: () => "", writable: true},
  device_name: {key: "device_name", defaultValue: () => "", writable: true},
  device_address: {key: "device_address", defaultValue: () => "", writable: true},
  // ui state:
  theme_preference: {key: "theme_preference", defaultValue: () => "system", writable: true},
  enable_phone_notifications: {key: "enable_phone_notifications", defaultValue: () => false, writable: true},
  settings_access_count: {key: "settings_access_count", defaultValue: () => 0, writable: true},
  show_advanced_settings: {key: "show_advanced_settings", defaultValue: () => false, writable: true},
  onboarding_completed: {key: "onboarding_completed", defaultValue: () => false, writable: true},

  // core settings:
  sensing_enabled: {key: "sensing_enabled", defaultValue: () => true, writable: true},
  power_saving_mode: {key: "power_saving_mode", defaultValue: () => false, writable: true},
  always_on_status_bar: {key: "always_on_status_bar", defaultValue: () => false, writable: true},
  bypass_vad_for_debugging: {key: "bypass_vad_for_debugging", defaultValue: () => true, writable: true},
  bypass_audio_encoding_for_debugging: {
    key: "bypass_audio_encoding_for_debugging",
    defaultValue: () => false,
    writable: true,
  },
  metric_system: {key: "metric_system", defaultValue: () => false, writable: true},
  enforce_local_transcription: {key: "enforce_local_transcription", defaultValue: () => false, writable: true},
  preferred_mic: {
    key: "preferred_mic",
    defaultValue: () => "auto",
    writable: true,
    indexer: () => {
      const glasses = useSettingsStore.getState().getSetting(SETTINGS.default_wearable.key)
      return glasses
    },
  },
  screen_disabled: {key: "screen_disabled", defaultValue: () => false, writable: true},
  // glasses settings:
  contextual_dashboard: {key: "contextual_dashboard", defaultValue: () => true, writable: true},
  head_up_angle: {key: "head_up_angle", defaultValue: () => 45, writable: true},
  brightness: {key: "brightness", defaultValue: () => 50, writable: true},
  auto_brightness: {key: "auto_brightness", defaultValue: () => true, writable: true},
  dashboard_height: {key: "dashboard_height", defaultValue: () => 4, writable: true},
  dashboard_depth: {key: "dashboard_depth", defaultValue: () => 5, writable: true},
  gallery_mode: {key: "gallery_mode", defaultValue: () => false, writable: true},
  // button settings
  button_mode: {key: "button_mode", defaultValue: () => "photo", writable: true},
  button_photo_size: {key: "button_photo_size", defaultValue: () => "large", writable: true},
  button_video_settings: {
    key: "button_video_settings",
    defaultValue: () => ({width: 1920, height: 1080, fps: 30}),
    writable: true,
  },
  button_camera_led: {key: "button_camera_led", defaultValue: () => true, writable: true},
  button_video_settings_width: {key: "button_video_settings_width", defaultValue: () => 1920, writable: true},
  button_max_recording_time: {key: "button_max_recording_time", defaultValue: () => 10, writable: true},

  // time zone settings
  time_zone: {
    key: "time_zone",
    defaultValue: () => "",
    writable: true,
    override: () => {
      const override = useSettingsStore.getState().getSetting(SETTINGS.time_zone_override.key)
      if (override) {
        return override
      }
      return getTimeZone()
    },
  },
  time_zone_override: {key: "time_zone_override", defaultValue: () => "", writable: true},
  // offline applets
  offline_mode: {key: "offline_mode", defaultValue: () => false, writable: true},
  offline_captions_running: {key: "offline_captions_running", defaultValue: () => false, writable: true},
  // button action settings
  default_button_action_enabled: {key: "default_button_action_enabled", defaultValue: () => true, writable: true},
  default_button_action_app: {
    key: "default_button_action_app",
    defaultValue: () => "com.mentra.camera",
    writable: true,
  },
  // notifications
  notifications_enabled: {key: "notifications_enabled", defaultValue: () => true, writable: true},
  notifications_blocklist: {key: "notifications_blocklist", defaultValue: () => [], writable: true},
} as const

// these settings are automatically synced to the core:
const CORE_SETTINGS_KEYS: string[] = [
  SETTINGS.sensing_enabled.key,
  SETTINGS.power_saving_mode.key,
  SETTINGS.always_on_status_bar.key,
  SETTINGS.bypass_vad_for_debugging.key,
  SETTINGS.bypass_audio_encoding_for_debugging.key,
  SETTINGS.metric_system.key,
  SETTINGS.enforce_local_transcription.key,
  SETTINGS.preferred_mic.key,
  SETTINGS.screen_disabled.key,
  // glasses settings:
  SETTINGS.contextual_dashboard.key,
  SETTINGS.head_up_angle.key,
  SETTINGS.brightness.key,
  SETTINGS.auto_brightness.key,
  SETTINGS.dashboard_height.key,
  SETTINGS.dashboard_depth.key,
  SETTINGS.gallery_mode.key,
  // button:
  SETTINGS.button_mode.key,
  SETTINGS.button_photo_size.key,
  SETTINGS.button_video_settings.key,
  SETTINGS.button_camera_led.key,
  SETTINGS.button_max_recording_time.key,
  SETTINGS.default_wearable.key,
  SETTINGS.device_name.key,
  SETTINGS.device_address.key,
  // offline applets:
  SETTINGS.offline_captions_running.key,
  // SETTINGS.offline_camera_running.key,
  // notifications:
  SETTINGS.notifications_enabled.key,
  SETTINGS.notifications_blocklist.key,
]

// const PER_GLASSES_SETTINGS_KEYS: string[] = [SETTINGS.preferred_mic.key]

interface SettingsState {
  // Settings values
  settings: Record<string, any>
  // Loading states
  isInitialized: boolean
  loadingKeys: Set<string>
  // Actions
  setSetting: (key: string, value: any, updateCore?: boolean, updateServer?: boolean) => Promise<void>
  setManyLocally: (settings: Record<string, any>) => Promise<void>
  getSetting: (key: string) => any
  loadSetting: (key: string) => Promise<any>
  loadAllSettings: () => Promise<void>
  // Utility methods
  getRestUrl: () => string
  getWsUrl: () => string
  getCoreSettings: () => Record<string, any>
}

const getDefaultSettings = () =>
  Object.keys(SETTINGS).reduce(
    (acc, key) => {
      acc[key] = SETTINGS[key].defaultValue()
      return acc
    },
    {} as Record<string, any>,
  )

const migrateSettings = () => {
  useSettingsStore.getState().setSetting(SETTINGS.enable_squircles.key, true, false, true)
}

export const useSettingsStore = create<SettingsState>()(
  subscribeWithSelector((set, get) => ({
    settings: getDefaultSettings(),
    isInitialized: false,
    loadingKeys: new Set(),
    setSetting: async (key: string, value: any, updateCore = true, updateServer = true) => {
      const setting = SETTINGS[key]
      const originalKey = key

      if (!setting) {
        console.error(`SETTINGS: SET: ${originalKey} is not a valid setting!`)
        return
      }

      if (setting.indexer) {
        key = `${originalKey}:${setting.indexer()}`
      }

      if (!setting.writable) {
        console.error(`SETTINGS: ${originalKey} is not writable!`)
        return
      }

      // Update store immediately for optimistic UI
      set(state => ({
        settings: {...state.settings, [key]: value},
      }))
      // Persist to AsyncStorage
      const jsonValue = JSON.stringify(value)
      await AsyncStorage.setItem(key, jsonValue)
      // Update core settings if needed
      if (CORE_SETTINGS_KEYS.includes(key as (typeof CORE_SETTINGS_KEYS)[number]) && updateCore) {
        CoreModule.updateSettings({[originalKey]: value})
      }
      // Sync with server if needed
      if (updateServer) {
        const result = await restComms.writeUserSettings({[key]: value})
        if (result.is_error()) {
          console.log("SETTINGS: couldn't sync setting to server: ", result.error)
        }
      }
    },
    getSetting: (key: string) => {
      const state = get()
      const originalKey = key
      const setting = SETTINGS[originalKey]

      if (!setting) {
        console.error(`SETTINGS: GET: ${originalKey} is not a valid setting!`)
        return undefined
      }

      if (setting.override) {
        let override = setting.override()
        if (override !== undefined) {
          return override
        }
      }

      if (setting.indexer) {
        key = `${originalKey}:${setting.indexer()}`
      }
      // console.log(`GET SETTING: ${key} = ${state.settings[key]}`)
      try {
        return state.settings[key] ?? SETTINGS[originalKey].defaultValue()
      } catch (e) {
        // for dynamically created settings, we need to create a new setting in SETTINGS:
        console.log(`Failed to get setting, creating new setting:(${key}):`, e)
        SETTINGS[key] = {key: key, defaultValue: () => undefined, writable: true}
        return SETTINGS[key].defaultValue()
      }
    },
    loadSetting: async (key: string) => {
      // check if initialized:
      const state = get()
      if (state.isInitialized) {
        return state.getSetting(key)
      }

      try {
        const jsonValue = await AsyncStorage.getItem(key)
        if (jsonValue !== null) {
          const value = JSON.parse(jsonValue)
          // Update store with loaded value
          // console.log(`LOADED SETTING2: ${key} = ${value}`)
          set(state => ({
            settings: {...state.settings, [key]: value},
          }))
        }
      } catch (error) {
        console.error(`Failed to load setting (${key}):`, error)
      }

      return state.getSetting(key)
    },
    setManyLocally: async (settings: Record<string, any>) => {
      // Update store immediately
      set(state => ({
        settings: {...state.settings, ...settings},
      }))
      // Persist all to AsyncStorage
      await Promise.all(
        Object.entries(settings).map(([key, value]) => AsyncStorage.setItem(key, JSON.stringify(value))),
      )
      // Update core settings
      const coreUpdates: Record<string, any> = {}
      Object.keys(settings).forEach(key => {
        if (CORE_SETTINGS_KEYS.includes(key as (typeof CORE_SETTINGS_KEYS)[number])) {
          coreUpdates[key] = settings[key]
        }
      })
      if (Object.keys(coreUpdates).length > 0) {
        CoreModule.updateSettings(coreUpdates)
      }
    },
    loadAllSettings: async () => {
      set(_state => ({
        loadingKeys: new Set(Object.keys(SETTINGS)),
      }))
      let loadedSettings: Record<string, any> = {}
      for (const setting of Object.values(SETTINGS)) {
        try {
          const value = await get().loadSetting(setting.key)
          // console.log(`LOADED SETTING: ${setting.key} = ${value}`)
          loadedSettings[setting.key] = value
        } catch (error) {
          console.error(`Failed to load setting ${setting.key}:`, error)
          loadedSettings[setting.key] = setting.defaultValue()
        }
      }
      set({
        settings: loadedSettings,
        isInitialized: true,
        loadingKeys: new Set(),
      })
      // update any settings that need to be migrated:
      migrateSettings()
    },
    getRestUrl: () => {
      const serverUrl = get().getSetting(SETTINGS.backend_url.key)
      const url = new URL(serverUrl)
      const secure = url.protocol === "https:"
      return `${secure ? "https" : "http"}://${url.hostname}:${url.port || (secure ? 443 : 80)}`
    },
    getWsUrl: () => {
      const serverUrl = get().getSetting(SETTINGS.backend_url.key)
      const url = new URL(serverUrl)
      const secure = url.protocol === "https:"
      return `${secure ? "wss" : "ws"}://${url.hostname}:${url.port || (secure ? 443 : 80)}/glasses-ws`
    },
    getCoreSettings: () => {
      const state = get()
      const coreSettings: Record<string, any> = {}
      CORE_SETTINGS_KEYS.forEach(key => {
        coreSettings[key] = state.getSetting(key)
      })
      return coreSettings
    },
  })),
)

export const useSetting = <T = any>(key: string): [T, (value: T) => Promise<void>] => {
  const value = useSettingsStore(state => state.getSetting(key))
  const setSetting = useSettingsStore(state => state.setSetting)
  return [value, (newValue: T) => setSetting(key, newValue)]
}

// export const useSetting = <T = any>(key: string): [T, (value: T) => Promise<void>] => {
//   const value = useSettingsStore(state => state.settings[key] as T)
//   const setSetting = useSettingsStore(state => state.setSetting)
//   return [value ?? SETTINGS[key].defaultValue, (newValue: T) => setSetting(key, newValue)]
// }

// Utility hooks for common patterns
// export const useSetting = <T = any>(key: string, index: string = ""): [T, (value: T) => Promise<void>] => {
//   key = useSettingsStore.getState().getSpecialCasesKey(key)
//   const value = useSettingsStore(state => state.settings[key] as T)
//   // return [value ?? SETTINGS[key].defaultValue, (newValue: T) => setSetting(key, newValue)]
//   // const value = useSettingsStore.getState().getSetting(key) as T
//   const setSetting = useSettingsStore(state => state.setSetting)
//   return [value ?? SETTINGS[key]?.defaultValue, (newValue: T) => setSetting(key, newValue)]
// }

// export const useSettings = (keys: string[]): Record<string, any> => {
//   return useSettingsStore(state => {
//     const result: Record<string, any> = {}
//     keys.forEach(key => {
//       result[key] = state.getSetting(key)
//     })
//     return result
//   })
// }
// Selectors for specific settings (memoized automatically by Zustand)
// export const useDevMode = () => useSetting<boolean>(SETTINGS.dev_mode.key)
// export const useNotificationsEnabled = () => useSetting<boolean>(SETTINGS.enable_phone_notifications.key)
// Example usage:
/**
 * // In a component:
 * function ThemeToggle() {
 *   const [theme, setTheme] = useTheme()
 *
 *   return (
 *     <Switch
 *       value={theme === 'dark'}
 *       onValueChange={(isDark) => setTheme(isDark ? 'dark' : 'light')}
 *     />
 *   )
 * }
 *
 * // Or with multiple settings:
 * function NotificationSettings() {
 *   const settings = useSettings([
 *     SETTINGS_KEYS.enable_phone_notifications,
 *     SETTINGS_KEYS.notification_app_preferences
 *   ])
 *   const setSetting = useSettingsStore(state => state.setSetting)
 *
 *   return (
 *     <Switch
 *       value={settings[SETTINGS_KEYS.enable_phone_notifications]}
 *       onValueChange={(enabled) =>
 *         setSetting(SETTINGS_KEYS.enable_phone_notifications, enabled)
 *       }
 *     />
 *   )
 * }
 *
 * // Subscribe to specific changes outside React:
 * const unsubscribe = useSettingsStore.subscribe(
 *   state => state.settings[SETTINGS_KEYS.theme_preference],
 *   (theme) => console.log('Theme changed to:', theme)
 * )
 */
