export type CoreMessageEventPayload = {
  message: string
}

export type CoreModuleEvents = {
  onEvent: (data: any) => void
  onCoreEvent: (data: any) => void
  onChange: (params: ChangeEventPayload) => void
  onGlassesStatus: (changed: Partial<GlassesStatus>) => void
  onCoreStatus: (changed: Partial<CoreStatus>) => void
}

export type ChangeEventPayload = {
  value: string
}


export type GlassesConnectionState = "disconnected" | "connected" | "connecting"

// OTA update status types
export type OtaStage = "download" | "install"
export type OtaStatus = "STARTED" | "PROGRESS" | "FINISHED" | "FAILED"

export interface OtaUpdateInfo {
  available: boolean
  versionCode: number
  versionName: string
  updates: string[] // ["apk", "mtk", "bes"]
  totalSize: number
}

export interface OtaProgress {
  stage: OtaStage
  status: OtaStatus
  progress: number
  bytesDownloaded: number
  totalBytes: number
  currentUpdate: string
  errorMessage?: string
}

export interface GlassesStatus {
  // state:
  connected: boolean,
  micEnabled: boolean,
  connectionState: string,
  btcConnected: boolean,
  // device info
  modelName: string,
  androidVersion: string,
  fwVersion: string,
  btMacAddress: string,
  buildNumber: string,
  otaVersionUrl: string,
  appVersion: string,
  bluetoothName: string,
  serialNumber: string,
  style: string,
  color: string,
  // wifi info
  wifiConnected: boolean,
  wifiSsid: string,
  wifiLocalIp: string,
  // battery info
  batteryLevel: number
  charging: boolean
  caseBatteryLevel: number
  caseCharging: boolean
  caseOpen: boolean
  caseRemoved: boolean
  // hotspot info
  hotspotEnabled: boolean
  hotspotSsid: string,
  hotspotPassword: string,
  hotspotGatewayIp: string,
  // OTA update info
  otaUpdateAvailable: OtaUpdateInfo | null,
  otaProgress: OtaProgress | null,
  otaInProgress: boolean,
}

export type MicRanking = "auto" | "phone" | "glasses" | "bluetooth"

export interface DeviceSearchResult {
  modelName: string
  deviceName: string
  deviceAddress?: string
}

export interface CoreStatus {
  // state:
  searching: boolean
  systemMicUnavailable: boolean
  micRanking: MicRanking[]
  currentMic: MicRanking | null
  searchResults: DeviceSearchResult[]
}
