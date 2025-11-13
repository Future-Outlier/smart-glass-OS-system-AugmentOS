import axios, {AxiosInstance, AxiosRequestConfig, AxiosError} from "axios"
import {ResultAsync, errAsync, okAsync} from "neverthrow"

import {GlassesInfo} from "@/stores/glasses"
import {SETTINGS_KEYS, useSettingsStore} from "@/stores/settings"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"

import {AppletInterface} from "@/../../cloud/packages/types/src"

interface RequestConfig {
  method: "GET" | "POST" | "DELETE"
  endpoint: string
  data?: any
  params?: any
  requiresAuth?: boolean
}

class RestComms {
  private static instance: RestComms
  private readonly TAG = "RestComms"
  private coreToken: string | null = null
  private axiosInstance: AxiosInstance

  private constructor() {
    this.axiosInstance = axios.create({
      headers: {
        "Content-Type": "application/json",
      },
    })
  }

  public static getInstance(): RestComms {
    if (!RestComms.instance) {
      RestComms.instance = new RestComms()
    }
    return RestComms.instance
  }

  // Token Management
  public setCoreToken(token: string | null): void {
    this.coreToken = token
    console.log(
      `${this.TAG}: Core token ${token ? "set" : "cleared"} - Length: ${token?.length || 0} - First 20 chars: ${
        token?.substring(0, 20) || "null"
      }`,
    )

    if (token) {
      console.log(`${this.TAG}: Core token set, emitting CORE_TOKEN_SET event`)
      GlobalEventEmitter.emit("CORE_TOKEN_SET")
    }
  }

  public getCoreToken(): string | null {
    return this.coreToken
  }

  // Helper Methods
  private validateToken(): ResultAsync<void, Error> {
    if (!this.coreToken) {
      return errAsync(new Error("No core token available for authentication"))
    }
    return okAsync(undefined)
  }

