import CoreModule, { CoreStatus, GlassesStatus } from "core"
import * as Calendar from "expo-calendar"
import * as Location from "expo-location"
import * as TaskManager from "expo-task-manager"
import {shallow} from "zustand/shallow"

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
  private coreStatusSubscription: any = null
  private coreGlassesStatusSubscription: any = null
  private coreEventSubscriptions: Array<any> = []

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
    console.log("MANTLE: init()")
    await migrate() // do any local migrations here
    const res = await restComms.loadUserSettings() // get settings from server
    if (res.is_ok()) {
      const loadedSettings = res.value
      await useSettingsStore.getState().setManyLocally(loadedSettings) // write settings to local storage
    } else {
      console.error("MANTLE: No settings received from server")
    }

    await CoreModule.updateCore(useSettingsStore.getState().getCoreSettings()) // send settings to core
    console.log("MANTLE: Settings sent to core")
    
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
    if (this.coreStatusSubscription) {
      this.coreStatusSubscription.remove()
    }
    if (this.coreGlassesStatusSubscription) {
      this.coreGlassesStatusSubscription.remove()
    }
    // Remove all event subscriptions
    this.coreEventSubscriptions.forEach(sub => sub.remove())
    this.coreEventSubscriptions = []

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

  private async setupSubscriptions() {
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
        // console.log("MANTLE: core settings changed", coreSettingsObj)
        CoreModule.updateCore(coreSettingsObj)
      },
      {equalityFn: shallow},
    )

    // subscribe to the core:
    if (this.coreStatusSubscription) {
      this.coreStatusSubscription.remove()
    }
    if (this.coreGlassesStatusSubscription) {
      this.coreGlassesStatusSubscription.remove()
    }
    // Remove old event subscriptions
    this.coreEventSubscriptions.forEach(sub => sub.remove())
    this.coreEventSubscriptions = []

    // forward core status changes to the zustand core store:
    this.coreEventSubscriptions.push(CoreModule.addListener("core_status", (changed: Partial<CoreStatus>) => {
      console.log("MANTLE: Core status changed", changed)
      useCoreStore.getState().setCoreInfo(changed)
    }))
    this.coreEventSubscriptions.push(CoreModule.addListener("glasses_status", (changed) => {
      // console.log("MANTLE: Glasses status changed", changed)
      useGlassesStore.getState().setGlassesInfo(changed)
    }))

    // Subscribe to individual core events
    let sub = CoreModule.addListener("log", (event) => {
      console.log("CORE:", event.message)
    })
    this.coreEventSubscriptions.push(sub)

    this.coreEventSubscriptions.push(
      CoreModule.addListener("wifi_status_change", (event) => {
        useGlassesStore.getState().setWifiInfo(event.connected, event.ssid)
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("hotspot_status_change", (event) => {
        useGlassesStore.getState().setHotspotInfo(event.enabled, event.ssid, event.password, event.local_ip)
        GlobalEventEmitter.emit("hotspot_status_change", {
          enabled: event.enabled,
          ssid: event.ssid,
          password: event.password,
          local_ip: event.local_ip,
        })
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("hotspot_error", (event) => {
        GlobalEventEmitter.emit("hotspot_error", {
          error_message: event.error_message,
          timestamp: event.timestamp,
        })
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("gallery_status", (event) => {
        GlobalEventEmitter.emit("gallery_status", {
          photos: event.photos,
          videos: event.videos,
          total: event.total,
          has_content: event.has_content,
          camera_busy: event.camera_busy,
        })
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("compatible_glasses_search_result", (event) => {
        console.log("Received compatible_glasses_search_result event from Core", event)
        GlobalEventEmitter.emit("compatible_glasses_search_result", {
          deviceModel: event.device_model,
          deviceName: event.device_name,
          deviceAddress: event.device_address,
        })
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("compatible_glasses_search_stop", (event) => {
        GlobalEventEmitter.emit("compatible_glasses_search_stop", {
          device_model: event.device_model,
        })
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("heartbeat_sent", (event) => {
        console.log("MANTLE: received heartbeat_sent event from Core", event.heartbeat_sent)
        GlobalEventEmitter.emit("heartbeat_sent", {
          timestamp: event.heartbeat_sent.timestamp,
        })
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("heartbeat_received", (event) => {
        console.log("MANTLE: received heartbeat_received event from Core", event.heartbeat_received)
        GlobalEventEmitter.emit("heartbeat_received", {
          timestamp: event.heartbeat_received.timestamp,
        })
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("notify_manager", (event) => {
        Toast.show({
          type: event.notify_manager.type,
          text1: translate(event.notify_manager.message),
        })
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("button_press", (event) => {
        console.log("🔘 BUTTON_PRESS event received:", event)
        this.handle_button_press(event.buttonId, event.pressType, event.timestamp)
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("touch_event", (event) => {
        const deviceModel = event.device_model ?? "Mentra Live"
        const gestureName = event.gesture_name ?? "unknown"
        const timestamp = typeof event.timestamp === "number" ? event.timestamp : Date.now()
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
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("swipe_volume_status", (event) => {
        const enabled = !!event.enabled
        const timestamp = typeof event.timestamp === "number" ? event.timestamp : Date.now()
        socketComms.sendSwipeVolumeStatus(enabled, timestamp)
        GlobalEventEmitter.emit("SWIPE_VOLUME_STATUS", {enabled, timestamp})
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("switch_status", (event) => {
        const switchType = typeof event.switch_type === "number" ? event.switch_type : (event.switchType ?? -1)
        const switchValue = typeof event.switch_value === "number" ? event.switch_value : (event.switchValue ?? -1)
        const timestamp = typeof event.timestamp === "number" ? event.timestamp : Date.now()
        socketComms.sendSwitchStatus(switchType, switchValue, timestamp)
        GlobalEventEmitter.emit("SWITCH_STATUS", {switchType, switchValue, timestamp})
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("rgb_led_control_response", (event) => {
        const requestId = event.requestId ?? ""
        const success = !!event.success
        const errorMessage = typeof event.error === "string" ? event.error : null
        socketComms.sendRgbLedControlResponse(requestId, success, errorMessage)
        GlobalEventEmitter.emit("rgb_led_control_response", {requestId, success, error: errorMessage})
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("wifi_scan_results", (event) => {
        GlobalEventEmitter.emit("wifi_scan_results", {
          networks: event.networks,
        })
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("pair_failure", (event) => {
        GlobalEventEmitter.emit("pair_failure", event.error)
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("audio_pairing_needed", (event) => {
        GlobalEventEmitter.emit("audio_pairing_needed", {
          deviceName: event.device_name,
        })
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("audio_connected", (event) => {
        GlobalEventEmitter.emit("audio_connected", {
          deviceName: event.device_name,
        })
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("audio_disconnected", () => {
        GlobalEventEmitter.emit("audio_disconnected", {})
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("save_setting", async (event) => {
        await useSettingsStore.getState().setSetting(event.key, event.value)
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("head_up", (event) => {
        mantle.handle_head_up(event.up)
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("local_transcription", (event) => {
        mantle.handle_local_transcription(event)
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("phone_notification", async (event) => {
        const res = await restComms.sendPhoneNotification({
          notificationId: event.notificationId,
          app: event.app,
          title: event.title,
          content: event.content,
          priority: event.priority,
          timestamp: event.timestamp,
          packageName: event.packageName,
        })
        if (res.is_error()) {
          console.error("Failed to send phone notification:", res.error)
        }
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("phone_notification_dismissed", async (event) => {
        const res = await restComms.sendPhoneNotificationDismissed({
          notificationKey: event.notificationKey,
          packageName: event.packageName,
          notificationId: event.notificationId,
        })
        if (res.is_error()) {
          console.error("Failed to send phone notification dismissal:", res.error)
        }
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("ws_text", (event) => {
        socketComms.sendText(event.text)
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("ws_bin", (event) => {
        const binaryString = atob(event.base64)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        socketComms.sendBinary(bytes)
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("mic_data", (event) => {
        // Route audio to: UDP (if enabled) -> WebSocket (fallback)
        if (socketComms.udpEnabledAndReady()) {
          // UDP audio is enabled and ready - send directly via UDP
          udp.sendAudio(event.base64)
        } else {
          // Fallback to WebSocket
          const binaryString = atob(event.base64)
          const bytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          if (__DEV__ && Math.random() < 0.03) {
            console.log("MANTLE: Received mic data:", bytes.length, "bytes")
          }
          socketComms.sendBinary(bytes)
        }
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("rtmp_stream_status", (event) => {
        console.log("MANTLE: Forwarding RTMP stream status to server:", event)
        socketComms.sendRtmpStreamStatus(event)
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("keep_alive_ack", (event) => {
        console.log("MANTLE: Forwarding keep-alive ACK to server:", event)
        socketComms.sendKeepAliveAck(event)
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("mtk_update_complete", (event) => {
        console.log("MANTLE: MTK firmware update complete:", event.message)
        GlobalEventEmitter.emit("mtk_update_complete", {
          message: event.message,
          timestamp: event.timestamp,
        })
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("ota_update_available", (event) => {
        console.log("📱 MANTLE: OTA update available from glasses:", event)
        useGlassesStore.getState().setOtaUpdateAvailable({
          available: true,
          versionCode: event.version_code ?? 0,
          versionName: event.version_name ?? "",
          updates: event.updates ?? [],
          totalSize: event.total_size ?? 0,
        })
        GlobalEventEmitter.emit("ota_update_available", {
          versionCode: event.version_code,
          versionName: event.version_name,
          updates: event.updates,
          totalSize: event.total_size,
        })
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("ota_progress", (event) => {
        console.log("📱 MANTLE: OTA progress:", event.stage, event.status, event.progress + "%")
        useGlassesStore.getState().setOtaProgress({
          stage: event.stage ?? "download",
          status: event.status ?? "PROGRESS",
          progress: event.progress ?? 0,
          bytesDownloaded: event.bytes_downloaded ?? 0,
          totalBytes: event.total_bytes ?? 0,
          currentUpdate: event.current_update ?? "apk",
          errorMessage: event.error_message,
        })
        GlobalEventEmitter.emit("ota_progress", {
          stage: event.stage,
          status: event.status,
          progress: event.progress,
          bytesDownloaded: event.bytes_downloaded,
          totalBytes: event.total_bytes,
          currentUpdate: event.current_update,
          errorMessage: event.error_message,
        })
        // Clear OTA update available when finished or failed
        if (event.status === "FINISHED" || event.status === "FAILED") {
          useGlassesStore.getState().setOtaUpdateAvailable(null)
        }
      })
    )

    this.coreEventSubscriptions.push(
      CoreModule.addListener("version_info", (event) => {
        console.log("MANTLE: Received version_info:", event)
        useGlassesStore.getState().setGlassesInfo({
          appVersion: event.app_version,
          buildNumber: event.build_number,
          deviceModel: event.device_model,
          androidVersion: event.android_version,
          otaVersionUrl: event.ota_version_url,
          fwVersion: event.firmware_version,
          btMacAddress: event.bt_mac_address,
        })
      })
    )

    // one time get all:
    const coreStatus = await CoreModule.getCoreStatus()
    useCoreStore.getState().setCoreInfo(coreStatus)

    const glassesStatus = await CoreModule.getGlassesStatus()
    useGlassesStore.getState().setGlassesInfo(glassesStatus)
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


}

const mantle = MantleManager.getInstance()
export default mantle
