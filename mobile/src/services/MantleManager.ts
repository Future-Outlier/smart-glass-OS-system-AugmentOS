import CoreModule, { GlassesStatus } from "core"
import * as Calendar from "expo-calendar"
import * as Location from "expo-location"
import * as TaskManager from "expo-task-manager"
import {shallow} from "zustand/shallow"

import bridge from "@/bridge/MantleBridge"
import livekit from "@/services/Livekit"
import {migrate} from "@/services/Migrations"
import restComms from "@/services/RestComms"
import socketComms from "@/services/SocketComms"
import {gallerySyncService} from "@/services/asg/gallerySyncService"
import {useDisplayStore} from "@/stores/display"
import {useGlassesStore, getGlasesInfoPartial} from "@/stores/glasses"
import {useSettingsStore, SETTINGS} from "@/stores/settings"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import TranscriptProcessor from "@/utils/TranscriptProcessor"
import { useCoreStore } from "@/stores/core"
import Toast from "react-native-toast-message"
import { translate } from "@/i18n"
import udp from "@/services/UdpManager"

const LOCATION_TASK_NAME = "handleLocationUpdates"

// @ts-ignore
TaskManager.defineTask(LOCATION_TASK_NAME, ({data: {locations}, error}) => {
  if (error) {
    // check `error.message` for more details.
    // console.error("Error handling location updates", error)
    return
  }
  const locs = locations as Location.LocationObject[]
  if (locs.length === 0) {
    console.log("MANTLE: LOCATION: No locations received")
    return
  }

  // console.log("Received new locations", locations)
  const first = locs[0]!
  // socketComms.sendLocationUpdate(first.coords.latitude, first.coords.longitude, first.coords.accuracy ?? undefined)
  restComms.sendLocationData(first)
})

class MantleManager {
  private static instance: MantleManager | null = null
  private calendarSyncTimer: ReturnType<typeof setInterval> | null = null
  private clearTextTimeout: ReturnType<typeof setTimeout> | null = null
  private transcriptProcessor: TranscriptProcessor
  private coreMessageSubscription: any = null

  public static getInstance(): MantleManager {
    if (!MantleManager.instance) {
      MantleManager.instance = new MantleManager()
    }
    return MantleManager.instance
  }

  private constructor() {
    // Pass callback to send pending updates when timer fires
    this.transcriptProcessor = new TranscriptProcessor(() => {
      this.sendPendingTranscript()
    })
  }

  private sendPendingTranscript() {
    const pendingText = this.transcriptProcessor.getPendingUpdate()
    if (pendingText) {
      socketComms.handle_display_event({
        type: "display_event",
        view: "main",
        layout: {
          layoutType: "text_wall",
          text: pendingText,
        },
      })
    }
  }

  // run at app start on the init.tsx screen:
  // should only ever be run once
  // sets up the bridge and initializes app state
  public async init() {
    await migrate() // do any local migrations here
    const res = await restComms.loadUserSettings() // get settings from server
    if (res.is_ok()) {
      const loadedSettings = res.value
      await useSettingsStore.getState().setManyLocally(loadedSettings) // write settings to local storage
    } else {
      console.error("MANTLE: No settings received from server")
    }

    await CoreModule.onCoreStatus((changed) => {
      console.log("MANTLE: Core status changed", changed)
      useCoreStore.getState().setCoreInfo(changed)
    })

    await CoreModule.onGlassesStatus((changed) => {
      console.log("MANTLE: Glasses status changed", changed)
      useGlassesStore.getState().setGlassesInfo(changed)
    })

    await CoreModule.updateSettings(useSettingsStore.getState().getCoreSettings()) // send settings to core
    // send initial status request:
    await CoreModule.getStatus()

    this.initServices()
    this.setupPeriodicTasks()
    this.setupSubscriptions()
  }

  public async cleanup() {
    // Stop timers
    if (this.calendarSyncTimer) {
      clearInterval(this.calendarSyncTimer)
      this.calendarSyncTimer = null
    }
    if (this.coreMessageSubscription) {
      this.coreMessageSubscription.remove()
    }
    Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME)
    this.transcriptProcessor.clear()

