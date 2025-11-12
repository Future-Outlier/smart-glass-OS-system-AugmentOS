// import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
// import {SETTINGS_KEYS, useSettingsStore} from "@/stores/settings"
// import {AppletInterface} from "@/../../cloud/packages/types/src"

// interface ApiResponse<T = any> {
//   success?: boolean
//   data?: T
//   error?: string
//   token?: string
//   [key: string]: any
// }

// interface RequestConfig {
//   method: "GET" | "POST" | "DELETE"
//   url: string
//   headers?: Record<string, string>
//   data?: any
//   params?: any
// }

// class RestComms {
//   private static instance: RestComms
//   private readonly TAG = "RestComms"
//   private coreToken: string | null = null

//   private constructor() {}

//   public static getInstance(): RestComms {
//     if (!RestComms.instance) {
//       RestComms.instance = new RestComms()
//     }
//     return RestComms.instance
//   }

//   // Token Management
//   public setCoreToken(token: string | null): void {
//     this.coreToken = token
//     console.log(
//       `${this.TAG}: Core token ${token ? "set" : "cleared"} - Length: ${token?.length || 0} - First 20 chars: ${
//         token?.substring(0, 20) || "null"
//       }`,
//     )

//     if (token) {
//       console.log(`${this.TAG}: Core token set, emitting CORE_TOKEN_SET event`)
//       GlobalEventEmitter.emit("CORE_TOKEN_SET")
//     }
//   }

//   public getCoreToken(): string | null {
//     return this.coreToken
//   }

//   // Helper Methods
//   private validateToken(): void {
//     if (!this.coreToken) {
//       throw new Error("No core token available for authentication")
//     }
//   }

//   private createAuthHeaders(): Record<string, string> {
//     return {
//       "Content-Type": "application/json",
//       "Authorization": `Bearer ${this.coreToken}`,
//     }
//   }

//   private buildUrlWithParams(url: string, params?: any): string {
//     if (!params) return url

//     const queryString = Object.keys(params)
//       .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
//       .join("&")

//     return `${url}?${queryString}`
//   }

//   private async makeRequest<T = any>(config: RequestConfig): Promise<T> {
//     const {method, url, headers, data, params} = config
//     try {
//       const fullUrl = this.buildUrlWithParams(url, params)

//       const fetchConfig: RequestInit = {
//         method,
//         headers: headers || {},
//       }

//       // Add body for POST and DELETE requests if data exists
//       if ((method === "POST" || method === "DELETE") && data) {
//         fetchConfig.body = JSON.stringify(data)
//       }

//       const response = await fetch(fullUrl, fetchConfig)
//       status = response.status

//       if (!response.ok) {
//         // Try to parse error response
//         let errorMessage = `Bad response: ${response.statusText}`
//         try {
//           const errorData = await response.json()
//           if (errorData.error) {
//             errorMessage = errorData.error
//           }
//         } catch {
//           // If we can't parse the error response, use the default message
//         }
//         return {
//           success: false,
//           error: errorMessage,
//         } as T
//       }

//       // Parse JSON response
//       const responseData = await response.json()
//       return responseData as T
//     } catch (error: any) {
//       const errorMessage = error.message || error
//       // console.error(`${this.TAG}: ${method} to ${url} failed with status ${status}`, errorMessage)
//       return {
//         success: false,
//         error: errorMessage,
//         data: null,
//       } as T
//     }
//   }

//   private async authenticatedRequest<T = any>(
//     method: "GET" | "POST" | "DELETE",
//     endpoint: string,
//     data?: any,
//     params?: any,
//   ): Promise<T> {
//     try {
//       this.validateToken()
//     } catch (error: any) {
//       const errorMessage = error.message || error
//       return {
//         success: false,
//         error: errorMessage,
//         data: null,
//       } as T
//     }

//     const baseUrl = await useSettingsStore.getState().getRestUrl()
//     const url = `${baseUrl}${endpoint}`