  private createAuthHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.coreToken}`,
    }
  }

  private makeRequest<T>(config: RequestConfig): ResultAsync<T, Error> {
    const {method, endpoint, data, params, requiresAuth = true} = config

    const baseUrl = useSettingsStore.getState().getRestUrl()
    const url = `${baseUrl}${endpoint}`
    console.log(`REST ${method}:${url}`)

    const headers = requiresAuth ? this.createAuthHeaders() : {"Content-Type": "application/json"}

    const axiosConfig: AxiosRequestConfig = {
      method,
      url,
      headers,
      data,
      params,
    }

    return ResultAsync.fromPromise(
      this.axiosInstance.request<T>(axiosConfig).then(response => response.data),
      (error: unknown) => {
        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError<{error?: string}>
          const errorMessage = axiosError.response?.data?.error || axiosError.message || "Request failed"
          return new Error(errorMessage)
        }
        return error instanceof Error ? error : new Error(String(error))
      },
    )
  }

  private authenticatedRequest<T>(config: RequestConfig): ResultAsync<T, Error> {
    return this.validateToken().andThen(() => this.makeRequest<T>({...config, requiresAuth: true}))
  }

  private unauthenticatedRequest<T>(config: RequestConfig): ResultAsync<T, Error> {
    return this.makeRequest<T>({...config, requiresAuth: false})
  }

  // Public API Methods

  public getMinimumClientVersion(): ResultAsync<{required: string; recommended: string}, Error> {
    interface Response {
      success: boolean
      data: {required: string; recommended: string}
    }
    const config: RequestConfig = {
      method: "GET",
      endpoint: "/api/client/min-version",
    }
    const result = this.unauthenticatedRequest<Response>(config)
    return result.map(response => response.data)
  }

  public checkAppHealthStatus(packageName: string): ResultAsync<boolean, Error> {
    const config: RequestConfig = {
      method: "POST",
      endpoint: "/api/app-uptime/app-pkg-health-check",
      data: {packageName},
    }

    interface Response {
      success: boolean
    }

    const result = this.authenticatedRequest<Response>(config)
    return result.map(response => response.success)
  }

  public getApplets(): ResultAsync<AppletInterface[], Error> {
    interface Response {
      success: boolean
      data: AppletInterface[]
    }
    const config: RequestConfig = {
      method: "GET",
      endpoint: "/api/client/apps",
    }
    let result = this.authenticatedRequest<Response>(config)
    let data = result.map(response => response.data)
    return data
  }

  public startApp(packageName: string): ResultAsync<any, Error> {
    const config: RequestConfig = {
      method: "POST",
      endpoint: `/apps/${packageName}/start`,
    }
    interface Response {
      success: boolean
      data: any
    }
    const result = this.authenticatedRequest<Response>(config)
    return result.map(response => response.data)
  }

  public stopApp(packageName: string): ResultAsync<any, Error> {
    const config: RequestConfig = {
      method: "POST",
      endpoint: `/apps/${packageName}/stop`,
    }
    interface Response {
      success: boolean
      data: any
    }
    const result = this.authenticatedRequest<Response>(config)
    return result.map(response => response.data)
  }

  public uninstallApp(packageName: string): ResultAsync<any, Error> {
    const config: RequestConfig = {
      method: "POST",
      endpoint: `/api/apps/uninstall/${packageName}`,
    }
    interface Response {
      success: boolean
      data: any
    }
    const result = this.authenticatedRequest<Response>(config)
    return result.map(response => response.data)
  }

  // App Settings
  public getAppSettings(appName: string): ResultAsync<any, Error> {
    const config: RequestConfig = {
      method: "GET",
      endpoint: `/appsettings/${appName}`,
    }
    interface Response {
      success: boolean
      data: any
    }
    const result = this.authenticatedRequest<Response>(config)
    return result.map(response => response.data)
  }

  public updateAppSetting(appName: string, update: {key: string; value: any}): ResultAsync<any, Error> {
    const config: RequestConfig = {
      method: "POST",
      endpoint: `/appsettings/${appName}`,
      data: update,
    }
    interface Response {
      success: boolean
      data: any
    }
    const result = this.authenticatedRequest<Response>(config)
    return result.map(response => response.data)
  }

  public updateGlassesState(state: Partial<GlassesInfo>): ResultAsync<void, Error> {
    const config: RequestConfig = {
      method: "POST",
      endpoint: "/api/client/device/state",
      data: state,
    }
    interface Response {
      success: boolean
    }
    const result = this.authenticatedRequest<Response>(config)
    return result.map(() => undefined)
  }

  public exchangeToken(token: string): ResultAsync<string, Error> {
    const isChina: string = useSettingsStore.getState().getSetting(SETTINGS_KEYS.china_deployment)

    const config: RequestConfig = {
      method: "POST",
      endpoint: "/auth/exchange-token",
      data: {
        supabaseToken: !isChina ? token : undefined,
        authingToken: isChina ? token : undefined,
      },
    }
    interface Response {
      coreToken: string
    }
    const result = this.makeRequest<Response>(config)
    let res: ResultAsync<string, Error> = result.map(response => response.coreToken)
    // set the core token in the store:
    res.then(result => {
      if (result.isOk()) {
        this.setCoreToken(result.value)
      }
    })
    return res
  }

  public generateWebviewToken(
    packageName: string,
    endpoint: string = "generate-webview-token",
  ): ResultAsync<string, Error> {
    const config: RequestConfig = {
      method: "POST",
      endpoint: `/api/auth/${endpoint}`,
      data: {packageName},
    }
    interface Response {
      token: string
    }
    const result = this.authenticatedRequest<Response>(config)
    return result.map(response => response.token)
  }

  public hashWithApiKey(stringToHash: string, packageName: string): ResultAsync<string, Error> {
    const config: RequestConfig = {
      method: "POST",
      endpoint: "/api/auth/hash-with-api-key",
      data: {stringToHash, packageName},
    }
    interface Response {
      hash: string
    }
    const result = this.authenticatedRequest<Response>(config)
    return result.map(response => response.hash)
  }

  // Account Management
  public requestAccountDeletion(): ResultAsync<any, Error> {
    const config: RequestConfig = {
      method: "POST",
      endpoint: "/api/account/request-deletion",
    }
    interface Response {
      success: boolean
    }
    const result = this.authenticatedRequest<Response>(config)
    return result
  }

  public confirmAccountDeletion(requestId: string, confirmationCode: string): ResultAsync<any, Error> {
    const config: RequestConfig = {
      method: "DELETE",
      endpoint: "/api/account/confirm-deletion",
      data: {requestId, confirmationCode},
    }
    interface Response {
      success: boolean
    }
    const result = this.authenticatedRequest<Response>(config)
    return result
  }

  public getLivekitUrlAndToken(): ResultAsync<{url: string; token: string}, Error> {
    const config: RequestConfig = {
      method: "GET",
      endpoint: "/api/client/livekit/token",
    }
    interface Response {
      // url: string
      // token: string
      success: boolean
      data: {url: string; token: string}
    }
    const result = this.authenticatedRequest<Response>(config)

    ;(async () => {
      console.log("result@@@@@", await result)
      // const response = await result.value
      // return {url: response.url, token: response.token}
    })()
    return result.map(response => response.data)
  }

  // User Feedback & Settings
  public sendFeedback(feedbackBody: string): ResultAsync<void, Error> {
    const config: RequestConfig = {
      method: "POST",
      endpoint: "/api/client/feedback",
      data: {feedback: feedbackBody},
    }
    interface Response {
      success: boolean
    }
    const result = this.authenticatedRequest<Response>(config)
    return result.map(() => undefined)
  }

  public writeUserSettings(settings: any): ResultAsync<void, Error> {
    const config: RequestConfig = {
      method: "POST",
      endpoint: "/api/client/user/settings",
      data: {settings},
    }
    interface Response {
      success: boolean
    }
    const result = this.authenticatedRequest<Response>(config)
    return result.map(() => undefined)
  }

  public loadUserSettings(): ResultAsync<any, Error> {
    const config: RequestConfig = {
      method: "GET",
      endpoint: "/api/client/user/settings",
    }
    interface Response {
      success: boolean
      data: any
    }
    const result = this.authenticatedRequest<Response>(config)
    return result.map(response => response.data)
  }

  // Error Reporting
  public sendErrorReport(reportData: any): ResultAsync<void, Error> {
    const config: RequestConfig = {
      method: "POST",
      endpoint: "/app/error-report",
      data: reportData,
    }
    interface Response {
      success: boolean
      data: any
    }
    const result = this.authenticatedRequest<Response>(config)
    return result.map(() => undefined)
  }

  // Calendar
  public sendCalendarData(data: any): ResultAsync<void, Error> {
    const config: RequestConfig = {
      method: "POST",
      endpoint: "/api/client/calendar",
      data: data,
    }
    interface Response {
      success: boolean
      data: any
    }
    const result = this.authenticatedRequest<Response>(config)
    return result.map(() => undefined)
  }

  // Location
  public sendLocationData(data: any): ResultAsync<void, Error> {
    const config: RequestConfig = {
      method: "POST",
      endpoint: "/api/client/location",
      data: data,
    }
    interface Response {
      success: boolean
      data: any
    }
    const result = this.authenticatedRequest<Response>(config)
    return result.map(() => undefined)
  }

  // Phone Notifications
  public sendPhoneNotification(data: {
    notificationId: string
    app: string
    title: string
    content: string
    priority: string
    timestamp: number
    packageName: string
  }): ResultAsync<any, Error> {
    const config: RequestConfig = {
      method: "POST",
      endpoint: "/api/client/notifications",
      data: data,
    }
    interface Response {
      success: boolean
      data: any
    }
    const result = this.authenticatedRequest<Response>(config)
    return result.map(() => undefined)
  }

  public sendPhoneNotificationDismissed(data: {
    notificationId: string
    notificationKey: string
    packageName: string
  }): ResultAsync<any, Error> {
    const config: RequestConfig = {
      method: "POST",
      endpoint: "/api/client/notifications/dismissed",
      data: data,
    }
    interface Response {
      success: boolean
      data: any
    }
    const result = this.authenticatedRequest<Response>(config)
    return result.map(() => undefined)
  }
}

const restComms = RestComms.getInstance()
export default restComms