    livekit.disconnect()
    socketComms.cleanup()
    restComms.goodbye()
  }

  private initServices() {
    socketComms.connectWebsocket()
    gallerySyncService.initialize()
  }

  private async setupPeriodicTasks() {
    this.sendCalendarEvents()
    // Calendar sync every hour
    this.calendarSyncTimer = setInterval(
      () => {
        this.sendCalendarEvents()
      },
      60 * 60 * 1000,
    ) // 1 hour
    try {
      let locationAccuracy = await useSettingsStore.getState().getSetting(SETTINGS.location_tier.key)
      let properAccuracy = this.getLocationAccuracy(locationAccuracy)
      Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: properAccuracy,
      })
    } catch (error) {
      console.error("MANTLE: Error starting location updates", error)
    }

    // check for requirements immediately, but only if we've passed through onboarding:
    // const onboardingCompleted = await useSettingsStore.getState().getSetting(SETTINGS.onboarding_completed.key)
    // if (onboardingCompleted) {
    //   try {
    //     const requirementsCheck = await checkConnectivityRequirementsUI()
    //     if (!requirementsCheck) {
    //       return
    //     }
    //     // give some time for the glasses to be fully ready:
    //     BackgroundTimer.setTimeout(async () => {
    //       await CoreModule.connectDefault()
    //     }, 3000)
    //   } catch (error) {
    //     console.error("connect to glasses error:", error)
    //     showAlert("Connection Error", "Failed to connect to glasses. Please try again.", [{text: "OK"}])
    //   }
    // }
  }

  private setupSubscriptions() {
    useGlassesStore.subscribe(
      getGlasesInfoPartial,
      (state: Partial<GlassesStatus>, previousState: Partial<GlassesStatus>) => {
        const statusObj: Partial<GlassesStatus> = {}

        for (const key in state) {
          const k = key as keyof GlassesStatus
          if (state[k] !== previousState[k]) {
            statusObj[k] = state[k] as any
          }
        }
        restComms.updateGlassesState(statusObj)
      },
      {equalityFn: shallow},
    )

    // subscribe to core settings changes and update the core:
    useSettingsStore.subscribe(
      (state) => state.getCoreSettings(),
      (state: Record<string, any>, previousState: Record<string, any>) => {
        const coreSettingsObj: Record<string, any> = {}

        for (const key in state) {
          const k = key as keyof Record<string, any>
          if (state[k] !== previousState[k]) {
            coreSettingsObj[k] = state[k] as any
          }
        }
        console.log("MANTLE: core settings changed", coreSettingsObj)
        CoreModule.updateSettings(coreSettingsObj)
      },
      {equalityFn: shallow},
    )

    // subscribe to the core:
    CoreModule.addListener("CoreMessageEvent", (event: any) => {
      this.handleCoreMessage(event.body)
    })
    if (this.coreMessageSubscription) {
      this.coreMessageSubscription.remove()
    }
    this.coreMessageSubscription = CoreModule.onTypedMessage(this.handleCoreMessage)
  }

  private async sendCalendarEvents() {
    try {
      console.log("MANTLE: sendCalendarEvents()")
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)
      const calendarIds = calendars.map((calendar: Calendar.Calendar) => calendar.id)
      // from 2 hours ago to 1 week from now:
      const startDate = new Date(Date.now() - 2 * 60 * 60 * 1000)
      const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      const events = await Calendar.getEventsAsync(calendarIds, startDate, endDate)
      restComms.sendCalendarData({events, calendars})
    } catch (error) {
      // it's fine if this fails
      console.log("MANTLE: Error sending calendar events", error)
    }
  }

  private async sendLocationUpdates() {
    console.log("MANTLE: sendLocationUpdates()")
    // const location = await Location.getCurrentPositionAsync()
    // socketComms.sendLocationUpdate(location)
  }

  public getLocationAccuracy(accuracy: string) {
    switch (accuracy) {
      case "realtime":
        return Location.LocationAccuracy.BestForNavigation
      case "tenMeters":
        return Location.LocationAccuracy.High
      case "hundredMeters":
        return Location.LocationAccuracy.Balanced
      case "kilometer":
        return Location.LocationAccuracy.Low
      case "threeKilometers":
        return Location.LocationAccuracy.Lowest
      case "reduced":
        return Location.LocationAccuracy.Lowest
      default:
        // console.error("MANTLE: unknown accuracy: " + accuracy)
        return Location.LocationAccuracy.Lowest
    }
  }

  public async setLocationTier(tier: string) {
    console.log("MANTLE: setLocationTier()", tier)
    // restComms.sendLocationData({tier})
    try {
      const accuracy = this.getLocationAccuracy(tier)
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME)
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: accuracy,
        pausesUpdatesAutomatically: false,
      })
    } catch (error) {
      console.log("MANTLE: Error setting location tier", error)
    }
  }

  public async requestSingleLocation(accuracy: string, correlationId: string) {
    console.log("MANTLE: requestSingleLocation()")
    // restComms.sendLocationData({tier})
    try {
      const location = await Location.getCurrentPositionAsync({accuracy: this.getLocationAccuracy(accuracy)})
      socketComms.sendLocationUpdate(
        location.coords.latitude,
        location.coords.longitude,
        location.coords.accuracy ?? undefined,
        correlationId,
      )
    } catch (error) {
      console.log("MANTLE: Error requesting single location", error)
    }
  }

  // mostly for debugging / local stt:
  public async displayTextMain(text: string) {
    this.resetDisplayTimeout()
    socketComms.handle_display_event({
      type: "display_event",
      view: "main",
      layout: {
        layoutType: "text_wall",
        text: text,
      },
    })
  }

  public async handle_head_up(isUp: boolean) {
    socketComms.sendHeadPosition(isUp)
    useDisplayStore.getState().setView(isUp ? "dashboard" : "main")
  }

  public async resetDisplayTimeout() {
    if (this.clearTextTimeout) {
      // console.log("MANTLE: canceling pending timeout")
      clearTimeout(this.clearTextTimeout)
    }
    this.clearTextTimeout = setTimeout(() => {
      console.log("MANTLE: clearing text from wall")
    }, 10000) // 10 seconds
  }

  public async handle_local_transcription(data: any) {
    // TODO: performance!
    const offlineStt = await useSettingsStore.getState().getSetting(SETTINGS.offline_captions_running.key)
    if (offlineStt) {
      this.transcriptProcessor.changeLanguage(data.transcribeLanguage)
      const processedText = this.transcriptProcessor.processString(data.text, data.isFinal ?? false)

      // Scheduling timeout to clear text from wall. In case of online STT online dashboard manager will handle it.
      // if (data.isFinal) {
      //   this.resetDisplayTimeout()
      // }

      if (processedText) {
        this.displayTextMain(processedText)
      }

      return
    }

    socketComms.sendLocalTranscription(data)
  }

  public async handle_button_press(id: string, type: string, timestamp: string) {
    // Emit event to React Native layer for handling
    GlobalEventEmitter.emit("BUTTON_PRESS", {
      buttonId: id,
      pressType: type,
      timestamp: timestamp,
    })
    socketComms.sendButtonPress(id, type)
  }


  private async handleCoreMessage(data: any) {
    if (!data) return

    try {
      if (!("type" in data)) {
        return
      }

      let binaryString
      let bytes
      let res

      switch (data.type) {
        case "core_status_update":
          useGlassesStore.getState().setGlassesInfo(data.core_status.glasses_info)
          GlobalEventEmitter.emit("core_status_update", data)
          return
        case "wifi_status_change":
          useGlassesStore.getState().setWifiInfo(data.connected, data.ssid)
          break
        case "hotspot_status_change":
          useGlassesStore.getState().setHotspotInfo(data.enabled, data.ssid, data.password, data.local_ip)
          GlobalEventEmitter.emit("hotspot_status_change", {
            enabled: data.enabled,
            ssid: data.ssid,
            password: data.password,
            local_ip: data.local_ip,
          })
          break
        case "hotspot_error":
          GlobalEventEmitter.emit("hotspot_error", {
            error_message: data.error_message,
            timestamp: data.timestamp,
          })
          break
        case "gallery_status":
          GlobalEventEmitter.emit("gallery_status", {
            photos: data.photos,
            videos: data.videos,
            total: data.total,
            has_content: data.has_content,
            camera_busy: data.camera_busy, // Add camera busy state
          })
          break
        case "compatible_glasses_search_result":
          console.log("Received compatible_glasses_search_result event from Core", data)
          GlobalEventEmitter.emit("compatible_glasses_search_result", {
            modelName: data.model_name,
            deviceName: data.device_name,
            deviceAddress: data.device_address,
          })
          break
        case "compatible_glasses_search_stop":
          GlobalEventEmitter.emit("compatible_glasses_search_stop", {
            model_name: data.model_name,
          })
          break
        case "heartbeat_sent":
          console.log("MAN: received heartbeat_sent event from Core", data.heartbeat_sent)
          GlobalEventEmitter.emit("heartbeat_sent", {
            timestamp: data.heartbeat_sent.timestamp,
          })
          break
        case "heartbeat_received":
          console.log("MAN: received heartbeat_received event from Core", data.heartbeat_received)
          GlobalEventEmitter.emit("heartbeat_received", {
            timestamp: data.heartbeat_received.timestamp,
          })
          break
        case "notify_manager":
        case "show_banner":
          Toast.show({
            type: data.notify_manager.type,
            text1: translate(data.notify_manager.message),
          })
          break
        case "button_press":
          console.log("🔘 BUTTON_PRESS event received:", data)
          this.handle_button_press(data.buttonId, data.pressType, data.timestamp)
          break
        case "touch_event": {
          const deviceModel = data.device_model ?? "Mentra Live"
          const gestureName = data.gesture_name ?? "unknown"
          const timestamp = typeof data.timestamp === "number" ? data.timestamp : Date.now()
          GlobalEventEmitter.emit("touch_event", {
            deviceModel,
            gestureName,
            timestamp,
          })
          socketComms.sendTouchEvent({
            device_model: deviceModel,
            gesture_name: gestureName,
            timestamp,
          })
          break
        }
        case "swipe_volume_status": {
          const enabled = !!data.enabled
          const timestamp = typeof data.timestamp === "number" ? data.timestamp : Date.now()
          socketComms.sendSwipeVolumeStatus(enabled, timestamp)
          GlobalEventEmitter.emit("SWIPE_VOLUME_STATUS", {enabled, timestamp})
          break
        }
        case "switch_status": {
          const switchType = typeof data.switch_type === "number" ? data.switch_type : (data.switchType ?? -1)
          const switchValue = typeof data.switch_value === "number" ? data.switch_value : (data.switchValue ?? -1)
          const timestamp = typeof data.timestamp === "number" ? data.timestamp : Date.now()
          socketComms.sendSwitchStatus(switchType, switchValue, timestamp)
          GlobalEventEmitter.emit("SWITCH_STATUS", {switchType, switchValue, timestamp})
          break
        }
        case "rgb_led_control_response": {
          const requestId = data.requestId ?? ""
          const success = !!data.success
          const errorMessage = typeof data.error === "string" ? data.error : null
          socketComms.sendRgbLedControlResponse(requestId, success, errorMessage)
          GlobalEventEmitter.emit("rgb_led_control_response", {requestId, success, error: errorMessage})
          break
        }
        case "wifi_scan_results":
          GlobalEventEmitter.emit("wifi_scan_results", {
            networks: data.networks,
          })
          break
        case "pair_failure":
          GlobalEventEmitter.emit("pair_failure", data.error)
          break
        case "audio_pairing_needed":
          GlobalEventEmitter.emit("audio_pairing_needed", {
            deviceName: data.device_name,
          })
          break
        case "audio_connected":
          GlobalEventEmitter.emit("audio_connected", {
            deviceName: data.device_name,
          })
          break
        case "audio_disconnected":
          GlobalEventEmitter.emit("audio_disconnected", {})
          break
        case "save_setting":
          await useSettingsStore.getState().setSetting(data.key, data.value)
          break
        case "head_up":
          this.handle_head_up(data.up)
          break
        case "local_transcription":
          this.handle_local_transcription(data)
          break
        case "phone_notification":
          // Send phone notification via REST instead of WebSocket
          res = await restComms.sendPhoneNotification({
            notificationId: data.notificationId,
            app: data.app,
            title: data.title,
            content: data.content,
            priority: data.priority,
            timestamp: data.timestamp,
            packageName: data.packageName,
          })
          if (res.is_error()) {
            console.error("Failed to send phone notification:", res.error)
          }
          break
        case "phone_notification_dismissed":
          // Send phone notification dismissal via REST
          res = await restComms.sendPhoneNotificationDismissed({
            notificationKey: data.notificationKey,
            packageName: data.packageName,
            notificationId: data.notificationId,
          })
          if (res.is_error()) {
            console.error("Failed to send phone notification dismissal:", res.error)
          }
          break
        // TODO: this is a bit of a hack, we should have dedicated functions for ws endpoints in the core:
        case "ws_text":
          socketComms.sendText(data.text)
          break
        case "ws_bin":
          binaryString = atob(data.base64)
          bytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          socketComms.sendBinary(bytes)
          break
        case "mic_data":
          // Route audio to: UDP (if enabled) -> WebSocket (fallback)
          if (socketComms.udpEnabledAndReady()) {
            // UDP audio is enabled and ready - send directly via UDP
            udp.sendAudio(data.base64)
          } else {
            // Fallback to WebSocket
            binaryString = atob(data.base64)
            bytes = new Uint8Array(binaryString.length)
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i)
            }
            if (__DEV__ && Math.random() < 0.03) {
              console.log("MantleBridge: Received mic data:", bytes.length, "bytes")
            }
            // NOTE: LiveKit audio path disabled - using UDP or WebSocket instead
            // const isChinaDeployment = await useSettingsStore.getState().getSetting(SETTINGS.china_deployment.key)
            // if (!isChinaDeployment && livekit.isRoomConnected()) {
            //   livekit.addPcm(bytes)
            // } else {
            //   socketComms.sendBinary(bytes)
            // }
            socketComms.sendBinary(bytes)
          }
          break
        case "rtmp_stream_status":
          console.log("MantleBridge: Forwarding RTMP stream status to server:", data)
          socketComms.sendRtmpStreamStatus(data)
          break
        case "keep_alive_ack":
          console.log("MantleBridge: Forwarding keep-alive ACK to server:", data)
          socketComms.sendKeepAliveAck(data)
          break
        case "mtk_update_complete":
          console.log("MantleBridge: MTK firmware update complete:", data.message)
          GlobalEventEmitter.emit("mtk_update_complete", {
            message: data.message,
            timestamp: data.timestamp,
          })
          break
        case "ota_update_available":
          console.log("📱 MantleBridge: OTA update available from glasses:", data)
          useGlassesStore.getState().setOtaUpdateAvailable({
            available: true,
            versionCode: data.version_code ?? 0,
            versionName: data.version_name ?? "",
            updates: data.updates ?? [],
            totalSize: data.total_size ?? 0,
          })
          GlobalEventEmitter.emit("ota_update_available", {
            versionCode: data.version_code,
            versionName: data.version_name,
            updates: data.updates,
            totalSize: data.total_size,
          })
          break
        case "ota_progress":
          console.log("📱 MantleBridge: OTA progress:", data.stage, data.status, data.progress + "%")
          useGlassesStore.getState().setOtaProgress({
            stage: data.stage ?? "download",
            status: data.status ?? "PROGRESS",
            progress: data.progress ?? 0,
            bytesDownloaded: data.bytes_downloaded ?? 0,
            totalBytes: data.total_bytes ?? 0,
            currentUpdate: data.current_update ?? "apk",
            errorMessage: data.error_message,
          })
          GlobalEventEmitter.emit("ota_progress", {
            stage: data.stage,
            status: data.status,
            progress: data.progress,
            bytesDownloaded: data.bytes_downloaded,
            totalBytes: data.total_bytes,
            currentUpdate: data.current_update,
            errorMessage: data.error_message,
          })
          // Clear OTA update available when finished or failed
          if (data.status === "FINISHED" || data.status === "FAILED") {
            useGlassesStore.getState().setOtaUpdateAvailable(null)
          }
          break
        case "version_info":
          console.log("MAN: Received version_info:", data)
          useGlassesStore.getState().setGlassesInfo({
            appVersion: data.app_version,
            buildNumber: data.build_number,
            modelName: data.device_model,
            androidVersion: data.android_version,
            otaVersionUrl: data.ota_version_url,
            fwVersion: data.firmware_version,
            btMacAddress: data.bt_mac_address,
          })
          break
        default:
          console.log("MAN: Unknown event type:", data.type)
          break
      }
    } catch (e) {
      console.error("MAN: Error parsing data from Core:", e)
    }
  }
}

const mantle = MantleManager.getInstance()
export default mantle