//     console.log(`REST ${method}:${url}`)

//     const config: RequestConfig = {
//       method,
//       url,
//       headers: this.createAuthHeaders(),
//       data,
//       params,
//     }

//     return this.makeRequest<T>(config)
//   }

//   private async request<T = any>(
//     method: "GET" | "POST" | "DELETE",
//     endpoint: string,
//     data?: any,
//     params?: any,
//   ): Promise<T> {
//     const baseUrl = await useSettingsStore.getState().getRestUrl()
//     const url = `${baseUrl}${endpoint}`
//     const config: RequestConfig = {
//       method,
//       url,
//       headers: this.createAuthHeaders(),
//       data,
//       params,
//     }
//     return this.makeRequest<T>(config)
//   }

//   // Public API Methods

//   public async getMinimumClientVersion(): Promise<ApiResponse<{required: string; recommended: string}>> {
//     const response = await this.request("GET", "/api/client/min-version")
//     return response.data
//   }

//   public async checkAppHealthStatus(packageName: string): Promise<boolean> {
//     // GET the app's /health endpoint
//     try {
//       const baseUrl = await useSettingsStore.getState().getRestUrl()
//       // POST /api/app-uptime/app-pkg-health-check with body { "packageName": packageName }
//       const healthUrl = `${baseUrl}/api/app-uptime/app-pkg-health-check`
//       const healthResponse = await fetch(healthUrl, {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify({packageName}),
//       })
//       const healthData = await healthResponse.json()
//       return healthData.success
//     } catch (error) {
//       console.error("AppStatusProvider: Error checking app health status:", error)
//       return false
//     }
//   }

//   // App Management
//   // public async getApps(): Promise<AppletInterface[]> {
//   //   console.log(`${this.TAG}: getApps() called`)
//   //   const response = await this.authenticatedRequest<ApiResponse<AppletInterface[]>>("GET", "/api/apps/")
//   //   if (!response.success || !response.data) {
//   //     throw new Error("Invalid response format")
//   //   }
//   //   return response.data
//   // }

//   public async getApplets(): Promise<AppletInterface[]> {
//     // console.log(`${this.TAG}: getApps() called`)

//     const response = await this.authenticatedRequest<ApiResponse<AppletInterface[]>>("GET", "/api/client/apps")

//     if (!response.success || !response.data) {
//       // console.error("Invalid response format calling getApps()")
//       return []
//     }

//     return response.data
//   }

//   public async startApp(packageName: string): Promise<any> {
//     try {
//       const response = await this.authenticatedRequest("POST", `/apps/${packageName}/start`)
//       console.log("App started successfully:", packageName)
//       return response
//     } catch (error: any) {
//       GlobalEventEmitter.emit("SHOW_BANNER", {
//         message: `Could not connect to ${packageName}`,
//         type: "error",
//       })
//       throw error
//     }
//   }

//   public async stopApp(packageName: string): Promise<any> {
//     const response = await this.authenticatedRequest("POST", `/apps/${packageName}/stop`)
//     console.log("App stopped successfully:", packageName)
//     return response
//   }

//   public async uninstallApp(packageName: string): Promise<any> {
//     const response = await this.authenticatedRequest("POST", `/api/apps/uninstall/${packageName}`)
//     console.log("App uninstalled successfully:", packageName)
//     return response
//   }

//   // App Settings
//   public async getAppSettings(appName: string): Promise<any> {
//     return this.authenticatedRequest("GET", `/appsettings/${appName}`)
//   }

//   public async updateAppSetting(appName: string, update: {key: string; value: any}): Promise<any> {
//     return this.authenticatedRequest("POST", `/appsettings/${appName}`, update)
//   }

