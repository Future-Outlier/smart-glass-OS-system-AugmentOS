export type CoreMessageEventPayload = {
  message: string
}

export type ChangeEventPayload = {
  value: string
}

// Core Event Types
export type ButtonPressEvent = {
  type: "button_press"
  buttonId: string
  pressType: "long" | "short"
  timestamp: string
}

export type TouchEvent = {
  type: "touch_event"
  device_model?: string
  gesture_name?: string
  timestamp: number
}

export type HeadUpEvent = {
  type: "head_up"
  up: boolean
}

export type LocalTranscriptionEvent = {
  type: "local_transcription"
  text: string
  isFinal?: boolean
  transcribeLanguage?: string
}

export type LogEvent = {
  type: "log"
  message: string
}

export type CoreStatusUpdateEvent = {
  type: "core_status_update"
  core_status: {
    glasses_info: Partial<GlassesStatus>
  }
}

export type WifiStatusChangeEvent = {
  type: "wifi_status_change"
  connected: boolean
  ssid: string
}

export type HotspotStatusChangeEvent = {
  type: "hotspot_status_change"
  enabled: boolean
  ssid: string
  password: string
  local_ip: string
}

export type HotspotErrorEvent = {
  type: "hotspot_error"
  error_message: string
  timestamp: string
}

export type GalleryStatusEvent = {
  type: "gallery_status"
  photos: number
  videos: number
  total: number
  has_content: boolean
  camera_busy: boolean
}

export type CompatibleGlassesSearchResultEvent = {
  type: "compatible_glasses_search_result"
  device_model: string
  device_name: string
  device_address: string
}

export type CompatibleGlassesSearchStopEvent = {
  type: "compatible_glasses_search_stop"
  device_model: string
}

export type HeartbeatSentEvent = {
  type: "heartbeat_sent"
  heartbeat_sent: {
    timestamp: string
  }
}

export type HeartbeatReceivedEvent = {
  type: "heartbeat_received"
  heartbeat_received: {
    timestamp: string
  }
}

export type NotifyManagerEvent = {
  type: "notify_manager" | "show_banner"
  notify_manager: {
    type: "success" | "error" | "info"
    message: string
  }
}

export type SwipeVolumeStatusEvent = {
  type: "swipe_volume_status"
  enabled: boolean
  timestamp: number
}

export type SwitchStatusEvent = {
  type: "switch_status"
  switch_type?: number
  switchType?: number
  switch_value?: number
  switchValue?: number
  timestamp: number
}

export type RgbLedControlResponseEvent = {
  type: "rgb_led_control_response"
  requestId: string
  success: boolean
  error?: string
}

export type WifiScanResultsEvent = {
  type: "wifi_scan_results"
  networks: Array<{
    ssid: string
    signalStrength: number
    secured: boolean
  }>
}

export type PairFailureEvent = {
  type: "pair_failure"
  error: string
}

export type AudioPairingNeededEvent = {
  type: "audio_pairing_needed"
  device_name: string
}

export type AudioConnectedEvent = {
  type: "audio_connected"
  device_name: string
}

export type AudioDisconnectedEvent = {
  type: "audio_disconnected"
}

export type SaveSettingEvent = {
  type: "save_setting"
  key: string
  value: any
}

export type PhoneNotificationEvent = {
  type: "phone_notification"
  notificationId: string
  app: string
  title: string
  content: string
  priority: number
  timestamp: string
  packageName: string
}

export type PhoneNotificationDismissedEvent = {
  type: "phone_notification_dismissed"
  notificationKey: string
  packageName: string
  notificationId: string
}

export type WsTextEvent = {
  type: "ws_text"
  text: string
}

export type WsBinEvent = {
  type: "ws_bin"
  base64: string
}

export type MicDataEvent = {
  type: "mic_data"
  base64: string
}

export type RtmpStreamStatusEvent = {
  type: "rtmp_stream_status"
  [key: string]: any
}

export type KeepAliveAckEvent = {
  type: "keep_alive_ack"
  [key: string]: any
}

export type MtkUpdateCompleteEvent = {
  type: "mtk_update_complete"
  message: string
  timestamp: string
}

export type OtaUpdateAvailableEvent = {
  type: "ota_update_available"
  version_code?: number
  version_name?: string
  updates?: string[]
  total_size?: number
}

export type OtaProgressEvent = {
  type: "ota_progress"
  stage?: OtaStage
  status?: OtaStatus
  progress?: number
  bytes_downloaded?: number
  total_bytes?: number
  current_update?: string
  error_message?: string
}

