import {create} from "zustand"
import {subscribeWithSelector} from "zustand/middleware"

export type GlassesConnectionState = "disconnected" | "connected" | "connecting"

export interface GlassesInfo {
  // state:
  connected: boolean
  micEnabled: boolean
  connectionState: GlassesConnectionState
  // device info
  modelName: string
  androidVersion: string
  fwVersion: string
  btMacAddress: string
  buildNumber: string
  otaVersionUrl: string
  appVersion: string
  bluetoothName: string
  serialNumber: string
  style: string
  color: string
  // wifi info
  wifiConnected: boolean
  wifiSsid: string
  wifiLocalIp: string
  // battery info
  batteryLevel: number
  charging: boolean
  caseBatteryLevel: number
  caseCharging: boolean
  caseOpen: boolean
  caseRemoved: boolean
  // hotspot info
  hotspotEnabled: boolean
  hotspotSsid: string
  hotspotPassword: string
  hotspotGatewayIp: string
}

interface GlassesState extends GlassesInfo {
  setGlassesInfo: (info: Partial<GlassesInfo>) => void
  setConnected: (connected: boolean) => void
  setBatteryInfo: (batteryLevel: number, charging: boolean, caseBatteryLevel: number, caseCharging: boolean) => void
  setWifiInfo: (connected: boolean, ssid: string) => void
  setHotspotInfo: (enabled: boolean, ssid: string, password: string, ip: string) => void
  reset: () => void
}

const initialState: GlassesInfo = {
  // state:
  connected: false,
  micEnabled: false,
  connectionState: "disconnected",
  // device info
  modelName: "",
  androidVersion: "",
  fwVersion: "",
  btMacAddress: "",
  buildNumber: "",
  otaVersionUrl: "",
  appVersion: "",
  bluetoothName: "",
  serialNumber: "",
  style: "",
  color: "",
  // wifi info
  wifiConnected: false,
  wifiSsid: "",
  wifiLocalIp: "",
  // battery info
  batteryLevel: -1,
  charging: false,
  caseBatteryLevel: -1,
  caseCharging: false,
  caseOpen: false,
  caseRemoved: true,
  // hotspot info
  hotspotEnabled: false,
  hotspotSsid: "",
  hotspotPassword: "",
  hotspotGatewayIp: "",
}

export const getGlasesInfoPartial = (state: GlassesInfo) => {
  return {
    batteryLevel: state.batteryLevel,
    charging: state.charging,
    caseBatteryLevel: state.caseBatteryLevel,
    caseCharging: state.caseCharging,
    connected: state.connected,
    wifiConnected: state.wifiConnected,
    wifiSsid: state.wifiSsid,
    modelName: state.modelName,
  }
}

export const useGlassesStore = create<GlassesState>()(
  subscribeWithSelector(set => ({
    ...initialState,

    setGlassesInfo: info => set(state => ({...state, ...info})),

    setConnected: connected => set({connected}),

    setBatteryInfo: (batteryLevel, charging, caseBatteryLevel, caseCharging) =>
      set({
        batteryLevel,
        charging,
        caseBatteryLevel,
        caseCharging,
      }),

    setWifiInfo: (connected, ssid) =>
      set({
        wifiConnected: connected,
        wifiSsid: ssid,
      }),

    setHotspotInfo: (enabled: boolean, ssid: string, password: string, ip: string) =>
      set({
        hotspotEnabled: enabled,
        hotspotSsid: ssid,
        hotspotPassword: password,
        hotspotGatewayIp: ip,
      }),

    reset: () => set(initialState),
  })),
)

export const waitForGlassesState = <K extends keyof GlassesInfo>(
  key: K,
  predicate: (value: GlassesInfo[K]) => boolean,
  timeoutMs = 1000
): Promise<boolean> => {
  return new Promise(resolve => {
    const state = useGlassesStore.getState()
    if (predicate(state[key])) {
      resolve(true)
      return
    }

    const unsubscribe = useGlassesStore.subscribe(
      s => s[key],
      value => {
        if (predicate(value)) {
          unsubscribe()
          resolve(true)
        }
      }
    )

    setTimeout(() => {
      unsubscribe()
      resolve(predicate(useGlassesStore.getState()[key]))
    }, timeoutMs)
  })
}