//   public async exchangeToken(token: string): Promise<string> {
//     const isChina = await useSettingsStore.getState().getSetting(SETTINGS_KEYS.china_deployment)
//     const baseUrl = await useSettingsStore.getState().getRestUrl()
//     const url = `${baseUrl}/auth/exchange-token`

//     const config: RequestConfig = {
//       method: "POST",
//       url,
//       headers: {"Content-Type": "application/json"},
//       data: {
//         supabaseToken: !isChina ? token : undefined,
//         authingToken: isChina ? token : undefined,
//       },
//     }

//     const response = await this.makeRequest<ApiResponse>(config)

//     if (!response.coreToken) {
//       throw new Error("No core token in response")
//     }

//     this.setCoreToken(response.coreToken)
//     return response.coreToken
//   }

//   public async generateWebviewToken(packageName: string, endpoint: string = "generate-webview-token"): Promise<string> {
//     const response = await this.authenticatedRequest<ApiResponse>("POST", `/api/auth/${endpoint}`, {packageName})

//     if (!response.success || !response.token) {
//       throw new Error(`Failed to generate webview token: ${response.error || "Unknown error"}`)
//     }

//     console.log(`Received temporary webview token for ${packageName}`)
//     return response.token
//   }

//   public async hashWithApiKey(stringToHash: string, packageName: string): Promise<string> {
//     const response = await this.authenticatedRequest<ApiResponse>("POST", "/api/auth/hash-with-api-key", {
//       stringToHash,
//       packageName,
//     })

//     if (!response.success || !response.hash) {
//       throw new Error(`Failed to generate hash: ${response.error || "Unknown error"}`)
//     }

//     return response.hash
//   }

//   // Account Management
//   public async requestAccountDeletion(): Promise<any> {
//     return this.authenticatedRequest("POST", "/api/account/request-deletion")
//   }

//   public async confirmAccountDeletion(requestId: string, confirmationCode: string): Promise<any> {
//     return this.authenticatedRequest("DELETE", "/api/account/confirm-deletion", {requestId, confirmationCode})
//   }

//   public async getLivekitUrlAndToken(): Promise<{url: string; token: string}> {
//     const response = await this.authenticatedRequest("GET", "/api/client/livekit/token")
//     const {url, token} = response.data
//     return {url, token}
//   }

//   // User Feedback & Settings
//   public async sendFeedback(feedbackBody: string): Promise<void> {
//     await this.authenticatedRequest("POST", "/api/client/feedback", {feedback: feedbackBody})
//   }

//   public async writeUserSettings(settings: any): Promise<void> {
//     await this.authenticatedRequest("POST", "/api/client/user/settings", {settings})
//   }

//   public async loadUserSettings(): Promise<any> {
//     let response = await this.authenticatedRequest("GET", "/api/client/user/settings")
//     return response.data
//   }

//   // Error Reporting
//   public async sendErrorReport(reportData: any): Promise<any> {
//     return this.authenticatedRequest("POST", "/app/error-report", reportData)
//   }

//   // Calendar
//   // { events: any[], calendars: any[] }
//   public async sendCalendarData(data: any): Promise<any> {
//     return this.authenticatedRequest("POST", "/api/client/calendar", data)
//   }

//   // Location
//   public async sendLocationData(data: any): Promise<any> {
//     return this.authenticatedRequest("POST", "/api/client/location", data)
//   }

//   // Phone Notifications
//   public async sendPhoneNotification(data: {
//     notificationId: string
//     app: string
//     title: string
//     content: string
//     priority: string
//     timestamp: number
//     packageName: string
//   }): Promise<any> {
//     return this.authenticatedRequest("POST", "/api/client/notifications", data)
//   }

//   public async sendPhoneNotificationDismissed(data: {
//     notificationId: string
//     notificationKey: string
//     packageName: string
//   }): Promise<any> {
//     return this.authenticatedRequest("POST", "/api/client/notifications/dismissed", data)
//   }
// }

// const restComms = RestComms.getInstance()
// export default restComms

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