export type VersionInfoEvent = {
  type: "version_info"
  app_version: string
  build_number: string
  device_model: string
  android_version: string
  ota_version_url: string
  firmware_version: string
  bt_mac_address: string
}

// Union type of all core events
export type CoreEvent =
  | ButtonPressEvent
  | TouchEvent
  | HeadUpEvent
  | LocalTranscriptionEvent
  | LogEvent
  | CoreStatusUpdateEvent
  | WifiStatusChangeEvent
  | HotspotStatusChangeEvent
  | HotspotErrorEvent
  | GalleryStatusEvent
  | CompatibleGlassesSearchResultEvent
  | CompatibleGlassesSearchStopEvent
  | HeartbeatSentEvent
  | HeartbeatReceivedEvent
  | NotifyManagerEvent
  | SwipeVolumeStatusEvent
  | SwitchStatusEvent
  | RgbLedControlResponseEvent
  | WifiScanResultsEvent
  | PairFailureEvent
  | AudioPairingNeededEvent
  | AudioConnectedEvent
  | AudioDisconnectedEvent
  | SaveSettingEvent
  | PhoneNotificationEvent
  | PhoneNotificationDismissedEvent
  | WsTextEvent
  | WsBinEvent
  | MicDataEvent
  | RtmpStreamStatusEvent
  | KeepAliveAckEvent
  | MtkUpdateCompleteEvent
  | OtaUpdateAvailableEvent
  | OtaProgressEvent
  | VersionInfoEvent

export type CoreModuleEvents = {
  onEvent: (data: any) => void
  onChange: (params: ChangeEventPayload) => void
  onGlassesStatus: (changed: Partial<GlassesStatus>) => void
  onCoreStatus: (changed: Partial<CoreStatus>) => void
  // Individual event handlers
  onButtonPress: (event: ButtonPressEvent) => void
  onTouchEvent: (event: TouchEvent) => void
  onHeadUp: (event: HeadUpEvent) => void
  onLocalTranscription: (event: LocalTranscriptionEvent) => void
  onLog: (event: LogEvent) => void
  onCoreStatusUpdate: (event: CoreStatusUpdateEvent) => void
  onWifiStatusChange: (event: WifiStatusChangeEvent) => void
  onHotspotStatusChange: (event: HotspotStatusChangeEvent) => void
  onHotspotError: (event: HotspotErrorEvent) => void
  onGalleryStatus: (event: GalleryStatusEvent) => void
  onCompatibleGlassesSearchResult: (event: CompatibleGlassesSearchResultEvent) => void
  onCompatibleGlassesSearchStop: (event: CompatibleGlassesSearchStopEvent) => void
  onHeartbeatSent: (event: HeartbeatSentEvent) => void
  onHeartbeatReceived: (event: HeartbeatReceivedEvent) => void
  onNotifyManager: (event: NotifyManagerEvent) => void
  onSwipeVolumeStatus: (event: SwipeVolumeStatusEvent) => void
  onSwitchStatus: (event: SwitchStatusEvent) => void
  onRgbLedControlResponse: (event: RgbLedControlResponseEvent) => void
  onWifiScanResults: (event: WifiScanResultsEvent) => void
  onPairFailure: (event: PairFailureEvent) => void
  onAudioPairingNeeded: (event: AudioPairingNeededEvent) => void
  onAudioConnected: (event: AudioConnectedEvent) => void
  onAudioDisconnected: (event: AudioDisconnectedEvent) => void
  onSaveSetting: (event: SaveSettingEvent) => void
  onPhoneNotification: (event: PhoneNotificationEvent) => void
  onPhoneNotificationDismissed: (event: PhoneNotificationDismissedEvent) => void
  onWsText: (event: WsTextEvent) => void
  onWsBin: (event: WsBinEvent) => void
  onMicData: (event: MicDataEvent) => void
  onRtmpStreamStatus: (event: RtmpStreamStatusEvent) => void
  onKeepAliveAck: (event: KeepAliveAckEvent) => void
  onMtkUpdateComplete: (event: MtkUpdateCompleteEvent) => void
  onOtaUpdateAvailable: (event: OtaUpdateAvailableEvent) => void
  onOtaProgress: (event: OtaProgressEvent) => void
  onVersionInfo: (event: VersionInfoEvent) => void
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
  deviceModel: string,
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
  deviceModel: string
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
  lastLog: string[]
}
